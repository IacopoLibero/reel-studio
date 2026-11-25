export const CAROUSEL_STEPS = ["Plan", "Build", "Render", "Checks", "Caption", "Done"] as const;
export const CAROUSEL_MARKS = [0.05, 0.2, 0.45, 0.8, 0.92, 1];

/** The step the files in the carousel's folder say we have reached (a file present means its step is done). */
export function carouselStepOf(present: string[], slides: number): number {
  let s = 0;
  if (present.includes("plan.md")) s = 1;
  if (present.includes("code") || present.includes("scene.py")) s = 2;
  const done = present.filter((p) => /^slide-\d+\.png$/.test(p)).length;
  if (done > 0) s = Math.max(s, 2);
  if (done >= slides && slides > 0) s = Math.max(s, 3);
  if (present.includes("caption.md")) s = Math.max(s, 4);
  return s;
}

/** What a carousel needs to count as made: every slide, the caption, the plan and the source files that let one slide be drawn again (`source`). */
export function missingCarouselOutputs(present: string[], slides: number, source: readonly string[] = []): string[] {
  const out: string[] = [];
  for (let i = 1; i <= slides; i++) if (!present.includes(`slide-${i}.png`)) out.push(`slide-${i}.png`);
  if (!present.includes("caption.md")) out.push("caption.md");
  if (!present.includes("plan.md")) out.push("plan.md");
  for (const f of source) if (!present.includes(f)) out.push(f);
  return out;
}
