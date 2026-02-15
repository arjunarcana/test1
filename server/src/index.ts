/**
 * Entry point for the Meeting Copilot server.
 *
 * Loads environment variables, builds the Fastify app, starts listening,
 * and sets up graceful shutdown on SIGINT / SIGTERM.
 */

import "dotenv/config";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";
import { buildApp } from "./app.js";
import { prisma } from "./db/prisma-client.js";

async function main(): Promise<void> {
  const app = await buildApp();

  try {
    await app.listen({ port: config.port, host: config.host });
    logger.info(
      { port: config.port, host: config.host },
      `Meeting Copilot server listening on ${config.host}:${config.port}`,
    );
  } catch (err) {
    logger.fatal({ err }, "Failed to start server");
    process.exit(1);
  }

  // ─── Graceful shutdown ───────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Received shutdown signal, closing gracefully");

    try {
      await app.close();
      logger.info("Fastify server closed");
    } catch (err) {
      logger.error({ err }, "Error closing Fastify server");
    }

    try {
      await prisma.$disconnect();
      logger.info("Prisma client disconnected");
    } catch (err) {
      logger.error({ err }, "Error disconnecting Prisma client");
    }

    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "Unhandled error in main");
  process.exit(1);
});
