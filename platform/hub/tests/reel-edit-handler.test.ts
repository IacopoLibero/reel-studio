import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { reelEdit } from "../src/reels/edit-handler.js";
import { readChat } from "../src/reels/chat.js";
import { VERSIONS_DIR } from "../src/reels/versions.js";
import { writeTestBrand } from "./helpers/brand.js";
import { type Env, job, makeEnv } from "./helpers/creator.js";

const FAKE = join(import.meta.dirname, "fixtures/fake-claude-edit.mjs");
let env: Env, reel: string, log: string;

beforeEach(() => {
  env = makeEnv({ claudeBin: FAKE });
  writeTestBrand(env.root, "acme", { name: "Acme" }, undefined, env.data);
  reel = join(env.data, "brands/acme/reels/3-half-loaf");
  mkdirSync(join(reel, "code"), { recursive: true });
  for (const [f, c] of Object.entries({ "half.mp4": "original video", "caption.md": "cap", "cover.png": "png", "script.json": "{}", "code/Scenes.tsx": "s" })) writeFileSync(join(reel, f), c);
  log = join(env.tmp, "fake.log"); process.env.FAKE_LOG = log;
});
afterEach(() => { delete process.env.FAKE_MODE; delete process.env.FAKE_LOG; rmSync(env.tmp, { recursive: true, force: true }); });

const runs = (): { args: string[]; prompt: string }[] => readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const edit = (id: string, message: string) => { const j = { ...job("reel.edit", "acme", { folder: "3-half-loaf", message }), id }; return reelEdit(j, env.ctx(j)); };

describe("reel.edit", () => {
  it("first turn: snapshots the reel, runs Claude with the request, edits the video, and keeps the conversation", async () => {
    const r = await edit("job-1", "Make the hook bigger");
    expect(r.summary).toBe("Made the hook 20% bigger.");
    expect(readFileSync(join(reel, "half.mp4"), "utf8")).toBe("edited video");
    const snap = readdirSync(join(reel, VERSIONS_DIR));
    expect(snap).toHaveLength(1);
    expect(readFileSync(join(reel, VERSIONS_DIR, snap[0]!, "half.mp4"), "utf8")).toBe("original video");
    const chat = readChat(reel);
    expect(chat.sessionId).toBe("sess-one");
    expect(chat.messages.map((m) => [m.role, m.text])).toEqual([["user", "Make the hook bigger"], ["claude", "Made the hook 20% bigger."]]);
    const [first] = runs();
    expect(first?.args).not.toContain("--resume");
    expect(first?.args).toContain("--add-dir");
    expect(first?.prompt).toContain("Make the hook bigger");
  });
  it("later turn: resumes the session with a short prompt", async () => {
    await edit("job-1", "Make the hook bigger");
    await edit("job-2", "Now a little smaller");
    const second = runs()[1]!;
    expect(second.args[second.args.indexOf("--resume") + 1]).toBe("sess-one");
    expect(second.prompt).toContain("Now a little smaller");
    expect(second.prompt).not.toContain("SKILL.md");
    expect(readChat(reel).messages.map((m) => m.text)).toEqual(["Make the hook bigger", "Made the hook 20% bigger.", "Now a little smaller", "Made the hook 20% bigger."]);
  });
  it("starts a fresh session when the old one cannot be resumed", async () => {
    await edit("job-1", "first");
    process.env.FAKE_MODE = "resume-lost";
    // the fake refuses to resume; the handler must go on without --resume (the fake then runs in 'resume-lost' mode but without a resume id: it succeeds)
    const r = await edit("job-2", "second");
    expect(r.summary).toBe("Made the hook 20% bigger.");
    const all = runs();
    expect(all).toHaveLength(3);
    expect(all[1]?.args).toContain("--resume");
    expect(all[2]?.args).not.toContain("--resume");
    expect(all[2]?.prompt).toContain("SKILL.md");
  });
  it("a question changes nothing and the answer goes in the chat", async () => {
    process.env.FAKE_MODE = "question";
    const r = await edit("job-1", "How tall is the hook?");
    expect(r.summary).toBe("The hook is 120 px tall.");
    expect(readFileSync(join(reel, "half.mp4"), "utf8")).toBe("original video");
  });
  it("when Claude fails, the reel is as it was, the chat says so, and the job fails", async () => {
    process.env.FAKE_MODE = "error";
    await expect(edit("job-1", "x")).rejects.toThrow(/boom/);
    expect(readFileSync(join(reel, "half.mp4"), "utf8")).toBe("original video");
    expect(readChat(reel).messages.at(-1)).toMatchObject({ role: "claude" });
    expect(readChat(reel).messages.at(-1)?.text).toMatch(/boom/);
  });
  it("puts a deliverable back when Claude leaves the reel without one", async () => {
    process.env.FAKE_MODE = "delete";
    await expect(edit("job-1", "x")).rejects.toThrow(/missing/i);
    expect(readFileSync(join(reel, "half.mp4"), "utf8")).toBe("original video");
  });
  it("reports progress steps while it works", async () => {
    await edit("job-1", "x");
    expect(env.patches.map((p) => p.step).filter(Boolean)).toEqual(expect.arrayContaining(["Reading the reel", "Changing it", "Rendering", "Done"]));
  });
  it("refuses a reel that does not exist", async () => {
    const j = job("reel.edit", "acme", { folder: "99-nope", message: "x" });
    await expect(reelEdit(j, env.ctx(j))).rejects.toThrow(/not found/i);
  });
});
