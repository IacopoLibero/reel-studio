import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { questionId } from "../src/factory/questions.js";
import { addEpisodeQuestions } from "../src/series/episodes.js";
import { seriesByFolder } from "../src/series/membership.js";
import type { Series } from "../src/series/schema.js";

const brandDir = () => {
  const d = mkdtempSync(join(tmpdir(), "episodes-"));
  mkdirSync(join(d, "locks"));
  writeFileSync(join(d, "reel-questions.md"), "# Questions\n\n## To do\n\n- [ ] Why do guests hate QR menus? · source: needs source\n");
  return d;
};

describe("addEpisodeQuestions", () => {
  it("adds new episodes to the list and returns their ids in order", async () => {
    const d = brandDir();
    const eps = ["Day 1: what did last month really cost you?", "Day 2: which dish earns the least per plate?"];
    const ids = await addEpisodeQuestions(d, "acme", eps);
    expect(ids).toEqual(eps.map(questionId));
    const md = readFileSync(join(d, "reel-questions.md"), "utf8");
    for (const e of eps) expect(md).toContain(e);
  });
  it("leaves out an episode that is already in the list", async () => {
    const d = brandDir();
    expect(await addEpisodeQuestions(d, "acme", ["Why do guests hate QR menus?"])).toEqual([]);
  });
});

describe("seriesByFolder", () => {
  it("maps the folder of a question of a series to that series", () => {
    const q = "Day 1: what did last month really cost you?";
    const s: Series = { id: "aaaaaaaaaaaa", name: "30 days", promise: "", cadence: "daily", exampleHooks: [], questionIds: [questionId(q)], createdAt: "" };
    const m = seriesByFolder([{ question: q, folder: "easy/3-day-1" }, { question: "Other?", folder: "4-other" }], [s]);
    expect(m.get("3-day-1")).toEqual({ id: s.id, name: "30 days" });
    expect(m.has("4-other")).toBe(false);
  });
});
