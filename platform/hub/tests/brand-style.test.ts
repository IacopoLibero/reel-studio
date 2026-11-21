import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { readBrand } from "../src/brands/registry.js";
import { resetFontCache } from "../src/creator/fonts.js";
import { writeTestBrand } from "./helpers/brand.js";

const TOKEN = "t0ken";
const auth = { authorization: `Bearer ${TOKEN}` };
let tmp: string, root: string, data: string, app: FastifyInstance;

beforeAll(() => { process.env.HUB_SCHEDULER = "off"; process.env.HUB_LOG_LEVEL = "silent"; });
afterAll(() => { delete process.env.HUB_SCHEDULER; delete process.env.HUB_LOG_LEVEL; });

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), "brand-style-"));
  root = join(tmp, "root"); data = join(tmp, "data"); mkdirSync(data); mkdirSync(join(tmp, "web")); writeFileSync(join(tmp, "web/index.html"), "<html></html>");
  writeTestBrand(root, "acme", { name: "Acme", instagram: { account: "acme_cafe", userId: "111", profileDir: null } }, "## To do\n\n- [ ] Is a paper menu cheaper? · hook: myth · source: needs source\n");
  writeTestBrand(root, "beta", { name: "Beta", character: { enabled: true, id: "pip", name: "Pip" } }, "## To do\n");
  const config: Config = { port: 0, host: "127.0.0.1", dataDir: data, root, token: TOKEN, webDir: join(tmp, "web"), novncTarget: "http://127.0.0.1:1", claudeBin: "/nonexistent", blogDir: join(tmp, "blog"), terminalCmd: null };
  app = (await buildApp(config)).app;
  await app.ready();
});
afterEach(async () => { await app.close(); rmSync(tmp, { recursive: true, force: true }); });

const get = (url: string) => app.inject({ url, headers: auth });
const put = (url: string, payload: unknown) => app.inject({ method: "PUT", url, headers: auth, payload: payload as object });

const style = {
  colors: { background: "#101010", text: "#fafafa", accent: "#ff8800", secondary: "#00aaff" },
  fonts: { headline: "Oswald", body: "Inter" },
  closing: { A: { label: "Offer", line: "Try the offer on acme.example." }, B: { label: "Tips", line: "Follow for more tips." } },
};

describe("the brand style (colours, fonts, closing lines)", () => {
  it("refuses a font that Remotion cannot load when the list is available, and keeps brand.json as it was", async () => {
    resetFontCache();
    const dir = join(root, "node_modules/@remotion/google-fonts");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "@remotion/google-fonts", version: "0.0.0", main: "index.js" }));
    writeFileSync(join(dir, "index.js"), 'exports.getAvailableFonts = () => [{ fontFamily: "Oswald" }, { fontFamily: "Inter" }];');
    try {
      const before = readBrand(root, "acme")!;
      const r = await put("/api/brands/acme/style", { ...style, fonts: { headline: "Oswlad", body: "Inter" } });
      expect(r.statusCode).toBe(400);
      expect(r.json().error).toMatch(/fonts\.headline.*Oswlad/);
      expect(readBrand(root, "acme")).toEqual(before);
      expect((await put("/api/brands/acme/style", style)).statusCode).toBe(200);
    } finally { resetFontCache(); }
  });
  it("reads the style of one brand", async () => {
    const r = (await get("/api/brands/acme/style")).json();
    expect(r.colors.accent).toBe("#2f6fed");
    expect(r.fonts).toHaveProperty("headline");
    expect(Object.keys(r.closing)).toEqual(["A", "B"]);
  });
  it("saves a new style into brand.json and leaves the rest of the brand and the other brands alone", async () => {
    const before = readBrand(root, "acme")!;
    const betaBefore = readBrand(root, "beta")!;
    const r = await put("/api/brands/acme/style", style);
    expect(r.statusCode).toBe(200);
    const after = readBrand(root, "acme")!;
    expect(after.colors).toEqual(style.colors);
    expect(after.fonts).toEqual(style.fonts);
    expect(after.closing).toEqual(style.closing);
    expect({ ...after, colors: before.colors, fonts: before.fonts, closing: before.closing }).toEqual(before);
    expect(readBrand(root, "beta")).toEqual(betaBefore);
    expect((await get("/api/brands")).json().brands[0].accent).toBe("#ff8800");
  });
  it("refuses a colour that is not a hex colour and keeps brand.json as it was", async () => {
    const before = readBrand(root, "acme")!;
    const r = await put("/api/brands/acme/style", { ...style, colors: { ...style.colors, accent: "orange" } });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/colou?r/i);
    expect(readBrand(root, "acme")).toEqual(before);
  });
  it("refuses an empty font name and a missing field", async () => {
    expect((await put("/api/brands/acme/style", { ...style, fonts: { headline: " ", body: "Inter" } })).statusCode).toBe(400);
    expect((await put("/api/brands/acme/style", { colors: style.colors })).statusCode).toBe(400);
  });
  it("answers an unknown brand with 404 and needs the token", async () => {
    expect((await put("/api/brands/nope/style", style)).statusCode).toBe(404);
    expect((await app.inject({ method: "PUT", url: "/api/brands/acme/style", payload: style })).statusCode).toBe(401);
  });
});
