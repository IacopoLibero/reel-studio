import { DESTRUCTIVE_BASH_DENIES, NETWORK_AND_ENV_BASH_DENIES, RESEARCH_BASH_ALLOWED, SECRET_READ_DENIES, join as joinTools } from "../jobs/claude-safety.js";
import type { Brand } from "../brands/schema.js";
import type { SourceKind } from "./questions.js";

export const MAKE_ALLOWED_TOOLS = "Read,Edit,Write,Glob,Grep,Bash,Skill,WebFetch,WebSearch";
export const MAKE_DENIED_TOOLS = joinTools(DESTRUCTIVE_BASH_DENIES, NETWORK_AND_ENV_BASH_DENIES, SECRET_READ_DENIES);

export interface MakeInput {
  root: string;
  brand: string;
  question: string;
  closing: "A" | "B";
  source: string | null;
  sourceKind: SourceKind;
  folder: string;
  blogDir: string;
  note?: string;
  /** The brand's own wording: closing lines, website, character. Without it the style.md of the brand is the only source. */
  brandInfo?: Pick<Brand, "name" | "website" | "closing" | "character">;
}

const closingText = (c: "A" | "B", b?: MakeInput["brandInfo"]) => {
  const o = b?.closing[c];
  const own = o ? ` Default line: "${o.line}" (label "${o.label}").` : "";
  return c === "A"
    ? `option A (${o?.label ?? "the brand offer and website"}): the last spoken sentence names the website, as the Closing hook section of the brand's style.md says.${own}`
    : `option B (${o?.label ?? "Follow for tips"}): the last spoken sentence is the follow line, without the website spoken; the website still shows on screen in the closing scene.${own}`;
};

const sourceText = (i: MakeInput) => {
  if (i.sourceKind === "blog" && i.source) {
    return `The source is the blog post "${i.source}". Its text is in ${i.blogDir} (search for the slug there) and read it fully before writing the script. The script and caption say only what the post supports; leave out figures it gives without a reliable origin.`;
  }
  if (i.sourceKind === "needs-source") {
    return "There is no source for this question. Use only well-known, true statements and no numbers. Say in your final summary that no source was used.";
  }
  return `The source is: ${i.source ?? "none given"}. If you cannot read it, stick to well-known, true statements with no numbers.`;
};

/** Prompt for a headless run that makes one finished reel, like the batch of reels made by hand. */
export function buildReelPrompt(i: MakeInput): string {
  const dir = `reels/${i.brand}/${i.folder}`;
  return `You are making one finished reel in the reel-studio project at ${i.root}. Follow ${i.root}/.claude/skills/reel/SKILL.md exactly and read brand/${i.brand}/style.md first.

Question (the reel opens with it): ${i.question}
Brand: ${i.brandInfo?.name ?? i.brand} (folder ${i.brand}). Work in the folder ${dir}, which already exists: use it, do not create another reel folder and do not renumber.
Closing: ${closingText(i.closing, i.brandInfo)}
${sourceText(i)}

Factory rules:
- The script and the storyboard are pre-approved. Do not ask questions and do not wait for approval: do steps 2 to 13 of the skill in one go (script, voice, plan, storyboard, build, captions, sound, render, checks, caption, cover). Still write plan.md and draw the storyboard; just do not stop for a reply.
- Before you write the script, make a real Skill tool call to \`reel-hooks\` and use it to check the opening question against the first-3-seconds checklist: keep the question's words unless the checklist fails. If the source is "needs source", also call \`reel-research\` first. Name the skills you called in your final summary.
- Many reels are made at the same time. Run the voice only through \`bash scripts/slot.sh voice 1 -- <command>\`, any Blender run through \`bash scripts/slot.sh blender 1 -- <command>\`, and every Remotion render (video and still) through \`bash scripts/slot.sh render 3 -- <command>\`. Never run those directly.
- Use the voice that style.md names (the brand's voice sample). Make one version only.
- Do not edit brand/${i.brand}/reel-questions.md and do not tick the question: the hub does it when you finish.
- Never schedule on Instagram and never post. Skip step 14.
- Do not run git, docker, systemctl, kill or rm -rf. Do not touch other reels' folders.
${i.note ? `- This is a redo. The reviewer rejected the previous version with this note: "${i.note}". Make the reel again in the same folder, fix what the note says, and overwrite the old MP4, caption.md and cover.png.\n` : ""}- The reel is finished only when ${dir} holds the MP4, caption.md and cover.png. Finish with a short summary: the closing used, the source used, what you measured in the checks and what you would improve.`;
}
