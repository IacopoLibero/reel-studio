import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendMessage, CHAT_FILE, readChat, setSession } from "../src/reels/chat.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "reel-chat-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("reel chat", () => {
  it("is empty for a reel nobody talked about", () => {
    expect(readChat(dir)).toEqual({ sessionId: null, messages: [] });
  });
  it("keeps messages in order with their job and time", () => {
    appendMessage(dir, { role: "user", text: "Make the hook bigger", jobId: "j1" }, new Date("2026-11-22T10:00:00Z"));
    appendMessage(dir, { role: "claude", text: "Done: 20% bigger.", jobId: "j1" }, new Date("2026-11-22T10:05:00Z"));
    const c = readChat(dir);
    expect(c.messages.map((m) => [m.role, m.text, m.jobId])).toEqual([["user", "Make the hook bigger", "j1"], ["claude", "Done: 20% bigger.", "j1"]]);
    expect(c.messages[0]?.at).toBe("2026-11-22T10:00:00.000Z");
  });
  it("remembers the Claude session so the conversation goes on", () => {
    setSession(dir, "abc-123");
    appendMessage(dir, { role: "user", text: "x", jobId: "j" });
    expect(readChat(dir).sessionId).toBe("abc-123");
  });
  it("ignores a damaged file and a message that is not valid", () => {
    writeFileSync(join(dir, CHAT_FILE), "{nope");
    expect(readChat(dir)).toEqual({ sessionId: null, messages: [] });
    writeFileSync(join(dir, CHAT_FILE), JSON.stringify({ sessionId: 5, messages: [{ role: "robot", text: "x" }, { role: "user", text: "ok", at: "t", jobId: "j" }] }));
    const c = readChat(dir);
    expect(c.sessionId).toBeNull();
    expect(c.messages.map((m) => m.text)).toEqual(["ok"]);
  });
  it("does not add the same job's message twice", () => {
    appendMessage(dir, { role: "user", text: "a", jobId: "j1" });
    appendMessage(dir, { role: "user", text: "a", jobId: "j1" });
    expect(readChat(dir).messages).toHaveLength(1);
  });
  it("keeps only the last 200 messages", () => {
    for (let i = 0; i < 205; i++) appendMessage(dir, { role: "user", text: `m${i}`, jobId: `j${i}` });
    const m = readChat(dir).messages;
    expect(m).toHaveLength(200);
    expect(m[0]?.text).toBe("m5");
    expect(JSON.parse(readFileSync(join(dir, CHAT_FILE), "utf8")).messages).toHaveLength(200);
  });
});
