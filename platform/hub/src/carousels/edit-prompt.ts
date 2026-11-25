import type { CarouselStyle } from "./scanner.js";

export interface CarouselEditPromptInput {
  root: string;
  brand: string;
  brandDir: string;
  folder: string;
  style: CarouselStyle;
  slide: number;
  slides: number;
  message: string;
  /** The Instagram slot when it is already scheduled: Instagram keeps its own copy. */
  scheduled: string | null;
}

/** Prompt for a headless run that changes one slide of a finished carousel and leaves the others alone. */
export function buildCarouselEditPrompt(i: CarouselEditPromptInput): string {
  const dir = `${i.brandDir}/carousels/${i.folder}`;
  const how = i.style === "3d"
    ? `The carousel is 3D: its slides were cut with ffmpeg from one wide Blender render (the scene and the kit are in ${dir} and ${i.root}/scripts/carousel/blender/). Change the scene only as far as the request needs, render it again (through \`bash scripts/slot.sh blender 1 -- <command>\`) and cut only the strip of slide ${i.slide} from the new render. The other strips are not cut again.`
    : `The carousel is 2D: its slides are Remotion compositions in ${dir}/code/. Change only the code of slide ${i.slide} (and an image it alone uses), then render only that slide (\`bash scripts/slot.sh render 3 -- <command>\`, with REEL_BRAND set as the hub does) to ${dir}/slide-${i.slide}.png.`;
  return `You are changing one slide of a finished Instagram carousel in the reel-studio project at ${i.root}. Read ${i.brandDir}/identity/style.md and ${i.root}/.claude/skills/carousel/SKILL.md first (the rules of the slides still hold: 1080 x 1350, readable on a phone, inside the safe margins, the look of the other slides).

Carousel: ${dir} (${i.slides} slides). Change slide ${i.slide} only: ${dir}/slide-${i.slide}.png.
The request: ${i.message}

Rules:
- ${how}
- Every other slide-N.png stays exactly as it is, byte for byte. Do not render or overwrite them. The hub checks this and puts them back if they changed.
- The new slide-${i.slide}.png is 1080 x 1350 px and still fits the slides beside it (same colours, fonts, frame). Look at it at 100% before you finish; fix and render again, three rounds at most.
- If what the slide shows changed, update the string number ${i.slide} of ${dir}/alt.json (at most 100 characters, what the image really shows, in words a person would search for). Keep the other strings. Change caption.md and plan.md only if the request says so.
- No questions: do it in one go. Never post and never schedule on Instagram. Do not run git, docker, systemctl, kill or rm -rf. Do not touch other carousels or reels.
${i.scheduled ? `- This carousel is already scheduled on Instagram for ${i.scheduled}. Changing the files does not change Instagram's copy: say so in your answer.\n` : ""}- Finish with a short answer: what you changed on the slide and one thing you would improve.`;
}
