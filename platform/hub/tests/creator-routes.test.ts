import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp, type AppDeps } from "../src/app.js";
import type { Config } from "../src/config.js";
import { writeTestBrand } from "./helpers/brand.js";
import { formBrand } from "./helpers/creator.js";
import { JPG, makeZip, PNG, SVG, WAV } from "./helpers/zip.js";

const TOKEN = "t0ken";
const auth = { authorization: `Bearer ${TOKEN}` };
const FX = join(import.meta.dirname, "fixtures");
let tmp: string, root: string, data: string, app: FastifyInstance, deps: AppDeps;

beforeAll(() => { process.env.HUB_SCHEDULER = "off"; process.env.HUB_LOG_LEVEL = "silent"; process.env.VOICE_PORT = "9"; });
afterAll(() => { delete process.env.HUB_SCHEDULER; delete process.env.HUB_LOG_LEVEL; delete process.env.VOICE_PORT; });

/** Boots the hub in a fresh scratch folder; `makeBin` may write a stand-in claude there and return its path. */
async function bootWith(makeBin: (dir: string) => string): Promise<void> {
  tmp = mkdtempSync(join(tmpdir(), "creator-routes-"));
  await boot(makeBin(tmp), tmp);
}

async function boot(claudeBin = "/nonexistent", dir?: string): Promise<void> {
  tmp = dir ?? mkdtempSync(join(tmpdir(), "creator-routes-"));
  root = join(tmp, "root"); data = join(tmp, "data");
  mkdirSync(data); mkdirSync(join(tmp, "web")); writeFileSync(join(tmp, "web/index.html"), "<html></html>");
  mkdirSync(root, { recursive: true });
  writeTestBrand(root, "acme", { name: "Acme" }, "## To do\n");
  const config: Config = { port: 0, host: "127.0.0.1", dataDir: data, root, token: TOKEN, webDir: join(tmp, "web"), claudeBin, blogDir: join(tmp, "blog"), terminalCmd: null };
  const built = await buildApp(config);
  app = built.app; deps = built.deps;
  await app.ready();
}
beforeEach(() => boot());
afterEach(async () => { delete process.env.FAKE_MODE; await app.close(); rmSync(tmp, { recursive: true, force: true }); });

const get = (url: string) => app.inject({ url, headers: auth });
const post = (url: string, payload: unknown) => app.inject({ method: "POST", url, headers: auth, payload: payload as object });
const raw = (method: "POST" | "PUT", url: string, body: Buffer) => app.inject({ method, url, headers: { ...auth, "content-type": "application/octet-stream" }, payload: body });
const waitJob = async (id: string) => { for (let i = 0; i < 100; i++) { const j = deps.store.get(id); if (j && j.status !== "queued" && j.status !== "running") return j; await new Promise((r) => setTimeout(r, 30)); } throw new Error("job did not finish"); };

describe("creator options and validation", () => {
  it("needs the token", async () => {
    expect((await app.inject({ url: "/api/brand-creator/options" })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/brands", payload: {} })).statusCode).toBe(401);
  });
  it("lists the assistant, brands, voices and characters", async () => {
    mkdirSync(join(data, "brands/acme/mascot"), { recursive: true }); writeFileSync(join(data, "brands/acme/mascot/bun.py"), "");
    writeTestBrand(root, "voiced", { voice: { engine: "voxcpm2", sample: "identity/voice.wav", sampleText: "identity/voice.txt" } });
    const r = (await get("/api/brand-creator/options")).json();
    expect(r).toMatchObject({ assistant: { kind: "claude", tested: true }, slugs: ["acme", "voiced"], voices: [{ slug: "voiced" }], characters: ["bun"] });
  });
  it("serves the font list and validates a brand with readable errors", async () => {
    const f = (await get("/api/brand-creator/fonts")).json();
    expect(typeof f.checked).toBe("boolean");
    const ok = (await post("/api/brand-creator/validate", { brand: formBrand() })).json();
    expect(ok.ok).toBe(true);
    const bad = (await post("/api/brand-creator/validate", { brand: { ...formBrand("Acme", "acme"), colors: { background: "x", text: "#000000", accent: "#000000", secondary: "#000000" } } })).json();
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(" ")).toContain("colors.background");
    const dup = (await post("/api/brand-creator/validate", { brand: formBrand("Acme", "acme") })).json();
    expect(dup.errors.join(" ")).toContain("already exists");
    if (f.checked) expect((await post("/api/brand-creator/validate", { brand: { ...formBrand(), fonts: { headline: "Not A Font", body: "Inter" } } })).json().errors.join(" ")).toContain("Not A Font");
    expect((await post("/api/brand-creator/validate", {})).statusCode).toBe(400);
  });
});

describe("the voice step", () => {
  it("needs the token and valid params", async () => {
    expect((await app.inject({ method: "POST", url: "/api/brand-creator/voices", payload: {} })).statusCode).toBe(401);
    expect((await post("/api/brand-creator/voices", { brand: { name: "" } })).statusCode).toBe(400);
  });
  it("hands back the open voice job instead of starting a second one", async () => {
    const open = deps.store.create({ type: "voice.generate", brand: "new", title: "open", steps: [], params: {} });
    const r = await post("/api/brand-creator/voices", { brand: { name: "Acme" } });
    expect(r.statusCode).toBe(200);
    expect(r.json().job.id).toBe(open.id);
  });
  it("starts the job; with no VoiceStudio it fails with a message a person can act on", async () => {
    const r = await post("/api/brand-creator/voices", { brand: { name: "Acme", language: "it" } });
    expect(r.statusCode).toBe(202);
    const j = await waitJob(r.json().job.id);
    expect(j).toMatchObject({ type: "voice.generate", brand: "new", status: "failed" });
    expect(j.error).toMatch(/VoiceStudio is not running/);
  });
  it("plays a staged voice and says when it is gone", async () => {
    const id = (await raw("POST", "/api/brand-creator/uploads/voice", WAV)).json().id as string;
    const ok = await get(`/api/brand-creator/uploads/voice/${id}`);
    expect(ok.statusCode).toBe(200);
    expect(ok.headers["content-type"]).toBe("audio/wav");
    expect((await get(`/api/brand-creator/uploads/voice/${"0".repeat(32)}`)).statusCode).toBe(404);
    expect((await get("/api/brand-creator/uploads/voice/../../etc")).statusCode).toBe(404);
  });
});

describe("uploads", () => {
  it("accepts the right files and refuses the wrong ones", async () => {
    expect((await raw("POST", "/api/brand-creator/uploads/logo", PNG)).json()).toMatchObject({ ext: "png" });
    expect((await raw("POST", "/api/brand-creator/uploads/logo", SVG)).json().error).toContain("must be a PNG"); // covers draw logo.png: no SVG
    expect((await raw("POST", "/api/brand-creator/uploads/sheet", JPG)).json()).toMatchObject({ ext: "jpg" });
    expect((await raw("POST", "/api/brand-creator/uploads/voice", WAV)).json()).toMatchObject({ ext: "wav" });
    const bad = await raw("POST", "/api/brand-creator/uploads/logo", Buffer.from("<html><script>x</script></html>"));
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toContain("The logo must be a PNG");
    expect((await raw("POST", "/api/brand-creator/uploads/voice", PNG)).statusCode).toBe(400);
    expect((await raw("POST", "/api/brand-creator/uploads/exe", PNG)).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/api/brand-creator/uploads/logo", headers: auth, payload: {} })).statusCode).toBe(400);
  });
});

describe("importing a brand folder", () => {
  const brandJson = (over: object = {}) => JSON.stringify({ ...formBrand("Zed Shop", "zed-shop"), ...over });
  it("previews a zip and refuses traversal, symlinks, bombs and nonsense", async () => {
    const ok = await raw("POST", "/api/brand-creator/import/zip", makeZip([{ name: "zed/brand.json", data: brandJson() }, { name: "zed/style.md", data: "# S" }, { name: "zed/junk.sh", data: "x" }]));
    expect(ok.statusCode).toBe(200);
    expect(ok.json().preview).toMatchObject({ styleMd: true, brand: { slug: "zed-shop" } });
    expect(ok.json().importId).toMatch(/^[0-9a-f]{32}$/);
    const trav = await raw("POST", "/api/brand-creator/import/zip", makeZip([{ name: "../evil.txt", data: "x" }, { name: "brand.json", data: brandJson() }]));
    expect(trav.statusCode).toBe(400);
    expect(trav.json().error).toContain("not allowed");
    expect((await raw("POST", "/api/brand-creator/import/zip", makeZip([{ name: "brand.json", data: brandJson() }, { name: "l", data: "/etc/passwd", mode: 0o120777 }]))).json().error).toContain("symbolic link");
    expect((await raw("POST", "/api/brand-creator/import/zip", Buffer.from("not a zip"))).statusCode).toBe(400);
    expect((await raw("POST", "/api/brand-creator/import/zip", makeZip([{ name: "a.txt", data: "x" }]))).json().error).toContain("no brand.json");
    expect(readdirSync(join(data, "tmp-uploads")).filter((f) => f.endsWith(".bundle.dir"))).toHaveLength(1);
  });
  it("previews a picked folder, and gives a taken slug a new name", async () => {
    const files = [{ path: "acme/brand.json", data: Buffer.from(brandJson({ slug: "acme" })).toString("base64") }, { path: "acme/logo.png", data: PNG.toString("base64") }];
    const r = (await post("/api/brand-creator/import/folder", { files })).json();
    expect(r.preview.brand.slug).toBe("acme-2");
    expect(r.preview.logo).toBe("png");
    expect((await post("/api/brand-creator/import/folder", { files: [{ path: "../x", data: "eA==" }] })).statusCode).toBe(400);
    expect((await post("/api/brand-creator/import/folder", { nope: 1 })).statusCode).toBe(400);
  });
});

describe("creating a brand", () => {
  it("runs the one brand.create job end to end from the form", async () => {
    const logo = (await raw("POST", "/api/brand-creator/uploads/logo", PNG)).json();
    const r = await post("/api/brands", { source: "form", brand: formBrand(), logoUpload: logo.id });
    expect(r.statusCode).toBe(202);
    const { job, slug } = r.json();
    expect(slug).toBe("acme-bakery");
    expect(job).toMatchObject({ type: "brand.create", brand: "acme-bakery" });
    const done = await waitJob(job.id);
    expect(done.status).toBe("done");
    expect(done.result).toMatchObject({ slug: "acme-bakery", nextSteps: expect.any(Array) });
    expect((await get("/api/brands")).json().brands.map((b: { slug: string }) => b.slug)).toEqual(["acme", "acme-bakery"]);
    expect((await get("/api/brands/acme-bakery/factory/questions")).json()).toEqual([]);
    expect((await get("/api/brands/acme-bakery/reels")).json()).toEqual([]);
    expect(existsSync(join(data, "brands/acme-bakery/reels"))).toBe(true);
  });
  it("picks a free slug when none is given and refuses clashes and bad input at once", async () => {
    const { slug: _s, ...noSlug } = formBrand("Acme", "x");
    const r = await post("/api/brands", { source: "form", brand: noSlug });
    expect(r.json().slug).toBe("acme-2");
    await waitJob(r.json().job.id);
    expect((await post("/api/brands", { source: "form", brand: formBrand("Acme", "acme") })).json().error).toContain("already exists");
    expect((await post("/api/brands", { source: "form", brand: { ...formBrand(), colors: { background: "x", text: "#000000", accent: "#000000", secondary: "#000000" } } })).statusCode).toBe(400);
    expect((await post("/api/brands", { source: "form", brand: { ...formBrand(), fonts: { headline: "", body: "Inter" } } })).statusCode).toBe(400);
    expect((await post("/api/brands", { source: "form" })).statusCode).toBe(400);
    expect((await post("/api/brands", { source: "form", brand: formBrand(), logoUpload: "a".repeat(32) })).json().error).toContain("Upload it again");
    expect((await post("/api/brands", { source: "form", brand: formBrand(), voice: { mode: "reuse", from: "acme" } })).json().error).toContain("no voice sample");
    expect((await post("/api/brands", { source: "form", brand: formBrand(), character: { mode: "import", id: "ghost", name: "G" } })).json().error).toContain("no character");
    expect((await post("/api/brands", { source: "import", brand: formBrand(), importId: "b".repeat(32) })).json().error).toContain("Import it again");
  });
  it("creates from an imported zip without overwriting anything", async () => {
    const z = makeZip([{ name: "brand.json", data: JSON.stringify(formBrand("Zed Shop", "zed-shop")) }, { name: "style.md", data: "# Zed style" }]);
    const imp = (await raw("POST", "/api/brand-creator/import/zip", z)).json();
    const r = await post("/api/brands", { source: "import", brand: imp.preview.brand, importId: imp.importId });
    expect((await waitJob(r.json().job.id)).status).toBe("done");
    expect(readFileSync(join(data, "brands/zed-shop/identity/style.md"), "utf8")).toContain("# Zed style");
  });
});

describe("the interview route", () => {
  // The hub passes an assistant only a few variables, so the stand-in claude learns its mode from a file next to it.
  const setMode = (m: string) => writeFileSync(join(tmp, "mode"), m);
  it("answers one turn through the configured assistant and reports failures plainly", async () => {
    await app.close(); rmSync(tmp, { recursive: true, force: true });
    await bootWith((dir) => {
      writeFileSync(join(dir, "mode"), "ask");
      const f = join(dir, "claude.sh");
      writeFileSync(f, `#!/bin/sh\nFAKE_MODE=$(cat "${join(dir, "mode")}") exec node "${join(FX, "fake-claude-interview.mjs")}"\n`, { mode: 0o755 });
      return f;
    });
    const r = await post("/api/brand-creator/interview", { messages: [] });
    expect(r.json()).toMatchObject({ say: "Hi! What is your brand called?", done: false });
    setMode("done");
    const end = (await post("/api/brand-creator/interview", { messages: [{ role: "user", text: "finish" }] })).json();
    expect(end.draft.brand.slug).toBe("acme-bakery");
    setMode("error");
    const bad = await post("/api/brand-creator/interview", { messages: [] });
    expect(bad.statusCode).toBe(424);
    expect(bad.json().error).toContain("could not answer");
    expect((await post("/api/brand-creator/interview", { messages: [{ role: "robot", text: "x" }] })).statusCode).toBe(400);
  });
  it("uses a custom command saved in the settings", async () => {
    const cur = (await get("/api/brands/acme/settings")).json();
    expect(cur.assistant).toEqual({ kind: "claude", command: "" });
    expect((await app.inject({ method: "PUT", url: "/api/brands/acme/settings", headers: auth, payload: { ...cur, assistant: { kind: "custom", command: "" } } })).statusCode).toBe(400);
    const put = await app.inject({ method: "PUT", url: "/api/brands/acme/settings", headers: auth, payload: { ...cur, assistant: { kind: "custom", command: `node ${join(FX, "fake-assistant-cmd.mjs")}` } } });
    expect(put.statusCode).toBe(200);
    expect((await get("/api/brand-creator/options")).json().assistant).toMatchObject({ kind: "custom", tested: false });
    expect((await post("/api/brand-creator/interview", { messages: [{ role: "user", text: "hello there" }] })).json().say).toContain("Heard");
  });
});

describe("deleting a brand", () => {
  beforeEach(() => { writeTestBrand(root, "beta", { name: "Beta" }, "## To do\n"); mkdirSync(join(data, "brands/beta/reels/1-x"), { recursive: true }); writeFileSync(join(data, "brands/beta/reels/1-x/a.txt"), "keep me"); mkdirSync(join(data, "brands/beta"), { recursive: true }); writeFileSync(join(data, "brands/beta/settings.json"), "{}"); });
  it("asks for the slug and moves the folders to the trash instead of erasing them", async () => {
    expect((await post("/api/brands/beta/delete", { confirm: "nope" })).json().error).toContain("Type the slug");
    expect(existsSync(join(data, "brands/beta"))).toBe(true);
    const r = (await post("/api/brands/beta/delete", { confirm: "beta" })).json();
    expect(r.trash).toContain(join(data, "trash", "beta-"));
    expect(existsSync(join(data, "brands/beta"))).toBe(false);
    expect(existsSync(join(data, "brands/beta"))).toBe(false); // identity, character and reels all sit in the brand folder
    expect(readFileSync(join(r.trash, "brand/reels/1-x/a.txt"), "utf8")).toBe("keep me");
    expect(existsSync(join(r.trash, "brand/identity/brand.json"))).toBe(true);
    expect(existsSync(join(r.trash, "brand/settings.json"))).toBe(true); // the hub data of the brand is in the same folder: one move takes everything
    
    expect((await get("/api/brands")).json().brands.map((b: { slug: string }) => b.slug)).toEqual(["acme"]);
  });
  it("never deletes the last brand and refuses while a job of the brand runs", async () => {
    const job = deps.store.create({ type: "reel.make", brand: "beta", title: "A running reel", params: {} });
    deps.store.setStatus(job.id, "running");
    const busy = await post("/api/brands/beta/delete", { confirm: "beta" });
    expect(busy.statusCode).toBe(409);
    expect(busy.json().error).toContain("A running reel");
    deps.store.setStatus(job.id, "done");
    expect((await post("/api/brands/beta/delete", { confirm: "beta" })).statusCode).toBe(200);
    const last = await post("/api/brands/acme/delete", { confirm: "acme" });
    expect(last.statusCode).toBe(409);
    expect(last.json().error).toContain("last brand");
    expect(existsSync(join(data, "brands/acme"))).toBe(true);
    expect((await post("/api/brands/ghost/delete", { confirm: "ghost" })).statusCode).toBe(404);
    expect((await post("/api/brands/acme/delete", {})).statusCode).toBe(400);
  });
});

describe("the character studio routes", () => {
  it("stores fields and a sheet, serves them, and approves only after a preview exists", async () => {
    const empty = (await get("/api/brands/acme/character/studio")).json();
    expect(empty).toMatchObject({ sheet: null, previews: [], state: { status: "draft" } });
    expect((await raw("PUT", "/api/brands/acme/character/studio/sheet", Buffer.from("nope"))).statusCode).toBe(400);
    const up = (await raw("PUT", "/api/brands/acme/character/studio/sheet", PNG)).json();
    expect(up.sheet).toBe("reference-sheet.png");
    expect((await get("/api/brands/acme/character/studio/sheet")).headers["content-type"]).toContain("image/png");
    const f = (await app.inject({ method: "PUT", url: "/api/brands/acme/character/studio/fields", headers: auth, payload: { name: "Bun", fields: { what: "a bun", personality: "kind", extra: "" } } })).json();
    expect(f.state).toMatchObject({ name: "Bun", fields: { what: "a bun" } });
    expect((await post("/api/brands/acme/character/studio/approve", {})).statusCode).toBe(409);
    mkdirSync(join(data, "brands/acme/mascot/studio/previews"), { recursive: true }); writeFileSync(join(data, "brands/acme/mascot/studio/previews/front.png"), PNG);
    expect((await get("/api/brands/acme/character/studio/previews/front.png")).statusCode).toBe(200);
    expect((await get("/api/brands/acme/character/studio/previews/..%2Fplan.json")).statusCode).toBe(404);
    expect((await get("/api/brands/acme/character/studio/previews/missing.png")).statusCode).toBe(404);
    expect((await post("/api/brands/acme/character/studio/approve", {})).json().state.status).toBe("approved");
    expect((await app.inject({ method: "PUT", url: "/api/brands/acme/character/studio/fields", headers: auth, payload: { name: 1 } })).statusCode).toBe(400);
  });
  it("starts character.build only with a sheet", async () => {
    expect((await post("/api/brands/acme/jobs", { type: "character.build", params: {} })).json().error).toContain("reference sheet");
    await raw("PUT", "/api/brands/acme/character/studio/sheet", PNG);
    const r = await post("/api/brands/acme/jobs", { type: "character.build", params: { notes: "bigger eyes" } });
    expect(r.statusCode).toBe(201);
    await waitJob(r.json().id); // fails (no claude here) but the job ran
  });
  it("brands without a character still answer every empty-state route", async () => {
    for (const u of ["reels", "factory/questions", "factory/ideas", "slots", "settings", "jobs"]) expect((await get(`/api/brands/acme/${u}`)).statusCode, u).toBe(200);
    expect((await get("/api/brands/acme/character")).statusCode).toBe(404);
  });
});
