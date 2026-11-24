import { toolOf } from "./ai/agent.js";
import { moveVoicesToCharacters } from "./brands/voice-move.js";
import { join } from "node:path";
import fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import fstatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { z } from "zod";
import { COOKIE, makeAuthHook, sameOrigin, tokenMatches } from "./auth.js";
import type { Config } from "./config.js";
import { JobRunner } from "./jobs/runner.js";
import { JobStore } from "./jobs/store.js";
import { brandJobRoutes, globalJobRoutes } from "./routes/jobs.js";
import { brandRoutes } from "./routes/brands.js";
import { HttpError, makeScope } from "./routes/scope.js";
import { BrandRegistry } from "./brands/registry.js";
import { calendarRoutes } from "./routes/calendar.js";
import { contentRoutes } from "./routes/content.js";
import { ideasRoutes } from "./routes/ideas.js";
import { dailyRoutes } from "./routes/daily.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { skillRoutes } from "./routes/skills.js";
import { creatorRoutes } from "./routes/creator.js";
import { studioRoutes } from "./routes/studio.js";
import { EntryNonces } from "./enter.js";
import { setupVoiceRoutes } from "./routes/setup-voice.js";
import { VoiceClient } from "./setup/voice-catalog.js";
import { aiRoutes } from "./routes/ai.js";
import { AccessStore } from "./claude/access.js";
import { UsageStore } from "./claude/usage.js";
import { setEnvLayer } from "./env.js";
import { setProcessTap } from "./jobs/process.js";
import { setupRoutes } from "./routes/setup.js";
import { SetupInstaller } from "./setup/installer.js";
import { blender, remotionSkills, whisper, workspacePackages } from "./setup/steps.js";
import { ensureToolBin } from "./setup/bin.js";
import { installVoiceStudio } from "./setup/voice-install.js";
import { readSetup } from "./setup/state.js";
import { voiceMode } from "./setup/voice-modes.js";
import { detectGpu, findOnPath } from "./setup/which.js";
import { toolsDir, type CheckContext } from "./setup/checks.js";
import { defaultProgramRoot } from "./paths.js";
import { UploadStore } from "./creator/uploads.js";
import type { CreatorServices } from "./creator/services.js";
import { SettingsStore } from "./settings.js";
import { Terminal } from "./terminal.js";

export interface AppDeps {
  config: Config; store: JobStore; settings: SettingsStore; runner: JobRunner; brands: BrandRegistry;
  /** Set by index.ts once the daily loops exist: starts the loop of a brand created while the hub runs. */
  hooks: { ensureDaily: (slug: string) => boolean; /** Set by index.ts: starts VoiceStudio after the setup installed it. */ voiceInstalled: () => void };
  creator: CreatorServices;
}

export async function buildApp(config: Config): Promise<{ app: FastifyInstance; deps: AppDeps }> {
  const brands = new BrandRegistry({ root: config.root, dataDir: config.dataDir });
  // A brand that got a character by hand keeps its voice with the character (mascot/<id>-voice.*).
  moveVoicesToCharacters(config.dataDir, brands.slugs(), (slug, e) => console.error(`voice move failed for ${slug}:`, e));
  const store = new JobStore(join(config.dataDir, "jobs.json"));
  const settings = new SettingsStore(join(config.dataDir, "settings.json"), {
    brandFile: (slug) => brands.paths(slug).settingsFile,
    defaultSlug: () => brands.defaultSlug(),
    accountOf: (slug) => brands.get(slug)?.instagram.account ?? "",
  });
  const hooks = { ensureDaily: (_slug: string): boolean => false, voiceInstalled: (): void => undefined };
  const creator: CreatorServices = { root: config.root, dataDir: config.dataDir, brands, uploads: new UploadStore(join(config.dataDir, "tmp-uploads")), settings, voiceUrl: `http://127.0.0.1:${process.env.VOICE_PORT || 3900}`, ensureDaily: (slug) => hooks.ensureDaily(slug) };
  const runner = new JobRunner(store, settings, { root: config.root, claudeBin: config.claudeBin, codexBin: config.codexBin, dataDir: config.dataDir, blogDir: config.blogDir, brands, creator: () => creator });
  const deps: AppDeps = { config, store, settings, runner, brands, hooks, creator };

  const app = fastify({ logger: { level: process.env.HUB_LOG_LEVEL ?? "info", redact: ["req.headers.authorization", "req.headers.cookie"] }, bodyLimit: 1_000_000 });
  await app.register(cookie);
  await app.register(websocket, { options: { maxPayload: 200_000 } });
  app.addHook("onSend", async (_req, reply) => { reply.header("X-Content-Type-Options", "nosniff"); });
  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    const status = err instanceof HttpError || (err.statusCode !== undefined && err.statusCode < 500) ? (err.statusCode ?? 400) : 500;
    if (status >= 500) req.log.error(err);
    return reply.code(status).send({ error: status >= 500 ? "Something went wrong in the hub. See its log." : err.message });
  });

  const auth = makeAuthHook(config.token);
  const loginBody = z.object({ token: z.string().min(1).max(500) });

  app.post("/api/login", async (req, reply) => {
    const body = loginBody.safeParse(req.body);
    if (!body.success || !tokenMatches(body.data.token, config.token)) return reply.code(401).send({ error: "That token is not correct." });
    reply.setCookie(COOKIE, body.data.token, { httpOnly: true, sameSite: "strict", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return { ok: true };
  });
  const nonces = new EntryNonces();
  // The app window signs in with a one-time pass (see enter.ts). Only for a request addressed to this machine, so a web page cannot use it through DNS rebinding.
  app.get<{ Querystring: { n?: string } }>("/api/enter", async (req, reply) => {
    const host = (req.headers.host ?? "").replace(/:\d+$/, "");
    if (!["127.0.0.1", "localhost", "[::1]"].includes(host)) return reply.code(403).send({ error: "Forbidden." });
    if (!nonces.consume(req.query.n)) return reply.code(401).send({ error: "That link has expired. Open Reel Studio again." });
    reply.setCookie(COOKIE, config.token, { httpOnly: true, sameSite: "strict", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return reply.redirect("/");
  });
  app.post("/api/enter-nonce", { preHandler: auth }, async () => ({ nonce: nonces.issue() }));
  app.post("/api/logout", async (_req, reply) => { reply.clearCookie(COOKIE, { path: "/" }); return { ok: true }; });
  app.get("/api/health", async () => ({ ok: true }));

  await app.register(async (api) => {
    api.addHook("onRequest", auth);
    api.get("/api/me", async () => ({ ok: true }));
    globalJobRoutes(api, deps);
    brandRoutes(api, deps);
    creatorRoutes(api, deps, creator);
    // Every brand-scoped route lives under /api/brands/:slug. The same routes answer on the old /api/... paths for the machine's first brand.
    const scope = makeScope(deps);
    for (const prefix of ["/api/brands/:slug", "/api"]) {
      const legacy = prefix === "/api";
      await api.register(async (scoped) => {
        brandJobRoutes(scoped, deps, scope, legacy);
        contentRoutes(scoped, deps, scope);
        calendarRoutes(scoped, deps, scope);
        ideasRoutes(scoped, deps, scope);
        dailyRoutes(scoped, deps, scope);
        analyticsRoutes(scoped, deps, scope);
        studioRoutes(scoped, deps, scope);
      }, { prefix });
    }
    skillRoutes(api, config.root);
    // How Claude and Codex sign in (login or API key) and the Claude usage: every run takes the access from here, and every Claude run reports its usage here.
    const access = { claude: new AccessStore(config.dataDir, "claude"), codex: new AccessStore(config.dataDir, "codex") };
    const usage = new UsageStore(join(config.dataDir, "claude-usage.json"));
    setEnvLayer("claude", (env) => access.claude.apply(env));
    setEnvLayer("codex", (env) => access.codex.apply(env));
    setProcessTap((line) => { usage.record(line); });
    aiRoutes(api, deps, { access, usage });
    const stepContext = { workspace: config.root, dataDir: config.dataDir, programRoot: defaultProgramRoot() };
    const installer = new SetupInstaller(config.dataDir, { "workspace-packages": workspacePackages(stepContext), whisper: whisper(stepContext), "remotion-skills": remotionSkills(stepContext), blender: async (log) => { await blender(stepContext)(log); ensureToolBin(config.dataDir); },
      voicestudio: async (log) => {
        const mode = voiceMode(readSetup(config.dataDir).voiceMode);
        if (!mode) throw new Error("Choose a voice mode first.");
        await installVoiceStudio({ dataDir: config.dataDir, port: Number(process.env.VOICE_PORT ?? 3900) }, mode, log);
        hooks.voiceInstalled();
      },
    });
    const checkContext = (): CheckContext => ({
      which: (n) => findOnPath(n, [process.env.PATH ?? "", toolsDir(config.dataDir, "blender")].join(":")),
      workspace: config.root, dataDir: config.dataDir, nodeVersion: process.versions.node, gpu: detectGpu(),
    });
    setupRoutes(api, deps, installer, checkContext);
    setupVoiceRoutes(api, () => new VoiceClient(`http://127.0.0.1:${Number(process.env.VOICE_PORT ?? 3900)}`));
    const terminal = new Terminal(config, () => toolOf({ settings: settings.get() }), () => settings.get().terminalPermission);
    api.get("/ws/terminal", { websocket: true }, (socket, req) => {
      if (!sameOrigin(req)) { socket.close(1008, "origin"); return; }
      const q = z.object({ cols: z.coerce.number().int().min(10).max(500).default(100), rows: z.coerce.number().int().min(3).max(200).default(30) }).parse(req.query);
      terminal.attach(socket, q.cols, q.rows);
    });
  });

  await app.register(fstatic, { root: config.webDir, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.method === "GET" && !req.url.startsWith("/api") && !req.url.startsWith("/ws")) return reply.sendFile("index.html");
    return reply.code(404).send({ error: "Not found." });
  });
  return { app, deps };
}
