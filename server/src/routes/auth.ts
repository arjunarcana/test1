/**
 * Authentication routes (simple JWT-based, no magic link for MVP).
 *
 * POST /auth/register - create user, return JWT
 * POST /auth/login    - find user by email, return JWT
 * GET  /auth/me       - return current user (requires auth)
 */

import type { FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import { prisma } from "../db/prisma-client.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

/** Helper: sign a JWT for a given userId. */
function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: "7d" });
}

interface RegisterBody {
  email: string;
  names?: string[];
}

interface LoginBody {
  email: string;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // ─── Register ──────────────────────────────────────────────────────
  app.post<{ Body: RegisterBody }>("/auth/register", async (request, reply) => {
    const { email, names } = request.body ?? {};

    if (!email || typeof email !== "string") {
      return reply.code(400).send({ error: "email is required" });
    }

    // Check for duplicate
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.code(409).send({ error: "User with this email already exists" });
    }

    const user = await prisma.user.create({
      data: {
        email,
        names: names ?? [],
      },
    });

    logger.info({ userId: user.id, email }, "User registered");

    const token = signToken(user.id);
    return reply.code(201).send({ token, user: { id: user.id, email: user.email } });
  });

  // ─── Login ─────────────────────────────────────────────────────────
  app.post<{ Body: LoginBody }>("/auth/login", async (request, reply) => {
    const { email } = request.body ?? {};

    if (!email || typeof email !== "string") {
      return reply.code(400).send({ error: "email is required" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    logger.info({ userId: user.id, email }, "User logged in");

    const token = signToken(user.id);
    return reply.send({ token, user: { id: user.id, email: user.email } });
  });

  // ─── Me ────────────────────────────────────────────────────────────
  app.get("/auth/me", async (request, reply) => {
    if (!request.userId) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: request.userId },
      select: {
        id: true,
        email: true,
        names: true,
        settings: true,
        createdAt: true,
      },
    });

    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    return reply.send({ user });
  });
}
