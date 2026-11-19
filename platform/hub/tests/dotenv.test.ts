import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProjectEnv, parseEnvFile } from "../src/dotenv.js";

const root = mkdtempSync(join(tmpdir(), "dotenv-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("project .env", () => {
  it("parses values, comments and quotes", () => {
    expect(parseEnvFile('A=1   # note\n# c\nB="two words" # x\nC=\nbad line\nOFFER_REGEX=X|Y')).toEqual({ A: "1", B: "two words", C: "", OFFER_REGEX: "X|Y" });
  });
  it("fills only the readable settings that the environment leaves empty, never the token", () => {
    writeFileSync(join(root, ".env"), "HUB_TOKEN=secret\nBRAND=b1\nIG_USER_ID=123\nBLOG_DIR=/srv/posts\nOFFER_LAST_DAY=2026-11-30\n");
    const env: NodeJS.ProcessEnv = { REEL_ROOT: root, IG_USER_ID: "set-already", OFFER_LAST_DAY: "" };
    const set = applyProjectEnv(env);
    expect(env.HUB_TOKEN).toBeUndefined();
    expect(env.BRAND).toBe("b1");
    expect(env.IG_USER_ID).toBe("set-already");
    expect(env.HUB_BLOG_DIR).toBe("/srv/posts");
    expect(env.OFFER_LAST_DAY).toBe("2026-11-30");
    expect(set.sort()).toEqual(["BRAND", "HUB_BLOG_DIR", "OFFER_LAST_DAY"]);
  });
  it("does nothing without a .env", () => expect(applyProjectEnv({ REEL_ROOT: join(root, "none") })).toEqual([]));
});
