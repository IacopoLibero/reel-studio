import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { agentCommand } from "../ai/agent.js";
import { jobEnv } from "../env.js";
import type { Handler } from "../jobs/handlers.js";
import { runProcess } from "../jobs/process.js";
import { readScheduled } from "../reels/scanner.js";
import { CAROUSEL_ALLOWED_TOOLS, carouselDenied } from "./prompt.js";
import { buildCarouselEditPrompt } from "./edit-prompt.js";
import { carouselDirOf, carouselScheduleKey, readCarouselDetail } from "./scanner.js";
import { restoreFromSnapshot, snapshotCarousel } from "./versions.js";

export const CAROUSEL_EDIT_STEPS = ["Reading the slide", "Changing it", "Rendering", "Checks", "Done"] as const;
const MARKS = [0.05, 0.3, 0.6, 0.85, 1];
const short = (s: string, n = 140): string => (s.length > n ? `${s.slice(0, n)}…` : s);
const hashOf = (file: string): string | null => { try { return createHash("sha1").update(readFileSync(file)).digest("hex"); } catch { return null; } };

/** Width and height of a PNG from its header, or null when the file is not a PNG. */
export function pngSize(file: string): { w: number; h: number } | null {
  try {
    const b = readFileSync(file);
    if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null;
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  } catch { return null; }
}

/** carousel.edit: the AI tool changes one slide of a finished carousel. The other slides are checked and put back if they changed. */
export const carouselEdit: Handler = async (job, ctx) => {
  const brand = ctx.brand;
  if (!brand) throw new Error("This job needs a brand.");
  const p = job.params as { folder: string; slide: number; message: string };
  const dir = carouselDirOf(brand.paths.carouselsDir, p.folder);
  const detail = readCarouselDetail(brand.paths.carouselsDir, p.folder, brand.slug);
  if (!detail || !existsSync(dir)) throw new Error(`Carousel ${p.folder} not found.`);
  if (p.slide < 1 || p.slide > detail.slides.length) throw new Error(`The carousel has ${detail.slides.length} slides: there is no slide ${p.slide}.`);
  const target = `slide-${p.slide}.png`;
  const schedule = readScheduled(brand.paths.scheduledFile)[carouselScheduleKey(brand.slug, p.folder)];

  ctx.update({ step: CAROUSEL_EDIT_STEPS[0], stepIndex: 0, progress: MARKS[0] as number, log: `Carousel ${p.folder}, slide ${p.slide}: ${short(p.message, 100)}` });
  const snapshot = snapshotCarousel(dir);
  const before = new Map(detail.slides.map((s) => [s, hashOf(join(dir, s))]));
  const productDir = brand.brand.sources.productDir?.trim() || null;
  const prompt = buildCarouselEditPrompt({ root: ctx.root, brand: brand.slug, brandDir: brand.paths.brandDir, folder: p.folder, style: detail.style, slide: p.slide, slides: detail.slides.length, message: p.message, scheduled: schedule?.at ?? null });
  const agent = agentCommand(ctx, { access: "edit", allowedTools: CAROUSEL_ALLOWED_TOOLS, deniedTools: carouselDenied(productDir), addDirs: [brand.paths.brandDir], ...(productDir ? { readDirs: [productDir] } : {}) });

  let step = 0; let summary = ""; let failed = false; let lastError = ""; let stderrLast = "";
  const go = (s: number) => { if (s > step) { step = s; ctx.update({ step: CAROUSEL_EDIT_STEPS[s] as string, stepIndex: s, progress: MARKS[s] as number }); } };
  const code = await runProcess({
    cmd: agent.cmd, args: agent.args, cwd: ctx.root, env: jobEnv(ctx.settings, brand.slug), stdin: agent.prompt(prompt), signal: ctx.signal,
    onLine: (line, stream) => {
      if (stream === "err") { if (line.trim()) { stderrLast = line.slice(0, 300); ctx.update({ log: `[stderr] ${stderrLast}` }); } return; }
      for (const ev of agent.parse(line)) {
        if (ev.kind === "text") for (const l of ev.text.split("\n").filter((x) => x.trim())) ctx.update({ log: short(l) });
        if (ev.kind === "tool") {
          const cmd = String(ev.input.command ?? "");
          ctx.update({ log: `> ${ev.name} ${short(String(ev.input.file_path ?? cmd ?? ev.input.pattern ?? ""), 110)}`.trim() });
          if (ev.name === "Write" || ev.name === "Edit") go(1);
          if (ev.name === "Bash" && /remotion\s+(render|still)|slot\.sh\s+(render|blender)|ffmpeg/.test(cmd)) go(2);
        }
        if (ev.kind === "result") { summary = ev.text; if (!ev.ok) { failed = true; lastError = ev.text; } }
      }
    },
  });
  go(3);

  // Whatever the run did, only the chosen slide may differ from before.
  const changedOthers = detail.slides.filter((s) => s !== target && hashOf(join(dir, s)) !== before.get(s));
  for (const s of changedOthers) restoreFromSnapshot(dir, snapshot, s);
  if (changedOthers.length) ctx.update({ log: `Put back ${changedOthers.join(", ")}: only slide ${p.slide} may change.` });
  const fail = (why: string): never => { restoreFromSnapshot(dir, snapshot, target); throw new Error(why); };
  if (ctx.signal.aborted) fail("Cancelled");
  if (failed) fail(lastError || "The AI tool reported an error");
  if (code !== 0 && !summary) fail(stderrLast || `The AI tool exited with code ${code}`);
  const size = pngSize(join(dir, target));
  if (!size) fail(`${target} is missing or is not a PNG after the change`);
  if (size && (size.w !== 1080 || size.h !== 1350)) fail(`${target} is ${size.w} x ${size.h} px after the change, not 1080 x 1350`);

  const changed = hashOf(join(dir, target)) !== before.get(target);
  const alt = readdirSync(dir).includes("alt.json");
  const note = schedule ? ` It is scheduled on Instagram for ${schedule.at}: Instagram keeps its own copy of the old slide.` : "";
  ctx.update({ step: CAROUSEL_EDIT_STEPS[4], stepIndex: 4, progress: 1 });
  return { folder: p.folder, slide: p.slide, changed, snapshot, alt, restored: changedOthers, summary: `${summary.trim() || "Done."}${changed ? "" : " (The slide came out the same as before.)"}${note}` };
};
