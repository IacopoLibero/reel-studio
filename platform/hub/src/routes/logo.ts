import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { isPng, LIMITS } from "../creator/files.js";
import type { AppDeps } from "../app.js";
import { HttpError, makeScope } from "./scope.js";

/** Reels and covers draw the logo from public/logo.png, so only a PNG works: an SVG is refused with a clear message. */
const TWICE_THE_LIMIT = LIMITS.logo * 2;

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
      const file = scope(req).paths.logo;
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) throw new HttpError(400, "Send the logo as the request body (application/octet-stream).");
      if (body.length > LIMITS.logo) throw new HttpError(400, `The file is too big: the limit is ${LIMITS.logo / (1024 * 1024)} MB.`);
      if (!isPng(body)) throw new HttpError(400, "The logo must be a PNG. Covers and reels cannot draw other formats (an SVG included) yet.");
      writeFileSync(`${file}.tmp`, body);
      renameSync(`${file}.tmp`, file);
      return { ok: true };
    });

    sub.delete<{ Params: { slug: string } }>("/api/brands/:slug/logo", async (req) => {
      rmSync(scope(req).paths.logo, { force: true });
      return { ok: true };
    });
  });
}
