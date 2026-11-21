import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { readBrand } from "../src/brands/registry.js";
import { writeTestBrand } from "./helpers/brand.js";
import { JPG, PNG, SVG } from "./helpers/zip.js";

const TOKEN = "t0ken";
const auth = { authorization: `Bearer ${TOKEN}` };
let tmp: string, root: string, data: string, app: FastifyInstance;

beforeAll(() => { process.env.HUB_SCHEDULER = "off"; process.env.HUB_LOG_LEVEL = "silent"; });
afterAll(() => { delete process.env.HUB_SCHEDULER; delete process.env.HUB_LOG_LEVEL; });

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), "brand-logo-"));
  root = join(tmp, "root"); data = join(tmp, "data"); mkdirSync(data); mkdirSync(join(tmp, "web")); writeFileSync(join(tmp, "web/index.html"), "<html></html>");
  writeTestBrand(root, "acme", { name: "Acme", instagram: { account: "acme_cafe", userId: "111", profileDir: null } }, "## To do\n\n- [ ] Is a paper menu cheaper? · hook: myth · source: needs source\n");
  writeTestBrand(root, "beta", { name: "Beta", character: { enabled: true, id: "pip", name: "Pip" } }, "## To do\n");
  const config: Config = { port: 0, host: "127.0.0.1", dataDir: data, root, token: TOKEN, webDir: join(tmp, "web"), novncTarget: "http://127.0.0.1:1", claudeBin: "/nonexistent", blogDir: join(tmp, "blog"), terminalCmd: null };
  app = (await buildApp(config)).app;
  await app.ready();
});
afterEach(async () => { await app.close(); rmSync(tmp, { recursive: true, force: true }); });

const get = (url: string) => app.inject({ url, headers: auth });
const send = (method: "PUT" | "DELETE", url: string, payload?: Buffer, extra: Record<string, string> = {}) =>
  app.inject({ method, url, headers: { ...auth, "content-type": "application/octet-stream", ...extra }, ...(payload ? { payload } : {}) });
const logoPath = (slug: string) => join(root, "brand", slug, "identity", "logo.png");

const NO_LOGO = "- Brand: Acme, `acme.example`. No logo yet: the cover is drawn without a logo frame. When there is one, save it in the identity folder as logo.png.\n";
const WITH_LOGO = "- Brand: Acme, `acme.example`. Logo: `brand/acme/identity/logo.png`.\n";

describe("the brand logo", () => {
  it("keeps the logo line of style.md true: set writes the logo path, remove goes back to 'No logo yet'", async () => {
    const md = join(root, "brand/acme/identity/style.md");
    writeFileSync(md, NO_LOGO);
    await send("PUT", "/api/brands/acme/logo", PNG);
    expect(readFileSync(md, "utf8")).toBe(WITH_LOGO);
    await send("PUT", "/api/brands/acme/logo", PNG);
    expect(readFileSync(md, "utf8")).toBe(WITH_LOGO);
    await send("DELETE", "/api/brands/acme/logo");
    expect(readFileSync(md, "utf8")).toBe(NO_LOGO);
  });
  it("leaves a style.md that has no such line, or no style.md at all, alone", async () => {
    rmSync(join(root, "brand/acme/identity/style.md"), { force: true });
    expect((await send("PUT", "/api/brands/acme/logo", PNG)).statusCode).toBe(200);
    expect(existsSync(join(root, "brand/acme/identity/style.md"))).toBe(false);
    writeFileSync(join(root, "brand/acme/identity/style.md"), "# My own words\n");
    await send("DELETE", "/api/brands/acme/logo");
    expect(readFileSync(join(root, "brand/acme/identity/style.md"), "utf8")).toBe("# My own words\n");
  });
  it("has none to start with: the brand list says so and the picture is a 404", async () => {
    expect((await get("/api/brands")).json().brands[0].hasLogo).toBe(false);
    expect((await get("/api/brands/acme/logo")).statusCode).toBe(404);
  });
  it("stores a PNG as brand/<slug>/identity/logo.png and serves it back", async () => {
    const r = await send("PUT", "/api/brands/acme/logo", PNG);
    expect(r.statusCode).toBe(200);
    expect(readFileSync(logoPath("acme")).equals(PNG)).toBe(true);
    const back = await get("/api/brands/acme/logo");
    expect(back.statusCode).toBe(200);
    expect(back.headers["content-type"]).toBe("image/png");
    expect(back.rawPayload.equals(PNG)).toBe(true);
    expect((await get("/api/brands")).json().brands[0].hasLogo).toBe(true);
    expect(existsSync(logoPath("beta"))).toBe(false);
  });
  it("replaces a logo that is already there", async () => {
    await send("PUT", "/api/brands/acme/logo", PNG);
    const other = Buffer.concat([PNG, Buffer.from("more")]);
    expect((await send("PUT", "/api/brands/acme/logo", other)).statusCode).toBe(200);
    expect(readFileSync(logoPath("acme")).equals(other)).toBe(true);
  });
  it("refuses what is not a PNG and keeps the logo it had", async () => {
    await send("PUT", "/api/brands/acme/logo", PNG);
    for (const bad of [JPG, SVG, Buffer.from("hello")]) {
      const r = await send("PUT", "/api/brands/acme/logo", bad);
      expect(r.statusCode).toBe(400);
      expect(r.json().error).toMatch(/PNG/);
    }
    expect(readFileSync(logoPath("acme")).equals(PNG)).toBe(true);
  });
  it("refuses a file over 1 MB", async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]);
    const r = await send("PUT", "/api/brands/acme/logo", big);
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/too big/);
  });
  it("refuses an empty body", async () => {
    expect((await send("PUT", "/api/brands/acme/logo")).statusCode).toBe(400);
  });
  it("removes the logo, and removing it twice is fine", async () => {
    await send("PUT", "/api/brands/acme/logo", PNG);
    expect((await send("DELETE", "/api/brands/acme/logo")).statusCode).toBe(200);
    expect(existsSync(logoPath("acme"))).toBe(false);
    expect((await send("DELETE", "/api/brands/acme/logo")).statusCode).toBe(200);
    expect((await get("/api/brands/acme/logo")).statusCode).toBe(404);
  });
  it("answers an unknown brand with 404 and needs the token", async () => {
    expect((await send("PUT", "/api/brands/nope/logo", PNG)).statusCode).toBe(404);
    expect((await app.inject({ method: "PUT", url: "/api/brands/acme/logo", payload: PNG, headers: { "content-type": "application/octet-stream" } })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/brands/acme/logo" })).statusCode).toBe(401);
  });
});
