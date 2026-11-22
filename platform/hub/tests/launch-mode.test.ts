import { describe, expect, it } from "vitest";
import { launchMode, canReuse } from "../src/scheduler/launch-mode.js";

describe("launchMode", () => {
  it("is headless for a read (status, calendar), so no window appears on the desktop", () => {
    expect(launchMode({}, {})).toEqual({ headless: true, args: [] });
  });
  it("is visible for the login window", () => {
    expect(launchMode({ visible: true }, {})).toEqual({ headless: false, args: [] });
  });
  it("starts minimized when a flow needs a window but the person did not ask for one", () => {
    expect(launchMode({ visible: true, minimized: true }, {})).toEqual({ headless: false, args: ["--start-minimized"] });
  });
  it("SCHED_HEADLESS=1 forces headless, even for the login window", () => {
    expect(launchMode({ visible: true }, { SCHED_HEADLESS: "1" }).headless).toBe(true);
  });
  it("adds --no-sandbox when CHROME_NO_SANDBOX=1", () => {
    expect(launchMode({}, { CHROME_NO_SANDBOX: "1" }).args).toEqual(["--no-sandbox"]);
  });
});

describe("canReuse", () => {
  it("reuses an open browser of the same profile when it is at least as visible as asked", () => {
    expect(canReuse({ profile: "p", visible: true }, "p", false)).toBe(true);
    expect(canReuse({ profile: "p", visible: false }, "p", false)).toBe(true);
    expect(canReuse({ profile: "p", visible: true }, "p", true)).toBe(true);
  });
  it("does not reuse a headless browser for a request that needs a window", () => {
    expect(canReuse({ profile: "p", visible: false }, "p", true)).toBe(false);
  });
  it("does not reuse the browser of another profile", () => {
    expect(canReuse({ profile: "p", visible: true }, "q", false)).toBe(false);
  });
});
