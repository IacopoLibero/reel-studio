import { join, resolve } from "node:path";
import { defaultProgramRoot, studioHome } from "../paths.js";
import { migrateBrandFolders, removeOldFiles, type BrandFoldersResult } from "./brand-folders.js";

export interface Out { write(text: string): void }

const USAGE = `Usage: migrate-brand-folders [--apply] [--remove-old [--yes]] [--home <folder>]

Moves your brands from the first layout to one folder per brand:
  brand/<name>/identity   brand.json, style.md, logo.png, and the voice of a brand without a character
  brand/<name>/mascot     the character: script, model, voice, and movements/ (the rendered moves)
  brand/<name>/reels      one folder per reel, with its final audio
  data/brands/<name>/reel-questions.md   the question list (hub data)
It only copies and checks. Nothing is deleted: the originals stay until you ask for --remove-old.
Without --apply it only shows the plan. --remove-old lists the old copies that have an identical new copy; with --yes it removes them.
Stop the hub first (a running job would make the copy unreliable).`;

interface Args { apply: boolean; removeOld: boolean; yes: boolean; home?: string }

function parse(argv: readonly string[]): Args | null {
  const a: Args = { apply: false, removeOld: false, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--apply") a.apply = true;
    else if (k === "--remove-old") a.removeOld = true;
    else if (k === "--yes") a.yes = true;
    else if (k === "--home" && argv[i + 1]) { a.home = argv[++i]; }
    else return null;
  }
  return a;
}

const show = (r: BrandFoldersResult, out: Out): void => {
  for (const b of r.brands) {
    out.write(`\n${b.slug}\n`);
    for (const c of b.copies) out.write(`  copy   ${c.what}\n`);
    for (const w of b.writes) out.write(`  write  ${w.what}\n`);
    for (const n of b.notes) out.write(`  note   ${n}\n`);
  }
};

/** Runs the command; returns the exit code. */
export function run(argv: readonly string[], out: Out, env: NodeJS.ProcessEnv = process.env): number {
  const a = parse(argv);
  if (!a) { out.write(`${USAGE}\n`); return 2; }
  const home = resolve(a.home ?? studioHome(env));
  const workspace = join(home, "workspace"), data = join(home, "data");

  if (a.removeOld) {
    const r = removeOldFiles({ workspace, data, remove: a.yes, programRoot: defaultProgramRoot() });
    out.write(a.yes ? "Removed:\n" : "Would remove (add --yes to do it):\n");
    for (const p of r.removed) out.write(`  ${p}\n`);
    if (r.kept.length) { out.write("\nKept:\n"); for (const k of r.kept) out.write(`  ${k.path}: ${k.why}\n`); }
    return 0;
  }

  const r = migrateBrandFolders({ workspace, data, apply: a.apply, log: (l) => out.write(`${l}\n`) });
  if (r.status === "nothing") { out.write("Nothing to move: no brand is in the first layout.\n"); return 0; }
  if (r.status === "already") { out.write("Already moved (see .reel-studio/brand-folders.json in the workspace). Nothing to do.\n"); return 0; }
  show(r, out);
  if (r.status === "planned") { out.write(`\nPlan only. Run again with --apply to copy (${r.brands.length} brand${r.brands.length === 1 ? "" : "s"}).\n`); if (r.problems.length) out.write(`Problems to fix first:\n${r.problems.map((p) => `  ${p}`).join("\n")}\n`); return r.problems.length ? 1 : 0; }
  if (r.status === "blocked") { out.write(`\nNot copied. Fix these first:\n${r.problems.map((p) => `  ${p}`).join("\n")}\n`); return 1; }
  if (!r.verified) { out.write(`\nCopied, but the check found differences:\n${r.problems.map((p) => `  ${p}`).join("\n")}\n`); return 1; }
  out.write("\nDone and verified. The originals were not touched: check the hub works, then run this again with --remove-old.\n");
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(run(process.argv.slice(2), process.stdout));
