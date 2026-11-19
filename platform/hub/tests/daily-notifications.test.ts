import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NotificationStore } from "../src/daily/notifications.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "notes-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("NotificationStore", () => {
  it("adds unseen, lists newest first, filters unseen", () => {
    const s = NotificationStore.at(dir);
    const a = s.add({ kind: "daily", title: "one", body: "b" });
    expect(s.add({ kind: "daily", brand: "acme", title: "x", body: "b" }).brand).toBe("acme");
    const b = s.add({ kind: "test", title: "two", body: "b", url: "/daily" });
    expect(s.list().map((n) => n.title)).toEqual(["two", "x", "one"]);
    expect(s.list(true)).toHaveLength(3);
    expect(a.url).toBe("/#/daily");
    expect(a.brand).toBe("");
    expect(b.seen).toBe(false);
  });
  it("marks seen once and keeps the first time", () => {
    const s = NotificationStore.at(dir);
    const n = s.add({ kind: "daily", title: "t", body: "b" });
    const first = s.markSeen(n.id, new Date("2026-11-20T06:00:00Z"));
    const again = s.markSeen(n.id, new Date("2026-11-20T07:00:00Z"));
    expect(first?.seenAt).toBe(again?.seenAt);
    expect(s.list(true)).toHaveLength(0);
    expect(s.markSeen("nope")).toBeNull();
  });
  it("persists across instances and survives a corrupt file", () => {
    NotificationStore.at(dir).add({ kind: "daily", title: "t", body: "b" });
    expect(NotificationStore.at(dir).list()).toHaveLength(1);
    writeFileSync(join(dir, "notifications.json"), "garbage");
    expect(NotificationStore.at(dir).list()).toEqual([]);
  });
  it("keeps at most 200", () => {
    const s = NotificationStore.at(dir);
    for (let i = 0; i < 205; i++) s.add({ kind: "daily", title: String(i), body: "" });
    expect(s.list()).toHaveLength(200);
    expect(s.list()[0]?.title).toBe("204");
  });
});
