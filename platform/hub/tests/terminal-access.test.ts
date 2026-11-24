import { describe, expect, it } from "vitest";
import { sessionName, terminalArgs } from "../src/terminal-access.js";

describe("terminal flags", () => {
  it("gives Claude the level and every brand's data", () => {
    const a = terminalArgs("claude", "plan", "/d/brands");
    expect(a.slice(0, 4)).toEqual(["--permission-mode", "plan", "--add-dir", "/d/brands"]);
    expect(a.join(" ")).toContain("--append-system-prompt");
    expect(terminalArgs("claude", "full", "/d/brands")[1]).toBe("bypassPermissions");
    expect(terminalArgs("claude", "ask", "/d/brands")[1]).toBe("default");
    expect(terminalArgs("claude", "edit", "/d/brands")[1]).toBe("acceptEdits");
  });
  it("maps the levels to Codex sandbox and approvals", () => {
    expect(terminalArgs("codex", "plan", "/b")).toEqual(["--sandbox", "read-only", "--ask-for-approval", "on-request", "--add-dir", "/b"]);
    expect(terminalArgs("codex", "full", "/b")[0]).toBe("--dangerously-bypass-approvals-and-sandbox");
    expect(terminalArgs("codex", "ask", "/b")).toContain("workspace-write");
  });
  it("names a session by tool and level", () => { expect(sessionName("codex", "edit")).toBe("reel-codex-edit"); });
});
