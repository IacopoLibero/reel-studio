import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { readBrand } from "../src/brands/registry.js";
import { writeTestBrand } from "./helpers/brand.js";

const TOKEN = "t0ken";
const auth = { authorization: `Bearer ${TOKEN}` };
let tmp: string, data: string, app: FastifyInstance;
beforeAll(() => { process.env.HUB_SCHEDULER = "off"; process.env.HUB_LOG_LEVEL = "silent"; });
afterAll(() => { delete process.env.HUB_SCHEDULER; delete process.env.HUB_LOG_LEVEL; });
const STYLE = "# Style guide\n\n## About the brand\n- What it is: bread\n- The reels are written and spoken in English.\n- Tone: warm\n\n## Voice\n- Engine: VoiceStudio\n";

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), "brand-lang-"));
  const root = join(tmp, "root"); data = join(tmp, "data");
  mkdirSync(data); mkdirSync(join(tmp, "web")); writeFileSync(join(tmp, "web/index.html"), "<html></html>");
  writeTestBrand(root, "acme", { name: "Acme", language: "en" }, undefined, data);
  writeFileSync(join(data, "brands/acme/identity/style.md"), STYLE);
  const config: Config = { port: 0, host: "127.0.0.1", dataDir: data, root, token: TOKEN, webDir: join(tmp, "web"), claudeBin: "/nonexistent", blogDir: join(tmp, "blog"), terminalCmd: null };
  app = (await buildApp(config)).app; await app.ready();
});
afterEach(async () => { await app.close(); rmSync(tmp, { recursive: true, force: true }); });
const put = (url: string, payload: unknown, headers: Record<string, string> = auth) => app.inject({ method: "PUT", url, headers, payload: payload as object });

describe("PUT /api/brands/:slug/language", () => {
  it("changes the language of the reels in brand.json and in the sentence of style.md, nothing else", async () => {
    const before = readBrand(data, "acme")!;
    const r = await put("/api/brands/acme/language", { language: "it" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ language: "it", name: "Italian" });
    expect(readBrand(data, "acme")).toEqual({ ...before, language: "it" });
    const md = readFileSync(join(data, "brands/acme/identity/style.md"), "utf8");
    expect(md).toContain("- The reels are written and spoken in Italian.");
    expect(md).toBe(STYLE.replace("English", "Italian"));
  });
  it("refuses a language the voice does not speak, and one that is not a code", async () => {
    for (const language of ["xx", "Italian", "", "../it"]) expect((await put("/api/brands/acme/language", { language })).statusCode, language).toBe(400);
    expect((await put("/api/brands/acme/language", {})).statusCode).toBe(400);
    expect(readBrand(data, "acme")!.language).toBe("en");
  });
  it("needs the login and a brand that exists", async () => {
    expect((await put("/api/brands/acme/language", { language: "it" }, {})).statusCode).toBe(401);
    expect((await put("/api/brands/nope/language", { language: "it" })).statusCode).toBe(404);
  });
  it("works when the brand has no style.md sentence (the brand is still changed)", async () => {
    writeFileSync(join(data, "brands/acme/identity/style.md"), "# Style\n");
    expect((await put("/api/brands/acme/language", { language: "fr" })).statusCode).toBe(200);
    expect(readBrand(data, "acme")!.language).toBe("fr");
    expect(readFileSync(join(data, "brands/acme/identity/style.md"), "utf8")).toBe("# Style\n");
  });
  it("the brand list carries the language and the list of languages is served", async () => {
    await put("/api/brands/acme/language", { language: "es" });
    const b = (await app.inject({ url: "/api/brands/acme", headers: auth })).json();
    expect(b.language).toBe("es");
    const l = (await app.inject({ url: "/api/voice-languages", headers: auth })).json();
    expect(l).toHaveLength(30);
    expect(l[0]).toEqual({ code: "ar", name: "Arabic" });
  });
});
