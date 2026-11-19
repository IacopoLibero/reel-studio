import { z } from "zod";

const instant = z.string().max(40).refine((s) => !Number.isNaN(Date.parse(s)) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s), "Use a date and time like 2026-11-25T08:00:00+01:00.");
const postId = z.string().min(1, "Choose a post.").max(300);

export const rescheduleSchema = z.object({ id: postId, newAt: instant });
export const deleteSchema = z.object({ id: postId, confirm: z.literal(true, { message: "Confirm the deletion first." }) });
export const calendarQuerySchema = z.object({
  weeks: z.coerce.number().int().min(1).max(26).default(6),
  fresh: z.preprocess((v) => v === "1" || v === "true" || v === true, z.boolean()).default(false),
});
