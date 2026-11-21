import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "../src/layout/brand-folders-cli.js";
import { testBrand } from "./helpers/brand.js";

let home: string;
const put = (rel: string, content = "x") => { const f = join(home, rel); mkdirSync(join(f, ".."), { recursive: true }); writeFileSync(f, content); };
const cli = (...args: string[]) => { let text = ""; const code = run(["--home", home, ...args], { write: (t) => { text += t; } }); return { code, text }; };
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "bf-cli-"));
  put("workspace/brand/acme/brand.json", JSON.stringify(testBrand("acme", { name: "Acme" }))); put("workspace/brand/acme/style.md", "# s");
  put("workspace/reels/acme/1-x/a.mp4", "v"); mkdirSync(join(home, "data"));
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

describe("migrate-brand-folders", () => {
  it("shows the plan by default and changes nothing", () => {
    const r = cli();
    expect(r.code).toBe(0);
    expect(r.text).toContain("acme");
    expect(r.text).toContain("copy   reels");
    expect(r.text).toContain("--apply");
    expect(existsSync(join(home, "workspace/brand/acme/identity"))).toBe(false);
  });
  it("copies with --apply, says it is verified, and keeps the originals", () => {
    const r = cli("--apply");
    expect(r.code).toBe(0);
    expect(r.text).toContain("Done and verified");
    expect(existsSync(join(home, "workspace/brand/acme/identity/brand.json"))).toBe(true);
    expect(existsSync(join(home, "workspace/brand/acme/reels/1-x/a.mp4"))).toBe(true);
    expect(existsSync(join(home, "workspace/reels/acme/1-x/a.mp4"))).toBe(true);
    expect(cli("--apply").text).toContain("Already moved");
  });
  it("lists the old copies by default and removes them only with --yes", () => {
    cli("--apply");
    const list = cli("--remove-old");
    expect(list.text).toContain("Would remove");
    expect(list.text).toContain("workspace/reels/acme");
    expect(existsSync(join(home, "workspace/reels/acme"))).toBe(true);
    expect(cli("--remove-old", "--yes").text).toContain("Removed:");
    expect(existsSync(join(home, "workspace/reels"))).toBe(false);
    expect(existsSync(join(home, "workspace/brand/acme/identity/brand.json"))).toBe(true);
  });
  it("exits with 1 and says what to fix when a brand cannot be moved", () => {
    put("workspace/brand/bad/brand.json", "{nope");
    const r = cli("--apply");
    expect(r.code).toBe(1);
    expect(r.text).toContain("Not copied");
    expect(r.text).toContain("brand/bad/brand.json");
  });
  it("prints the usage for an unknown option", () => {
    expect(cli("--wat").code).toBe(2);
    expect(cli("--wat").text).toContain("Usage:");
  });
  it("says so when there is nothing to move", () => {
    rmSync(join(home, "workspace/brand"), { recursive: true, force: true });
    expect(cli("--apply").text).toContain("Nothing to move");
  });
});
