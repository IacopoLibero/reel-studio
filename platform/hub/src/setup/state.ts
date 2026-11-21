import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { voiceMode } from "./voice-modes.js";

const schema = z.object({ version: z.literal(1), completed: z.boolean(), voiceMode: z.string().nullable() });
export type SetupState = z.infer<typeof schema>;

const file = (dataDir: string): string => join(dataDir, "setup.json");

/** What the setup screen saved: whether it was finished and the voice mode chosen. A missing or damaged file means "not done yet". */
export function readSetup(dataDir: string): SetupState {
  const empty: SetupState = { version: 1, completed: false, voiceMode: null };
  if (!existsSync(file(dataDir))) return empty;
  try {
    const parsed = schema.parse(JSON.parse(readFileSync(file(dataDir), "utf8")));
    return { ...parsed, voiceMode: voiceMode(parsed.voiceMode) ? parsed.voiceMode : null };
  } catch { return empty; }
}

export function writeSetup(dataDir: string, state: SetupState): void {
  mkdirSync(dataDir, { recursive: true });
  const tmp = `${file(dataDir)}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(schema.parse(state), null, 2)}\n`);
  renameSync(tmp, file(dataDir));
}
