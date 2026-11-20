import type { FastifyInstance } from "fastify";
import { NotificationStore } from "../daily/notifications.js";
import type { BrandSummary } from "../shared/types.js";
import type { Brand } from "../brands/schema.js";
import { styleSchema } from "../brands/schema.js";
import { readBrand, writeBrand } from "../brands/registry.js";
import type { AppDeps } from "../app.js";
import { makeScope } from "./scope.js";

export const summaryOf = (b: Brand): BrandSummary => ({
  slug: b.slug, name: b.name, language: b.language, website: b.website, accent: b.colors.accent, background: b.colors.background, colors: b.colors,
  instagramAccount: b.instagram.account, hasInstagramUserId: b.instagram.userId !== "",
  character: { enabled: b.character.enabled, id: b.character.id, name: b.character.name },
});

/** The brand list for the switcher, one brand, and the notifications of every brand (the host notifier polls one URL). */
export function brandRoutes(app: FastifyInstance, d: AppDeps): void {
  app.get("/api/brands", async () => ({ brands: d.brands.list().map(summaryOf), default: d.brands.defaultSlug() }));

  const scope = makeScope(d);
  app.get<{ Params: { slug: string } }>("/api/brands/:slug", async (req) => summaryOf(scope(req).brand));

  app.get<{ Params: { slug: string } }>("/api/brands/:slug/style", async (req) => { const b = scope(req).brand; return { colors: b.colors, fonts: b.fonts, closing: b.closing }; });
  // Colours, fonts and closing lines can change after the brand is created; nothing else in brand.json is touched.
  app.put<{ Params: { slug: string } }>("/api/brands/:slug/style", async (req, reply) => {
    const b = scope(req);
    const p = styleSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.issues[0]?.message ?? "Invalid style." });
    const fresh = readBrand(d.config.root, b.slug);
    if (!fresh) return reply.code(404).send({ error: "That brand does not exist." });
    writeBrand(d.config.root, { ...fresh, ...p.data });
    return p.data;
  });

  const stores = () => d.brands.slugs().map((slug) => NotificationStore.at(d.brands.paths(slug).dataDir));
  app.get<{ Querystring: { unseen?: string } }>("/api/notifications", async (req) =>
    stores().flatMap((s) => s.list(req.query.unseen === "1")).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  app.post<{ Params: { id: string } }>("/api/notifications/:id/seen", async (req, reply) => {
    for (const s of stores()) { const hit = s.markSeen(req.params.id); if (hit) return hit; }
    return reply.code(404).send({ error: "Notification not found." });
  });
}
