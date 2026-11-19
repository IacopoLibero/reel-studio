import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import proxy from "@fastify/http-proxy";
import websocket from "@fastify/websocket";
import { WebSocket, WebSocketServer } from "ws";
import { makeAuthHookCb } from "../src/auth.js";

const TOKEN = "test-token-123";
const BANNER = "RFB 003.008\n";

/** The noVNC proxy as wired in app.ts, against a fake websockify that speaks first like the real one. */
async function start(): Promise<{ app: FastifyInstance; upstream: Server; port: number }> {
  const upstream = createServer();
  const wss = new WebSocketServer({ server: upstream });
  wss.on("connection", (s) => s.send(Buffer.from(BANNER)));
  await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
  const upPort = (upstream.address() as { port: number }).port;

  const app = Fastify();
  await app.register(cookie);
  await app.register(websocket, { options: { maxPayload: 200_000 } });
  await app.register(async (nv) => {
    nv.addHook("onRequest", makeAuthHookCb(TOKEN));
    await nv.register(proxy, { upstream: `http://127.0.0.1:${upPort}`, prefix: "/novnc", rewritePrefix: "/", websocket: true, http2: false });
  });
  await app.listen({ port: 0, host: "127.0.0.1" });
  return { app, upstream, port: (app.server.address() as { port: number }).port };
}

function firstMessage(url: string, headers: Record<string, string>): Promise<string | "closed"> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url, ["binary"], { headers });
    const timer = setTimeout(() => { ws.terminate(); resolve("closed"); }, 3000);
    ws.on("message", (m) => { clearTimeout(timer); ws.close(); resolve(m.toString()); });
    ws.on("unexpected-response", () => { clearTimeout(timer); resolve("closed"); });
    ws.on("error", () => { clearTimeout(timer); resolve("closed"); });
  });
}

describe("noVNC WebSocket proxy behind the auth hook", () => {
  let running: { app: FastifyInstance; upstream: Server } | null = null;
  afterEach(async () => {
    await running?.app.close();
    running?.upstream.close();
    running = null;
  });

  it("delivers the RFB banner to a signed-in client (async hooks used to swallow it)", async () => {
    running = await start();
    const msg = await firstMessage(`ws://127.0.0.1:${(running.app.server.address() as { port: number }).port}/novnc/websockify`, { Cookie: `hub_token=${TOKEN}` });
    expect(msg).toBe(BANNER);
  });

  it("refuses a client without the token", async () => {
    running = await start();
    const msg = await firstMessage(`ws://127.0.0.1:${(running.app.server.address() as { port: number }).port}/novnc/websockify`, {});
    expect(msg).toBe("closed");
  });
});
