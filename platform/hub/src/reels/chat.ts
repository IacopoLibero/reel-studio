import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

/** The conversation about one reel, kept in the reel's folder so it survives a restart and travels with the reel. */
export const CHAT_FILE = "chat.json";
const KEEP = 200;

const message = z.object({ role: z.enum(["user", "claude"]), text: z.string(), at: z.string(), jobId: z.string() });
export type ChatMessage = z.infer<typeof message>;
export interface Chat { sessionId: string | null; messages: ChatMessage[] }

export function readChat(reelDir: string): Chat {
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(join(reelDir, CHAT_FILE), "utf8")); } catch { return { sessionId: null, messages: [] }; }
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const messages = (Array.isArray(o.messages) ? o.messages : []).flatMap((m) => { const p = message.safeParse(m); return p.success ? [p.data] : []; });
  return { sessionId: typeof o.sessionId === "string" && o.sessionId ? o.sessionId : null, messages };
}

function write(reelDir: string, chat: Chat): void {
  mkdirSync(reelDir, { recursive: true });
  const tmp = join(reelDir, `${CHAT_FILE}.tmp`);
  writeFileSync(tmp, `${JSON.stringify(chat, null, 2)}\n`);
  renameSync(tmp, join(reelDir, CHAT_FILE));
}

/** Adds a message. A job's message of the same role is added once (a retry never doubles it). */
export function appendMessage(reelDir: string, m: { role: ChatMessage["role"]; text: string; jobId: string }, now: Date = new Date()): void {
  const chat = readChat(reelDir);
  if (chat.messages.some((x) => x.jobId === m.jobId && x.role === m.role)) return;
  const messages = [...chat.messages, { ...m, at: now.toISOString() }].slice(-KEEP);
  write(reelDir, { ...chat, messages });
}

export function setSession(reelDir: string, sessionId: string): void {
  write(reelDir, { ...readChat(reelDir), sessionId });
}
