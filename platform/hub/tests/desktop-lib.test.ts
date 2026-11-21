import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const req = createRequire(import.meta.url);
const hub = req("../../desktop/lib/hub.cjs");
const notify = req("../../desktop/lib/notify.cjs");
const autostart = req("../../desktop/lib/autostart.cjs");

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "desktop-")); });
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

const res = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe("augmentPath", () => {
  it("adds the folders where Claude Code usually lives, once, after the current PATH", () => {
    const p = hub.augmentPath("/usr/bin:/bin", "/home/u").split(":");
    expect(p.slice(0, 2)).toEqual(["/usr/bin", "/bin"]);
    expect(p).toContain("/home/u/.local/bin");
    expect(hub.augmentPath(hub.augmentPath("/usr/bin", "/home/u"), "/home/u").split(":").filter((x: string) => x === "/home/u/.local/bin")).toHaveLength(1);
  });
});

describe("waitHealth", () => {
  it("resolves true as soon as the hub answers", async () => {
    let n = 0;
    const ok = await hub.waitHealth("http://x", { timeoutMs: 1000, intervalMs: 1, fetch: async () => (++n < 3 ? Promise.reject(new Error("down")) : res(200)) });
    expect(ok).toBe(true); expect(n).toBe(3);
  });
  it("gives up after the timeout", async () => {
    expect(await hub.waitHealth("http://x", { timeoutMs: 20, intervalMs: 5, fetch: async () => res(503) })).toBe(false);
  });
});

describe("token and sign-in", () => {
  it("reads the token the hub wrote, trimmed, or null", () => {
    expect(hub.readToken(tmp)).toBeNull();
    writeFileSync(join(tmp, "dev-token"), "abc123\n");
    expect(hub.readToken(tmp)).toBe("abc123");
  });
  it("asks for a pass with the token and builds the address of the window", async () => {
    let seen: { url: string; init: { headers: Record<string, string>; method: string } } | null = null;
    const url = await hub.enterUrl("http://127.0.0.1:4000", "tok", async (u: string, init: never) => { seen = { url: u, init }; return res(200, { nonce: "n0nce" }); });
    expect(url).toBe("http://127.0.0.1:4000/api/enter?n=n0nce");
    expect(seen!.url).toBe("http://127.0.0.1:4000/api/enter-nonce");
    expect(seen!.init.headers.authorization).toBe("Bearer tok");
  });
  it("fails clearly when the hub refuses the token", async () => {
    await expect(hub.enterUrl("http://h", "bad", async () => res(401))).rejects.toThrow(/refused|401/i);
  });
});

describe("pollNotifications", () => {
  it("shows every unseen notification and marks each seen", async () => {
    const shown: string[] = []; const calls: string[] = [];
    const fetch = async (u: string, init: { method?: string }) => {
      calls.push(`${init.method ?? "GET"} ${u}`);
      return u.includes("unseen=1") ? res(200, [{ id: "a", title: "T1", body: "B1", url: "/x" }, { id: "b", title: "T2", body: "B2", url: "/y" }]) : res(200, { ok: true });
    };
    await notify.pollNotifications({ base: "http://h", token: "t", fetch, show: (n: { id: string }) => shown.push(n.id) });
    expect(shown).toEqual(["a", "b"]);
    expect(calls).toContain("POST http://h/api/notifications/a/seen");
    expect(calls).toContain("POST http://h/api/notifications/b/seen");
  });
  it("does nothing when the hub is down", async () => {
    const shown: string[] = [];
    await notify.pollNotifications({ base: "http://h", token: "t", fetch: async () => { throw new Error("down"); }, show: (n: { id: string }) => shown.push(n.id) });
    expect(shown).toEqual([]);
  });
  it("does not mark seen a notification that could not be shown", async () => {
    const calls: string[] = [];
    const fetch = async (u: string, init: { method?: string }) => { calls.push(`${init.method ?? "GET"} ${u}`); return u.includes("unseen") ? res(200, [{ id: "a", title: "T", body: "B", url: "/" }]) : res(200); };
    await notify.pollNotifications({ base: "http://h", token: "t", fetch, show: () => { throw new Error("no display"); } });
    expect(calls.some((c) => c.includes("/seen"))).toBe(false);
  });
});

describe("autostart", () => {
  it("writes and removes the login entry, and says whether it is on", () => {
    const o = { home: tmp, command: "/usr/bin/reel-studio" };
    expect(autostart.isOn(o)).toBe(false);
    autostart.set(true, o);
    const f = join(tmp, ".config", "autostart", "reel-studio.desktop");
    expect(readFileSync(f, "utf8")).toMatch(/Exec=\/usr\/bin\/reel-studio --hidden/);
    expect(autostart.isOn(o)).toBe(true);
    autostart.set(false, o);
    expect(existsSync(f)).toBe(false);
    autostart.set(false, o);
  });
});
