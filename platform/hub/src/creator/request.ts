import { z } from "zod";
import { UPLOAD_ID } from "./uploads.js";

const uploadId = z.string().regex(UPLOAD_ID, "That upload is not valid.");
const keywords = z.array(z.string().trim().min(1).max(60)).max(200);
const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);

/** What the three entries of the New brand page (form, interview, import) all send: the brand as brand.json will hold it, plus the files and choices around it. */
export const createRequestSchema = z.object({
  source: z.enum(["form", "interview", "import"]),
  /** The brand as an object; the creation job validates it with the brand schema. The slug may be missing: the hub picks a free one. */
  brand: z.record(z.string(), z.unknown()),
  styleMd: z.string().max(40_000).optional(),
  logoUpload: uploadId.optional(),
  importId: uploadId.optional(),
  voice: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("later") }),
    z.object({ mode: z.literal("reuse"), from: slug }),
    z.object({ mode: z.literal("upload"), wavUpload: uploadId, text: z.string().trim().min(3, "Type the words spoken in the sample.").max(1000) }),
  ]).default({ mode: "later" }),
  character: z.object({
    mode: z.enum(["none", "create", "import"]),
    name: z.string().trim().max(80).default(""),
    /** For "import": the id of a character already on this machine (mascot/<id>.py). */
    id: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/).optional(),
    fields: z.object({ what: z.string().max(1500), personality: z.string().max(1500), extra: z.string().max(1500) }).optional(),
    sheetUpload: uploadId.optional(),
  }).default({ mode: "none", name: "" }),
  /** Words that make a reel close with A (the brand's offer, `product`) or B (follow for tips, `general`). Empty or missing: every reel gets B until Settings > Factory has some. */
  closingRules: z.object({ product: keywords, general: keywords }).optional(),
  dailyLoop: z.boolean().default(false),
  /** Set by the hub when it queues the job: makes a retry of the same request a no-op. */
  requestId: z.string().regex(/^[0-9a-f]{32}$/).optional(),
});

export type CreateRequest = z.infer<typeof createRequestSchema>;

export const CREATE_STEPS = ["Check", "Create folders", "Write files", "Register", "Done"];
