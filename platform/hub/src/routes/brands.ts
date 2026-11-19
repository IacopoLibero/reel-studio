import type { FastifyInstance } from "fastify";
import { NotificationStore } from "../daily/notifications.js";
import type { BrandSummary } from "../shared/types.js";
import type { Brand } from "../brands/schema.js";
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

  const stores = () => d.brands.slugs().map((slug) => NotificationStore.at(d.brands.paths(slug).dataDir));
  app.get<{ Querystring: { unseen?: string } }>("/api/notifications", async (req) =>
    stores().flatMap((s) => s.list(req.query.unseen === "1")).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  app.post<{ Params: { id: string } }>("/api/notifications/:id/seen", async (req, reply) => {
    for (const s of stores()) { const hit = s.markSeen(req.params.id); if (hit) return hit; }
    return reply.code(404).send({ error: "Notification not found." });
  });
}
