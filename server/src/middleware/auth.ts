/**
 * JWT authentication preHandler hook for Fastify.
 *
 * - Skips authentication for /health, /auth/* routes.
 * - Verifies the Bearer token from the Authorization header.
 * - Attaches `request.userId` for downstream handlers.
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

// Augment Fastify's request type so handlers can access userId
declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
  }
}

/** Paths that do not require authentication. */
const PUBLIC_PREFIXES = ["/health", "/auth"];

interface JwtPayload {
  sub: string;
  iat: number;
}

export async function authHook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Allow public routes through without a token
  const isPublic = PUBLIC_PREFIXES.some((prefix) =>
    request.url.startsWith(prefix),
  );
  if (isPublic) return;

  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    reply.code(401).send({ error: "Missing or malformed Authorization header" });
    return;
  }

  const token = authHeader.slice(7); // strip "Bearer "

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
    request.userId = decoded.sub;
  } catch (err) {
    logger.warn({ err }, "JWT verification failed");
    reply.code(401).send({ error: "Invalid or expired token" });
  }
}
