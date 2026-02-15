/**
 * Singleton PrismaClient instance.
 * Re-uses the same client across the application to avoid exhausting
 * database connections during development hot-reloads.
 */

import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger.js";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? [
            { emit: "event", level: "query" },
            { emit: "stdout", level: "info" },
            { emit: "stdout", level: "warn" },
            { emit: "stdout", level: "error" },
          ]
        : [
            { emit: "stdout", level: "warn" },
            { emit: "stdout", level: "error" },
          ],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

logger.debug("PrismaClient singleton initialised");
