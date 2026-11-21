import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { isPng, LIMITS } from "../creator/files.js";
import { withLogoLine } from "../creator/style.js";
import type { AppDeps } from "../app.js";
import { HttpError, makeScope } from "./scope.js";

/** Reels and covers draw the logo from public/logo.png, so only a PNG works: an SVG is refused with a clear message. */
const TWICE_THE_LIMIT = LIMITS.logo * 2;

/** Rewrites the logo sentence of the brand's style.md (the reel skill reads it); a missing file or sentence is left alone. */
function syncStyleGuide(brandDir: string, slug: string, hasLogo: boolean): void {
  const file = join(brandDir, "style.md");
  if (!existsSync(file)) return;
  const md = readFileSync(file, "utf8");
  const next = withLogoLine(md, slug, hasLogo);
  if (next !== md) writeFileSync(file, next);
}

/** Set, replace, show and remove a brand's logo (brand/<slug>/logo.png) after the brand was created. */
export function logoRoutes(app: FastifyInstance, d: AppDeps): void {
  const scope = makeScope(d);
  app.register(async (sub) => {
    sub.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: TWICE_THE_LIMIT }, (_req, body, done) => done(null, body));

    sub.get<{ Params: { slug: string } }>("/api/brands/:slug/logo", async (req, reply) => {
      const file = scope(req).paths.logo;
      if (!existsSync(file)) return reply.code(404).send({ error: "This brand has no logo yet." });
      return reply.type("image/png").header("Cache-Control", "no-cache").send(readFileSync(file));
    });

    sub.put<{ Params: { slug: string } }>("/api/brands/:slug/logo", async (req) => {
      const ctx = scope(req);
      const file = ctx.paths.logo;
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) throw new HttpError(400, "Send the logo as the request body (application/octet-stream).");
      if (body.length > LIMITS.logo) throw new HttpError(400, `The file is too big: the limit is ${LIMITS.logo / (1024 * 1024)} MB.`);
      if (!isPng(body)) throw new HttpError(400, "The logo must be a PNG. Covers and reels cannot draw other formats (an SVG included) yet.");
      writeFileSync(`${file}.tmp`, body);
      renameSync(`${file}.tmp`, file);
      rmSync(join(ctx.paths.brandDir, "logo.svg"), { force: true }); // one logo per brand
      syncStyleGuide(ctx.paths.brandDir, ctx.slug, true);
      return { ok: true };
    });

    sub.delete<{ Params: { slug: string } }>("/api/brands/:slug/logo", async (req) => {
      const ctx = scope(req);
      rmSync(ctx.paths.logo, { force: true });
      rmSync(join(ctx.paths.brandDir, "logo.svg"), { force: true });
      syncStyleGuide(ctx.paths.brandDir, ctx.slug, false);
      return { ok: true };
    });
  });
}
