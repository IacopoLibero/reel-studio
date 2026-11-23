import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { agentCommand, requireSkill } from "../ai/agent.js";
import { allocateReelFolder } from "../factory/allocator.js";
import { jobEnv } from "../env.js";
import type { Handler } from "../jobs/handlers.js";
import { runProcess } from "../jobs/process.js";
import { carouselDirOf } from "./scanner.js";
import { buildCarouselPrompt, CAROUSEL_ALLOWED_TOOLS, carouselDenied } from "./prompt.js";
import { CAROUSEL_MARKS, CAROUSEL_STEPS, carouselStepOf, missingCarouselOutputs } from "./stream.js";

const execFileP = promisify(execFile);
/** The two Ootto skills every carousel is built on: the structure (what carousels in the niche save) and the words of every slide. */
export const CAROUSEL_SKILLS = ["ootto-viral-carousel", "ootto-carousel-builder"] as const;

const listFiles = (dir: string): string[] => { try { return readdirSync(dir); } catch { return []; } };
const short = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** carousel.make: the AI tool builds one finished carousel (2D in Remotion, or 3D in Blender cut into slides) in <brand>/carousels/<n>-<name>/. */
export const carouselMake: Handler = async (job, ctx) => {
  if (!ctx.brand) throw new Error("This job needs a brand.");
  const p = job.params as { topic: string; style: "2d" | "3d"; slides: number; closing: "A" | "B"; rerunFolder?: string; note?: string };
  const brand = ctx.brand;
  const carouselsDir = brand.paths.carouselsDir;
  const redo = typeof p.rerunFolder === "string" && /^\d+-[a-z0-9-]+$/.test(p.rerunFolder) ? p.rerunFolder : null;
  const alloc = redo ? { folder: redo, path: carouselDirOf(carouselsDir, redo) } : await allocateReelFolder(carouselsDir, p.topic, join(ctx.dataDir, "locks"), brand.slug, "carousel");
  if (redo && !existsSync(alloc.path)) throw new Error(`Folder ${redo} to redo does not exist.`);
  ctx.update({ log: `Folder ${alloc.path}, style ${p.style}, ${p.slides} slides`, step: CAROUSEL_STEPS[0], progress: CAROUSEL_MARKS[0] as number });

  // The two Ootto skills are linked into the workspace before the run (a studio made before the carousels may have them off).
  try { await execFileP("bash", [join(ctx.root, "scripts", "ootto-skills.sh"), "enable", ...CAROUSEL_SKILLS.map((s) => s.replace(/^ootto-/, ""))], { cwd: ctx.root, timeout: 20_000 }); }
  catch (e) { ctx.update({ log: `Warning: could not turn the carousel skills on (${short((e as Error).message, 120)}).` }); }
  const productDir = brand.brand.sources.productDir?.trim() || null;
  const prompt = buildCarouselPrompt({ root: ctx.root, brand: brand.slug, brandDir: brand.paths.brandDir, folder: alloc.folder, topic: p.topic, style: p.style, slides: p.slides, closing: p.closing, productDir, ...(p.note ? { note: p.note } : {}), brandInfo: brand.brand });
  const agent = agentCommand(ctx, { access: "edit", allowedTools: CAROUSEL_ALLOWED_TOOLS, deniedTools: carouselDenied(productDir), addDirs: [brand.paths.brandDir], ...(productDir ? { readDirs: [productDir] } : {}) });

  const skills: string[] = [];
  let step = 0; let summary = ""; let failed = false; let lastError = ""; let stderrLast = "";
  const poll = () => {
    const present = listFiles(alloc.path);
    const i = carouselStepOf(present, p.slides);
    const done = present.filter((f) => /^slide-\d+\.png$/.test(f)).length;
    const progress = i === 2 ? (CAROUSEL_MARKS[1] as number) + ((CAROUSEL_MARKS[2] as number) - (CAROUSEL_MARKS[1] as number)) * Math.min(1, done / Math.max(1, p.slides)) : (CAROUSEL_MARKS[i] as number);
    if (i > step || i === 2) { step = Math.max(step, i); ctx.update({ stepIndex: step, step: CAROUSEL_STEPS[step] as string, progress }); }
  };
  const timer = setInterval(poll, 2000);
  try {
    const code = await runProcess({
      cmd: agent.cmd, args: agent.args, cwd: ctx.root, env: jobEnv(ctx.settings, brand.slug), stdin: agent.prompt(prompt), signal: ctx.signal,
      onLine: (line, stream) => {
        if (stream === "err") { if (line.trim()) { stderrLast = line.slice(0, 300); ctx.update({ log: `[stderr] ${stderrLast}` }); } return; }
        for (const ev of agent.parse(line)) {
          if (ev.kind === "tool" && ev.name === "Skill") {
            const sk = String(ev.input.skill ?? ev.input.command ?? "").replace(/^\//, "");
            if (sk && !skills.includes(sk)) { skills.push(sk); ctx.update({ log: `SKILL CALLED: ${sk}` }); }
          }
          if (ev.kind === "text") for (const l of ev.text.split("\n").filter((x) => x.trim())) ctx.update({ log: short(l) });
          if (ev.kind === "tool") ctx.update({ log: `> ${ev.name} ${short(String(ev.input.file_path ?? ev.input.command ?? ev.input.pattern ?? ""), 120)}`.trim() });
          if (ev.kind === "result") { summary = ev.text; if (!ev.ok) { failed = true; lastError = ev.text; } }
        }
      },
    });
    if (ctx.signal.aborted) throw new Error("Cancelled");
    const missing = missingCarouselOutputs(listFiles(alloc.path), p.slides);
    if (missing.length) throw new Error(`Carousel not finished (missing ${missing.slice(0, 4).join(", ")}${missing.length > 4 ? "…" : ""}) in ${alloc.folder}. Last error: ${lastError || stderrLast || (code !== 0 ? `the AI tool exited with code ${code}` : "it stopped early")}`);
    requireSkill(ctx, CAROUSEL_SKILLS.every((s) => skills.includes(s)), `The AI did not call ${CAROUSEL_SKILLS.filter((s) => !skills.includes(s)).join(" and ")}, so the carousel is not built on them (called: ${skills.join(", ") || "none"}).`);
    if (failed) ctx.update({ log: `Warning: the AI tool reported an error at the end: ${short(lastError, 200)}` });
  } finally { clearInterval(timer); }
  ctx.update({ stepIndex: CAROUSEL_STEPS.length - 1, step: CAROUSEL_STEPS[CAROUSEL_STEPS.length - 1] as string, progress: 1 });
  return { folder: alloc.folder, key: `${brand.slug}/${alloc.folder}`, style: p.style, slides: p.slides, skillsUsed: skills, summary };
};
