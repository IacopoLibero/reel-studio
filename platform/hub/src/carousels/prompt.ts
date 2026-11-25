import { DESTRUCTIVE_BASH_DENIES, NETWORK_AND_ENV_BASH_DENIES, SECRET_READ_DENIES, join as joinTools } from "../jobs/claude-safety.js";
import type { Brand } from "../brands/schema.js";
import type { CarouselStyle } from "./scanner.js";

export const CAROUSEL_ALLOWED_TOOLS = "Read,Edit,Write,Glob,Grep,Bash,Skill,WebFetch,WebSearch";
export const carouselDenied = (productDir: string | null): string => joinTools(
  DESTRUCTIVE_BASH_DENIES, NETWORK_AND_ENV_BASH_DENIES, SECRET_READ_DENIES,
  // the product is read-only: the carousel shows it, it never changes it
  productDir ? [`Write(/${productDir}/**)`, `Edit(/${productDir}/**)`] : [],
);

export interface CarouselPromptInput {
  root: string;
  brand: string;
  brandDir: string;
  folder: string;
  topic: string;
  style: CarouselStyle;
  slides: number;
  closing: "A" | "B";
  productDir: string | null;
  note?: string;
  brandInfo?: Pick<Brand, "name" | "website" | "closing" | "offer">;
}

const closingText = (c: "A" | "B", b?: CarouselPromptInput["brandInfo"]): string => {
  const o = b?.closing[c];
  const own = o ? ` Default line: "${o.line}" (label "${o.label}").` : "";
  return c === "A"
    ? `option A (${o?.label ?? "the brand offer and website"}): the last slide carries the brand's offer exactly as its style.md and brand.json say (codes, plans, valid-until date), the website and a short call to action. Check the dates again before using them.${own}`
    : `option B (${o?.label ?? "Follow for tips"}): the last slide is a follow call, with no offer; the website still shows.${own}`;
};

const styleText = (style: CarouselStyle): string => style === "3d"
  ? `Style: 3D. Build one wide 3D scene in Blender (Cycles on the GPU, the kit in ${"{ROOT}"}/scripts/carousel/blender/) that is as wide as all the slides together, render it once with a transparent background, cut it into one picture per slide with ffmpeg, and lay the text, the tags and the frame over each slice in Remotion. Objects cross the edge between two slides so the scene continues when the person swipes. Follow "The 3D style" of the skill, including the four-view and close-up checks of every object, and judge the textures at 100%.`
  : `Style: 2D. Build every slide in Remotion only (no Blender): real product screens in drawn device frames, paper and surface textures from real images, layered soft shadows, a fine grain, a colourful background that continues across the slides. Follow "The 2D style" of the skill.`;

/** Prompt for a headless run that makes one finished carousel. */
export function buildCarouselPrompt(i: CarouselPromptInput): string {
  const dir = `${i.brandDir}/carousels/${i.folder}`;
  return `You are making one finished Instagram carousel in the reel-studio project at ${i.root}. Follow ${i.root}/.claude/skills/carousel/SKILL.md exactly and read ${i.brandDir}/identity/style.md and ${i.brandDir}/identity/brand.json first.

Topic (the first slide opens with it): ${i.topic}
Brand: ${i.brandInfo?.name ?? i.brand} (folder ${i.brand}). Work in the folder ${dir}, which already exists: use it, do not create another folder and do not renumber.
Slides: ${i.slides}, each 1080 x 1350 px (4:5).
${styleText(i.style).replace("{ROOT}", i.root)}
Closing: ${closingText(i.closing, i.brandInfo)}
${i.productDir ? `The brand's product is in ${i.productDir}. Read it, never change anything in it. Look there for the real thing to show: screenshots and images (public/, docs/, any assets folder), the app's screens, its exact copy. Show the real product in drawn device frames; crop each screenshot to the part that matters. Use only what you find: never invent a feature, a screen or a number. If you find nothing usable for a slide, draw the idea instead and say so in your summary.` : "The brand has no product folder: show the idea as drawn objects and its own copy; never invent a screen, a feature or a number."}

Factory rules:
- Before the plan, make a real Skill tool call to \`ootto-viral-carousel\` (the structure) and then to \`ootto-carousel-builder\` (the words of every slide), as the skill says; the hub checks both. In this run the viral-carousel skill works read-only on public pages and on the brand's own data (no logins, no cookies).
- The plan is pre-approved. Do not ask questions and do not wait: write plan.md (the brief, the hook, one line per slide with what it shows and what is real), build, render, check, write the caption, in one go.
- Every Remotion render goes through \`bash scripts/slot.sh render 3 -- <command>\` and every Blender run through \`bash scripts/slot.sh blender 1 -- <command>\`; the voice is not used.
- The carousel's own code goes in ${dir}/code/ (index.ts, Root.tsx, the slides), never in the workspace's \`src/\`. Import the program's kit by alias (\`@kit/theme\`). Render with REEL_BRAND set (the hub sets it).
- Images come into the code as data URIs from a generated module: \`node scripts/carousel/embed-assets.mjs <images folder> ${dir}/code/assets.ts\` (copy the images you need into ${dir}/assets/ first). Never copy files into a public/ folder.
- Save each slide as ${dir}/slide-1.png ... slide-${i.slides}.png, write ${dir}/carousel.json as {"style":"${i.style}","topic":"<the topic>","title":"<a short title>"} and ${dir}/caption.md (the Instagram caption, ready to paste, plain # hashtags).
- Also write ${dir}/alt.json: a JSON array with exactly ${i.slides} strings, one alt text per slide in order. Each is at most 100 characters, says what the image really shows, and works in the words a person would search for (the subject, the object drawn, the problem it solves: for example "Restaurant menu with a crossed-out price and a new price"), so the post is found. No hashtags, no keyword lists, no "image of".
- Look at every slide at 100% before you finish: text readable on a phone, nothing cut off or colliding, inside the safe margins, the same frame on every slide. Fix and render again, three rounds at most.
- Never post and never schedule on Instagram. Do not run git, docker, systemctl, kill or rm -rf. Do not touch other carousels or reels.
${i.note ? `- This is a redo. The reviewer rejected the previous version with this note: "${i.note}". Make the carousel again in the same folder, fix what the note says, and overwrite the old slides, caption.md and plan.md.\n` : ""}- The carousel is finished only when all ${i.slides} slides, plan.md and caption.md are in ${dir}. End with a short summary: what the carousel shows, what is real and what is drawn, and one thing you would improve.`;
}
