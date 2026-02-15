/**
 * SessionManager - database operations for meeting sessions and related records.
 * Centralises all Prisma writes so the WebSocket handler stays clean.
 */

import { prisma } from "../db/prisma-client.js";
import { logger } from "../utils/logger.js";

export class SessionManager {
  /**
   * Create a new meeting session.
   */
  async createSession(userId: string, source: string) {
    const session = await prisma.session.create({
      data: {
        userId,
        source,
        status: "active",
      },
    });
    logger.info({ sessionId: session.id }, "Session created");
    return session;
  }

  /**
   * Mark a session as stopped and record the end time.
   */
  async endSession(sessionId: string) {
    const session = await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: "stopped",
        endedAt: new Date(),
      },
    });
    logger.info({ sessionId }, "Session ended");
    return session;
  }

  /**
   * Persist a transcript segment (partial or final).
   */
  async addSegment(
    sessionId: string,
    text: string,
    speaker: string | null,
    timestamp: number,
    confidence: number | null,
    isFinal: boolean,
  ) {
    const segment = await prisma.transcriptSegment.create({
      data: {
        sessionId,
        text,
        speaker,
        timestamp,
        confidence,
        isFinal,
      },
    });
    return segment;
  }

  /**
   * Persist a summary (rolling, global, or final).
   */
  async addSummary(
    sessionId: string,
    type: string,
    content: string,
    windowStart: number | null,
    windowEnd: number | null,
  ) {
    const summary = await prisma.summary.create({
      data: {
        sessionId,
        type,
        content,
        windowStart,
        windowEnd,
      },
    });
    logger.debug({ sessionId, type }, "Summary saved");
    return summary;
  }

  /**
   * Persist a name mention.
   */
  async addMention(
    sessionId: string,
    name: string,
    context: string,
    timestamp: number,
    sentiment: string | null,
  ) {
    const mention = await prisma.mention.create({
      data: {
        sessionId,
        name,
        context,
        timestamp,
        sentiment,
      },
    });
    logger.debug({ sessionId, name }, "Mention saved");
    return mention;
  }
}
