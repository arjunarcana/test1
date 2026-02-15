/**
 * Session CRUD routes.
 *
 * GET    /sessions          - list user's sessions
 * GET    /sessions/:id      - get session with segments, summaries, mentions
 * DELETE /sessions/:id      - delete session and related data
 * GET    /sessions/:id/export - export session as markdown
 */

import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma-client.js";

interface SessionParams {
  id: string;
}

export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  // ─── List sessions ─────────────────────────────────────────────────
  app.get("/sessions", async (request, reply) => {
    if (!request.userId) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const sessions = await prisma.session.findMany({
      where: { userId: request.userId },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        source: true,
        status: true,
        startedAt: true,
        endedAt: true,
        _count: {
          select: {
            segments: true,
            summaries: true,
            mentions: true,
          },
        },
      },
    });

    return reply.send({ sessions });
  });

  // ─── Get session detail ────────────────────────────────────────────
  app.get<{ Params: SessionParams }>("/sessions/:id", async (request, reply) => {
    if (!request.userId) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const session = await prisma.session.findFirst({
      where: { id: request.params.id, userId: request.userId },
      include: {
        segments: {
          where: { isFinal: true },
          orderBy: { timestamp: "asc" },
        },
        summaries: {
          orderBy: { createdAt: "desc" },
        },
        mentions: {
          orderBy: { timestamp: "asc" },
        },
      },
    });

    if (!session) {
      return reply.code(404).send({ error: "Session not found" });
    }

    return reply.send({ session });
  });

  // ─── Delete session ────────────────────────────────────────────────
  app.delete<{ Params: SessionParams }>(
    "/sessions/:id",
    async (request, reply) => {
      if (!request.userId) {
        return reply.code(401).send({ error: "Unauthorized" });
      }

      // Verify ownership
      const session = await prisma.session.findFirst({
        where: { id: request.params.id, userId: request.userId },
      });

      if (!session) {
        return reply.code(404).send({ error: "Session not found" });
      }

      // Cascade delete is configured in the schema, so deleting the session
      // also removes segments, summaries, and mentions.
      await prisma.session.delete({ where: { id: session.id } });

      return reply.code(204).send();
    },
  );

  // ─── Export session as markdown ────────────────────────────────────
  app.get<{ Params: SessionParams }>(
    "/sessions/:id/export",
    async (request, reply) => {
      if (!request.userId) {
        return reply.code(401).send({ error: "Unauthorized" });
      }

      const session = await prisma.session.findFirst({
        where: { id: request.params.id, userId: request.userId },
        include: {
          segments: {
            where: { isFinal: true },
            orderBy: { timestamp: "asc" },
          },
          summaries: {
            orderBy: { createdAt: "asc" },
          },
          mentions: {
            orderBy: { timestamp: "asc" },
          },
        },
      });

      if (!session) {
        return reply.code(404).send({ error: "Session not found" });
      }

      // Build markdown document
      const lines: string[] = [];
      lines.push(`# Meeting - ${session.startedAt.toISOString().slice(0, 10)}`);
      lines.push("");
      lines.push(`**Source:** ${session.source}`);
      lines.push(`**Status:** ${session.status}`);
      lines.push(
        `**Duration:** ${session.startedAt.toISOString()} - ${session.endedAt?.toISOString() ?? "ongoing"}`,
      );
      lines.push("");

      // Final / global summary
      const globalSummary = session.summaries.find((s) => s.type === "final") ??
        session.summaries.find((s) => s.type === "global");
      if (globalSummary) {
        lines.push("## Summary");
        lines.push("");
        lines.push(globalSummary.content);
        lines.push("");
      }

      // Mentions
      if (session.mentions.length > 0) {
        lines.push("## Mentions");
        lines.push("");
        for (const m of session.mentions) {
          const ts = formatTimestamp(m.timestamp);
          lines.push(`- **${m.name}** [${ts}]${m.sentiment ? ` (${m.sentiment})` : ""}: ${m.context}`);
        }
        lines.push("");
      }

      // Full transcript
      lines.push("## Transcript");
      lines.push("");
      for (const seg of session.segments) {
        const ts = formatTimestamp(seg.timestamp);
        const speaker = seg.speaker ?? "Unknown";
        lines.push(`**[${ts}] ${speaker}:** ${seg.text}`);
        lines.push("");
      }

      const markdown = lines.join("\n");

      return reply
        .header("Content-Type", "text/markdown; charset=utf-8")
        .header(
          "Content-Disposition",
          `attachment; filename="meeting-${session.id.slice(0, 8)}.md"`,
        )
        .send(markdown);
    },
  );
}

/** Format seconds into MM:SS. */
function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
