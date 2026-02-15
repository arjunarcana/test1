/**
 * Fastify application builder.
 *
 * Registers plugins (CORS, WebSocket), middleware (auth), routes,
 * and the WebSocket handler. Returns a configured but not-yet-listening
 * Fastify instance.
 */

import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { logger } from "./utils/logger.js";
import { authHook } from "./middleware/auth.js";
import { authRoutes } from "./routes/auth.js";
import { sessionRoutes } from "./routes/sessions.js";
import { transcriptRoutes } from "./routes/transcripts.js";
import { websocketHandler } from "./websocket/handler.js";

export async function buildApp() {
  const app = Fastify({
    logger: false, // We use our own Pino instance
  });

  // ─── Plugins ─────────────────────────────────────────────────────
  await app.register(cors, {
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:5173",
    ],
    credentials: true,
  });

  await app.register(websocket);

  // ─── Middleware ───────────────────────────────────────────────────
  app.addHook("onRequest", authHook);

  // ─── Health check ────────────────────────────────────────────────
  app.get("/health", async (_request, reply) => {
    return reply.send({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ─── REST routes ─────────────────────────────────────────────────
  await app.register(authRoutes);
  await app.register(sessionRoutes);
  await app.register(transcriptRoutes);

  // ─── WebSocket ───────────────────────────────────────────────────
  await app.register(websocketHandler);

  // ─── Global error handler ────────────────────────────────────────
  app.setErrorHandler((error, _request, reply) => {
    logger.error({ err: error }, "Unhandled error");
    reply.code(error.statusCode ?? 500).send({
      error: error.message ?? "Internal Server Error",
    });
  });

  logger.info("Fastify app built successfully");

  return app;
}
