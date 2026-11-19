import type { FastifyRequest } from "fastify";
import { brandCtx, type BrandCtx } from "../brands/context.js";
import type { AppDeps } from "../app.js";

/** An error the global handler answers as `{ error: message }` with this status. */
export class HttpError extends Error {
  constructor(readonly statusCode: number, message: string) { super(message); }
}

export type Scope = (req: FastifyRequest) => BrandCtx;

/**
 * The brand a request is for: `:slug` of /api/brands/:slug/..., or on the legacy /api/... paths the machine's first brand.
 * Unknown brand = 404, a machine with no brand at all = 409.
 */
export function makeScope(d: AppDeps): Scope {
  return (req) => {
    const named = (req.params as { slug?: string } | undefined)?.slug;
    const slug = named ?? d.brands.defaultSlug();
    if (!slug) throw new HttpError(409, "There is no brand yet. Create one first.");
    const ctx = brandCtx(d.brands, slug);
    if (!ctx) throw new HttpError(404, "That brand does not exist.");
    return ctx;
  };
}
