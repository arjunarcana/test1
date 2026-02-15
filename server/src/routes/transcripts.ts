/**
 * Transcript routes.
 *
 * GET /sessions/:id/transcript - get full transcript for a session
 */

import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma-client.js";

interface TranscriptParams {
  id: string;
}

export async function transcriptRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: TranscriptParams }>(
    "/sessions/:id/transcript",
    async (request, reply) => {
      if (!request.userId) {
        return reply.code(401).send({ error: "Unauthorized" });
      }

      // Verify session belongs to the requesting user
      const session = await prisma.session.findFirst({
        where: { id: request.params.id, userId: request.userId },
        select: { id: true },
      });

      if (!session) {
        return reply.code(404).send({ error: "Session not found" });
      }

      const segments = await prisma.transcriptSegment.findMany({
        where: { sessionId: session.id },
        orderBy: { timestamp: "asc" },
        select: {
          id: true,
          timestamp: true,
          speaker: true,
          text: true,
          confidence: true,
          isFinal: true,
          createdAt: true,
        },
      });

      return reply.send({ sessionId: session.id, segments });
    },
  );
}
