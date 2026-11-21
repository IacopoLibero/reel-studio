import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { reelIdeas } from "../src/ideas/handler.js";
import { blogSlugs, brandData, pendingView, resolveBatch } from "../src/ideas/service.js";
import { listBatches, readBatch } from "../src/ideas/store.js";
import { DEFAULT_SETTINGS } from "../src/settings.js";
import { parseQuestions } from "../src/factory/questions.js";
import type { Job, JobPatch } from "../src/shared/types.js";

const FAKE = join(import.meta.dirname, "fixtures/fake-claude-ideas.mjs");
let tmp: string, root: string, data: string, blog: string;
// Here `data` is the brand's own data folder (what a job gets as ctx.dataDir); the question list is hub data and sits in it.
const qfile = () => join(data, "reel-questions.md");

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "ideas-"));
  root = join(tmp, "root"); data = join(tmp, "data"); blog = join(tmp, "er/app/blog/posts");
  mkdirSync(join(root, "brand/acme/identity"), { recursive: true }); mkdirSync(data); mkdirSync(blog, { recursive: true });
  copyFileSync(join(import.meta.dirname, "fixtures/reel-questions.md"), qfile());
  for (const f of ["improve-restaurant-efficiency.ts", "index.ts", "translations.ts"]) writeFileSync(join(blog, f), "");
});
afterEach(() => { delete process.env.FAKE_MODE; rmSync(tmp, { recursive: true, force: true }); });

const run = async (count = 3, mode = "good") => {
  process.env.FAKE_MODE = mode;
  const patches: JobPatch[] = [];
  const job = { id: "j", type: "reel.ideas", params: { brand: "acme", count } } as unknown as Job;
  const result = await reelIdeas(job, { update: (p) => patches.push(p), signal: new AbortController().signal, settings: DEFAULT_SETTINGS, root, claudeBin: FAKE, dataDir: data, blogDir: blog, startedAtMs: 0 });
  return { result, patches };
};

describe("reel.ideas job with a fake claude", () => {
  it("writes the batch, drops the duplicate, walks the four steps", async () => {
    const { result, patches } = await run(4);
    expect(result.proposed).toBe(3);
    expect(result.dropped).toBe(1);
    const b = listBatches(data);
    expect(b).toHaveLength(1);
    expect(b[0]?.ideas.map((i) => i.closing).every((c) => c === "A" || c === "B")).toBe(true);
    expect(b[0]?.dropped[0]?.question).toBe("Is a paper menu really cheaper?");
    expect(readdirSync(join(data, "ideas"))).toHaveLength(1);
    expect([...new Set(patches.map((p) => p.step).filter(Boolean))]).toEqual(["Read context", "Generate", "Check duplicates", "Done"]);
    expect(patches.at(-1)?.progress).toBe(1);
  });
  it("never touches reel-questions.md", async () => {
    const before = readFileSync(qfile(), "utf8");
    await run(3);
    expect(readFileSync(qfile(), "utf8")).toBe(before);
  });
  it("fails clearly on prose instead of JSON", async () => {
    await expect(run(3, "prose")).rejects.toThrow(/not valid JSON/);
    expect(existsSync(join(data, "ideas"))).toBe(false);
  });
  it("logs skill calls and stores skillsUsed", async () => {
    const { result, patches } = await run(3);
    expect(result.skillsUsed).toEqual(["reel-hooks"]);
    expect(patches.some((p) => String(p.log).includes("SKILL CALLED: reel-hooks"))).toBe(true);
    expect(listBatches(data)[0]?.skillsUsed).toEqual(["reel-hooks"]);
    expect(listBatches(data)[0]?.ideas[0]?.why).toBeTruthy();
  });
  it("fails clearly when no skill was called", async () => {
    await expect(run(3, "noskill")).rejects.toThrow(/did not call reel-hooks or reel-research/);
    expect(existsSync(join(data, "ideas"))).toBe(false);
  });
  it("fails when Claude reports an error", async () => {
    await expect(run(3, "error")).rejects.toThrow(/boom/);
  });
  it("fails when every idea repeats an existing question", async () => {
    await expect(run(3, "dups")).rejects.toThrow(/repeat existing/);
  });
  it("reports a missing binary", async () => {
    process.env.FAKE_MODE = "good";
    const job = { id: "j", type: "reel.ideas", params: { brand: "acme", count: 3 } } as unknown as Job;
    await expect(reelIdeas(job, { update: () => undefined, signal: new AbortController().signal, settings: DEFAULT_SETTINGS, root, claudeBin: join(tmp, "nope"), dataDir: data, blogDir: blog, startedAtMs: 0 })).rejects.toThrow(/Could not start/);
  });
});

describe("accepting ideas", () => {
  it("adds accepted ones to the temp copy under the lock, marks the rest, keeps 41 + n questions", async () => {
    await run(4);
    const batch = listBatches(data)[0]!;
    expect(parseQuestions(readFileSync(qfile(), "utf8"), "acme")).toHaveLength(41);
    const [a, b, c] = batch.ideas;
    const r = await resolveBatch(root, data, batch.id, [a!.id, b!.id], [c!.id]);
    expect(r?.added).toHaveLength(2);
    expect(r?.rejected).toBe(1);
    expect(parseQuestions(readFileSync(qfile(), "utf8"), "acme")).toHaveLength(43);
    const saved = readBatch(data, batch.id)!;
    expect(Object.values(saved.handled).sort()).toEqual(["added", "added", "rejected"]);
    expect(pendingView(root, data, listBatches(data))).toHaveLength(0);
    // a second click does nothing
    const again = await resolveBatch(root, data, batch.id, [a!.id], []);
    expect(again?.added).toHaveLength(0);
    expect(parseQuestions(readFileSync(qfile(), "utf8"), "acme")).toHaveLength(43);
  });
  it("answers null for an unknown batch", async () => {
    expect(await resolveBatch(root, data, "2020-01-01T00-00-00-000Z", ["aaaaaaaaaaaa"], [])).toBeNull();
    expect(readBatch(data, "../etc/passwd")).toBeNull();
  });
  it("flags a pending idea whose question was added by hand meanwhile", async () => {
    await run(4);
    const batch = listBatches(data)[0]!;
    writeFileSync(qfile(), readFileSync(qfile(), "utf8") + `- [ ] ${batch.ideas[0]!.question}\n`);
    const view = pendingView(root, data, listBatches(data));
    expect(view[0]?.ideas[0]?.duplicate).toBe(true);
    expect(view[0]?.ideas[1]?.duplicate).toBe(false);
  });
});

describe("service helpers", () => {
  it("lists blog slugs without index and translations", () => { expect(blogSlugs(blog)).toEqual(["improve-restaurant-efficiency"]); expect(blogSlugs(join(tmp, "none"))).toEqual([]); });
  it("sees optional brand data", () => {
    expect(brandData(root, "acme")).toEqual({ hasCsv: false, hasComments: false, hasResults: false });
    writeFileSync(join(root, "brand/acme/hooks.csv"), ""); writeFileSync(join(root, "brand/acme/comments.txt"), ""); writeFileSync(join(root, "brand/acme/instagram-results.md"), "");
    expect(brandData(root, "acme")).toEqual({ hasCsv: true, hasComments: true, hasResults: true });
  });
});
