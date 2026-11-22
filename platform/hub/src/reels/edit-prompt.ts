export interface EditInput {
  root: string;
  brand: string;
  /** The brand's own folder (absolute). */
  brandDir: string;
  folder: string;
  message: string;
  /** "YYYY-MM-DD HH:mm" when the reel is already scheduled or posted on Instagram. */
  scheduled: string | null;
  moves: readonly string[];
  /** The Claude session of earlier turns is resumed: it already knows the reel. */
  resumed: boolean;
}

/** The rules that hold in every turn of the conversation about a reel. */
const rules = (dir: string, i: EditInput): string => `Rules:
- Change only this reel: ${dir}. Do not touch the other reels' folders, the brand's identity folder or the question list, and do not renumber or rename the reel.
- The reel's code is in ${dir}/code/ (shared brand code in ${i.brandDir}/code/); import the kit by alias (\`@kit/...\`, \`@cover/...\`). Render with \`REEL_BRAND=${i.brand} npx remotion render ${dir}/code/index.ts <CompositionId> ...\` from the workspace.
- Run the voice only through \`bash scripts/slot.sh voice 1 -- <command>\`, Blender through \`bash scripts/slot.sh blender 1 -- <command>\` and every Remotion render (video and still) through \`bash scripts/slot.sh render 3 -- <command>\`. Never run those directly.
- Change only what the request asks for. Keep the same file names: overwrite the MP4, and refresh caption.md and cover.png only if the change makes them wrong (a new headline needs a new cover).
- Do not schedule or post anything on Instagram. Do not run git, docker, systemctl, kill or rm -rf.
- If the request is a question and not a change, answer it and change nothing.
- When you are done, answer in one short paragraph: what you changed, and anything the person should check. No headings, no lists of files.`;

/** The prompt of one turn of the conversation that edits a reel. The first turn carries the whole context; later turns resume the Claude session. */
export function buildEditPrompt(i: EditInput): string {
  const dir = `${i.brandDir}/reels/${i.folder}`;
  const scheduled = i.scheduled ? `\nThis reel is already scheduled or posted on Instagram (${i.scheduled}). Instagram keeps the copy it has: tell the person that a change here does not change it.\n` : "";
  const moves = i.moves.length ? `\nThe character's moves that exist (use only these): ${i.moves.join(", ")}.\n` : "";
  if (i.resumed) return `The person asks for a change to the reel in ${dir}:\n\n${i.message}\n\n${rules(dir, i)}`;
  return `You are editing one finished reel in the reel-studio project at ${i.root}, because the person asked for a change. Follow ${i.root}/.claude/skills/reel/SKILL.md for how a reel is built and read ${i.brandDir}/identity/style.md first (the paths it names are relative to ${i.brandDir}).

The reel is in ${dir}: its script.json, plan.md, audio, code, MP4, caption.md and cover.png are there. Read what you need before you change anything.
${scheduled}${moves}
The request:

${i.message}

${rules(dir, i)}`;
}
