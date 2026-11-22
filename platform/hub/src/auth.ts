import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

export const COOKIE = "hub_token";

export function tokenMatches(given: string | undefined, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requestToken(req: FastifyRequest): string | undefined {
  const h = req.headers.authorization;
  if (h?.startsWith("Bearer ")) return h.slice(7).trim();
  return req.cookies?.[COOKIE];
}

/** Same-origin check for WebSocket upgrades (browsers always send Origin). */
export function sameOrigin(req: FastifyRequest): boolean {
  const o = req.headers.origin;
  if (!o) return true;
  try { return new URL(o).host === req.headers.host; } catch { return false; }
}

export function makeAuthHook(token: string) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!tokenMatches(requestToken(req), token)) {
      return reply.code(401).send({ error: "Sign in with the hub token to continue." });
    }
  };
}
