import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { isVoiceLanguage, VOICE_LANGUAGES, voiceLanguageName, withLanguageLine } from "../brands/languages.js";
import { NotificationStore } from "../daily/notifications.js";
import type { BrandSummary } from "../shared/types.js";
import type { Brand } from "../brands/schema.js";
import { styleSchema } from "../brands/schema.js";
import { readBrand, writeBrand } from "../brands/registry.js";
import type { AppDeps } from "../app.js";
import { makeScope } from "./scope.js";
import { logoRoutes } from "./logo.js";
import { checkFont, loadFontList } from "../creator/fonts.js";

export const summaryOf = (b: Brand, hasLogo = false): BrandSummary => ({
  slug: b.slug, name: b.name, language: b.language, website: b.website, accent: b.colors.accent, background: b.colors.background, colors: b.colors,
  instagramAccount: b.instagram.account, hasInstagramUserId: b.instagram.userId !== "", hasLogo,
  character: { enabled: b.character.enabled, id: b.character.id, name: b.character.name },
});

/** The brand list for the switcher, one brand, and the notifications of every brand (the host notifier polls one URL). */
export function brandRoutes(app: FastifyInstance, d: AppDeps): void {
  logoRoutes(app, d);
  const hasLogo = (slug: string): boolean => existsSync(d.brands.paths(slug).logo);
  app.get("/api/brands", async () => ({ brands: d.brands.list().map((b) => summaryOf(b, hasLogo(b.slug))), default: d.brands.defaultSlug() }));

  const scope = makeScope(d);
  app.get<{ Params: { slug: string } }>("/api/brands/:slug", async (req) => { const c = scope(req); return summaryOf(c.brand, hasLogo(c.slug)); });

  app.get<{ Params: { slug: string } }>("/api/brands/:slug/style", async (req) => { const b = scope(req).brand; return { colors: b.colors, fonts: b.fonts, closing: b.closing }; });
  // Colours, fonts and closing lines can change after the brand is created; nothing else in brand.json is touched.
  app.put<{ Params: { slug: string } }>("/api/brands/:slug/style", async (req, reply) => {
    const b = scope(req);
    const p = styleSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.issues[0]?.message ?? "Invalid style." });
    const fonts = await loadFontList(undefined, [d.config.root]);
    for (const [k, name] of Object.entries(p.data.fonts)) if (!checkFont(fonts, name).ok) return reply.code(400).send({ error: `fonts.${k}: "${name}" is not a Google font that Remotion can load.` });
    const fresh = readBrand(d.config.dataDir, b.slug);
    if (!fresh) return reply.code(404).send({ error: "That brand does not exist." });
    writeBrand(d.config.dataDir, { ...fresh, ...p.data });
    return p.data;
  });

  // The language of the reels: written, spoken (the voice) and timed (Whisper) in it. Only the languages the voice speaks.
  app.get("/api/voice-languages", async () => VOICE_LANGUAGES);
  app.put<{ Params: { slug: string } }>("/api/brands/:slug/language", async (req, reply) => {
    const b = scope(req);
    const p = z.object({ language: z.string().refine(isVoiceLanguage, "Choose one of the languages the voice speaks.") }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.issues[0]?.message ?? "Choose a language." });
    const language = p.data.language.slice(0, 2).toLowerCase();
    const fresh = readBrand(d.config.dataDir, b.slug);
    if (!fresh) return reply.code(404).send({ error: "That brand does not exist." });
    writeBrand(d.config.dataDir, { ...fresh, language });
    const md = b.paths.styleMd;
    if (existsSync(md)) { const text = readFileSync(md, "utf8"), next = withLanguageLine(text, language); if (next !== text) writeFileSync(md, next); }
    return { language, name: voiceLanguageName(language) };
  });

  const stores = () => d.brands.slugs().map((slug) => NotificationStore.at(d.brands.paths(slug).dataDir));
  app.get<{ Querystring: { unseen?: string } }>("/api/notifications", async (req) =>
    stores().flatMap((s) => s.list(req.query.unseen === "1")).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  app.post<{ Params: { id: string } }>("/api/notifications/:id/seen", async (req, reply) => {
    for (const s of stores()) { const hit = s.markSeen(req.params.id); if (hit) return hit; }
    return reply.code(404).send({ error: "Notification not found." });
  });
}
