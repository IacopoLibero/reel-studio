import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { contrastLevel, contrastRatio, isHex } from "../src/shared/contrast.js";
import { buildImagePrompt, EXPRESSIONS } from "../src/shared/character-prompt.js";
import { checkFile, FileError, isSafeSvg, LIMITS } from "../src/creator/files.js";
import { UploadStore } from "../src/creator/uploads.js";
import { checkFont, loadFontList, resetFontCache } from "../src/creator/fonts.js";
import { readZip, ZipError } from "../src/creator/zip.js";
import { JPG, makeZip, PNG, SVG, WAV } from "./helpers/zip.js";

describe("contrast", () => {
  it("knows black on white and a weak pair", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastLevel(contrastRatio("#1a1a1a", "#f5f0e8"))).toBe("good");
    expect(contrastLevel(contrastRatio("#777777", "#888888"))).toBe("poor");
    expect(contrastLevel(3.2)).toBe("large-text-only");
    expect(contrastRatio("red", "#fff")).toBe(0);
    expect(isHex("#12abEF")).toBe(true);
    expect(isHex("#12abE")).toBe(false);
  });
});

describe("character image prompt", () => {
  it("inserts the brand colours, the style and every expression", () => {
    const p = buildImagePrompt({ what: "a friendly loaf of bread", personality: "cheerful", extra: "" }, { background: "#f5f0e8", text: "#1a1a1a", accent: "#d94a3d", secondary: "#854dff" }, "Acme Bakery");
    for (const t of ["Acme Bakery", "a friendly loaf of bread", "#d94a3d", "#854dff", "#f5f0e8", "flat 2D vector", "front view, three-quarter view and side view", ...EXPRESSIONS]) expect(p).toContain(t);
    expect(buildImagePrompt({ what: "", personality: "", extra: "" }, { background: "#fff", text: "#000", accent: "#111", secondary: "#222" })).toContain("describe what the character is");
  });
});

describe("file checks", () => {
  it("accepts the right content and refuses the wrong one, whatever the name says", () => {
    expect(checkFile("logo", PNG).ext).toBe("png");
    expect(checkFile("logo", SVG).ext).toBe("svg");
    expect(checkFile("sheet", JPG).ext).toBe("jpg");
    expect(checkFile("voice", WAV).ext).toBe("wav");
    expect(() => checkFile("logo", Buffer.from("GIF89a....."))).toThrow(FileError);
    expect(() => checkFile("sheet", SVG)).toThrow(/PNG or a JPG/);
    expect(() => checkFile("voice", PNG)).toThrow(/WAV/);
    expect(() => checkFile("zip", PNG)).toThrow(/zip/);
    expect(() => checkFile("logo", Buffer.alloc(0))).toThrow(/empty/);
    expect(() => checkFile("logo", Buffer.concat([PNG, Buffer.alloc(LIMITS.logo)]))).toThrow(/too big/);
  });
  it("refuses an SVG that can run code or load other files", () => {
    const bad = (s: string) => isSafeSvg(Buffer.from(s));
    expect(bad('<svg xmlns="x"><script>alert(1)</script></svg>')).toBe(false);
    expect(bad('<svg xmlns="x" onload="x()"></svg>')).toBe(false);
    expect(bad('<svg xmlns="x"><a href="https://evil.test"><rect/></a></svg>')).toBe(false);
    expect(bad('<svg xmlns="x"><foreignObject/></svg>')).toBe(false);
    expect(bad("<html></html>")).toBe(false);
    expect(bad('<svg xmlns="x"><use href="#a"/></svg>')).toBe(true);
  });
});

describe("upload store", () => {
  let dir: string, store: UploadStore;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "up-")); store = new UploadStore(join(dir, "u")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  it("stores, finds by id and kind, removes, and ignores bad ids", () => {
    const s = store.put("logo", PNG);
    expect(s.id).toMatch(/^[0-9a-f]{32}$/);
    expect(store.get(s.id, "logo")?.ext).toBe("png");
    expect(store.get(s.id, "voice")).toBeNull();
    expect(store.read(s.id, "logo").data.equals(PNG)).toBe(true);
    expect(store.get("../etc/passwd", "logo")).toBeNull();
    store.remove(s.id);
    expect(store.get(s.id, "logo")).toBeNull();
    expect(() => store.read(s.id, "logo")).toThrow(/gone/);
    expect(() => store.put("voice", PNG)).toThrow(FileError);
  });
  it("cleans up old files", () => {
    const s = store.put("sheet", PNG);
    store.gc(1000, Date.now() + 5000);
    expect(existsSync(s.path)).toBe(false);
  });
});

describe("font list", () => {
  it("checks names against the Remotion list, with suggestions", async () => {
    resetFontCache();
    const list = await loadFontList(async () => ({ getAvailableFonts: () => [{ fontFamily: "Oswald" }, { fontFamily: "Inter" }, { fontFamily: "Open Sans" }] }));
    expect(list).toEqual({ names: ["Inter", "Open Sans", "Oswald"], checked: true });
    expect(checkFont(list, "Oswald").ok).toBe(true);
    expect(checkFont(list, "oswald")).toEqual({ ok: false, suggestions: ["Oswald"] });
    expect(checkFont(list, "Comic Nope")).toEqual({ ok: false, suggestions: [] });
    resetFontCache();
  });
  it("does not refuse names when the package is missing", async () => {
    resetFontCache();
    const list = await loadFontList(async () => { throw new Error("not installed"); });
    expect(list.checked).toBe(false);
    expect(checkFont(list, "Anything").ok).toBe(true);
  });
  it("knows the real Google fonts when the package is installed", async () => {
    resetFontCache();
    const list = await loadFontList();
    if (list.checked) { expect(checkFont(list, "Oswald").ok).toBe(true); expect(checkFont(list, "Not A Font").ok).toBe(false); }
    resetFontCache();
  });
});

describe("zip reader", () => {
  it("reads stored and deflated files and skips folders", () => {
    const z = makeZip([{ name: "a/", data: "" }, { name: "a/brand.json", data: "{}" }, { name: "b.txt", data: "hello", stored: true }]);
    expect(readZip(z).map((e) => [e.name, e.data.toString()])).toEqual([["a/brand.json", "{}"], ["b.txt", "hello"]]);
  });
  it("refuses damaged, oversized, linked and too-many-file zips", () => {
    expect(() => readZip(Buffer.from("not a zip at all, just text"))).toThrow(ZipError);
    expect(() => readZip(makeZip([{ name: "big", data: Buffer.alloc(2000) }]), { maxEntries: 5, maxEntryBytes: 1000, maxTotalBytes: 5000 })).toThrow(/too big/);
    expect(() => readZip(makeZip([{ name: "a", data: "1" }, { name: "b", data: "2" }]), { maxEntries: 1, maxEntryBytes: 10, maxTotalBytes: 10 })).toThrow(/too many/);
    expect(() => readZip(makeZip([{ name: "a", data: "1" }, { name: "b", data: "2" }]), { maxEntries: 5, maxEntryBytes: 10, maxTotalBytes: 1 })).toThrow(/once unpacked/);
    expect(() => readZip(makeZip([{ name: "link", data: "/etc/passwd", mode: 0o120777 }]))).toThrow(/symbolic link/);
    const z = makeZip([{ name: "a", data: "hello world" }]);
    z.writeUInt32LE(5, z.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 24); // the central directory says 5 bytes
    expect(() => readZip(z)).toThrow(ZipError);
  });
});
