import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { systemChrome } from "../src/scheduler/chrome-path.js";

let tmp: string, bin: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "chrome-")); bin = join(tmp, "bin"); mkdirSync(bin); });
afterEach(() => rmSync(tmp, { recursive: true, force: true }));
const exe = (n: string) => { writeFileSync(join(bin, n), "#!/bin/sh\n", { mode: 0o755 }); return join(bin, n); };

describe("systemChrome", () => {
  it("uses CHROME_PATH when it is set", () => {
    expect(systemChrome({ CHROME_PATH: "/opt/x/chrome", PATH: bin })).toBe("/opt/x/chrome");
  });
  it("finds Chromium, then Google Chrome, on the PATH", () => {
    const chrome = exe("google-chrome-stable");
    expect(systemChrome({ PATH: bin })).toBe(chrome);
    const chromium = exe("chromium");
    expect(systemChrome({ PATH: bin })).toBe(chromium);
  });
  it("returns undefined when there is none, so Playwright uses its own browser", () => {
    expect(systemChrome({ PATH: bin })).toBeUndefined();
  });
  it("ignores a file that is not executable", () => {
    writeFileSync(join(bin, "chromium"), "x", { mode: 0o644 });
    expect(systemChrome({ PATH: bin })).toBeUndefined();
  });
});
