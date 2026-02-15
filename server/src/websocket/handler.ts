/**
 * WebSocket handler for real-time meeting transcription.
 *
 * Protocol flow:
 *   1. Client connects to /ws
 *   2. Client sends start_session with JWT token and source
 *   3. Server creates session, initialises transcription provider + summarizer
 *   4. Client streams audio_data messages
 *   5. Server emits transcript_partial, transcript_final, rolling_summary,
 *      global_summary, and mention_detected messages
 *   6. Client sends stop_session (or disconnects)
 *   7. Server generates final summary, persists, and closes
 */

import type { FastifyInstance } from "fastify";
import type { WebSocket as WsSocket } from "ws";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { SessionManager } from "../services/session-manager.js";
import {
  createTranscriptionProvider,
  type TranscriptionProvider,
} from "../services/transcription/provider.js";
import { SummarizationOrchestrator } from "../services/summarization/summarizer.js";
import { prisma } from "../db/prisma-client.js";
import type {
  ClientMessage,
  ServerMessage,
} from "./protocol.js";

/** Interval for rolling summary updates (ms). */
const ROLLING_SUMMARY_INTERVAL_MS = 30_000;

/** Interval for global summary updates (ms). */
const GLOBAL_SUMMARY_INTERVAL_MS = 60_000;

/** Send a typed server message as JSON. */
function send(ws: WsSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

/** Send an error and optionally close the socket. */
function sendError(ws: WsSocket, code: string, message: string, close = false): void {
  send(ws, { type: "error", code, message });
  if (close) {
    ws.close(1008, message);
  }
}

export async function websocketHandler(app: FastifyInstance): Promise<void> {
  app.get("/ws", { websocket: true }, (socket, _request) => {
    const ws: WsSocket = socket;

    // Per-connection state
    let userId: string | null = null;
    let sessionId: string | null = null;
    let provider: TranscriptionProvider | null = null;
    let summarizer: SummarizationOrchestrator | null = null;
    let sessionManager: SessionManager | null = null;
    let rollingTimer: ReturnType<typeof setInterval> | null = null;
    let globalTimer: ReturnType<typeof setInterval> | null = null;
    let sessionActive = false;

    // ── Message dispatcher ───────────────────────────────────────────
    ws.on("message", async (raw: Buffer | string) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        sendError(ws, "INVALID_JSON", "Could not parse message");
        return;
      }

      switch (msg.type) {
        case "start_session":
          await handleStartSession(msg);
          break;
        case "audio_data":
          handleAudioData(msg);
          break;
        case "stop_session":
          await handleStopSession();
          break;
        default:
          sendError(ws, "UNKNOWN_TYPE", `Unknown message type: ${(msg as any).type}`);
      }
    });

    ws.on("close", async () => {
      logger.info({ sessionId }, "WebSocket closed");
      await cleanup();
    });

    ws.on("error", (err) => {
      logger.error({ err, sessionId }, "WebSocket error");
    });

    // ── start_session ────────────────────────────────────────────────
    async function handleStartSession(msg: Extract<ClientMessage, { type: "start_session" }>): Promise<void> {
      if (sessionActive) {
        sendError(ws, "ALREADY_STARTED", "Session already active");
        return;
      }

      // Authenticate via token in the message
      try {
        const decoded = jwt.verify(msg.token, config.jwtSecret) as { sub: string };
        userId = decoded.sub;
      } catch {
        sendError(ws, "AUTH_FAILED", "Invalid or expired token", true);
        return;
      }

      // Fetch user for watch names
      let watchNames: string[] = msg.watchNames ?? [];
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { names: true },
        });
        if (user?.names?.length) {
          watchNames = [...new Set([...watchNames, ...user.names])];
        }
      } catch (err) {
        logger.warn({ err }, "Failed to fetch user names");
      }

      // Create session in DB
      sessionManager = new SessionManager();
      try {
        const session = await sessionManager.createSession(userId, msg.source ?? "unknown");
        sessionId = session.id;
      } catch (err) {
        logger.error({ err }, "Failed to create session");
        sendError(ws, "SESSION_CREATE_FAILED", "Could not create session", true);
        return;
      }

      // Initialise transcription provider
      try {
        provider = createTranscriptionProvider();
        summarizer = new SummarizationOrchestrator(watchNames);

        await provider.start(
          // onPartial
          (text, timestamp) => {
            send(ws, { type: "transcript_partial", text, timestamp });
          },
          // onFinal
          async (text, speaker, timestamp, confidence) => {
            if (!sessionId || !sessionManager || !summarizer) return;

            // Persist the final segment
            try {
              const segment = await sessionManager.addSegment(
                sessionId,
                text,
                speaker,
                timestamp,
                confidence,
                true,
              );

              send(ws, {
                type: "transcript_final",
                segmentId: segment.id,
                text,
                speaker,
                timestamp,
                confidence,
              });

              // Run mention detection on each finalized segment
              const mentions = summarizer.addSegment(text, speaker, timestamp);
              for (const m of mentions) {
                const mention = await sessionManager.addMention(
                  sessionId,
                  m.name,
                  m.context,
                  m.timestamp,
                  m.sentiment,
                );
                send(ws, {
                  type: "mention_detected",
                  mentionId: mention.id,
                  name: m.name,
                  context: m.context,
                  timestamp: m.timestamp,
                  sentiment: m.sentiment,
                });
              }
            } catch (err) {
              logger.error({ err }, "Failed to process final transcript");
            }
          },
        );
      } catch (err) {
        logger.error({ err }, "Failed to start transcription provider");
        sendError(ws, "PROVIDER_FAILED", "Could not start transcription provider", true);
        return;
      }

      // Start periodic summary timers
      rollingTimer = setInterval(async () => {
        if (!summarizer || !sessionManager || !sessionId) return;
        try {
          const rolling = await summarizer.updateRollingSummary();
          if (rolling.content) {
            send(ws, {
              type: "rolling_summary",
              content: rolling.content,
              windowStart: rolling.windowStart,
              windowEnd: rolling.windowEnd,
            });
            await sessionManager.addSummary(
              sessionId,
              "rolling",
              rolling.content,
              rolling.windowStart,
              rolling.windowEnd,
            );
          }
        } catch (err) {
          logger.error({ err }, "Rolling summary update failed");
        }
      }, ROLLING_SUMMARY_INTERVAL_MS);

      globalTimer = setInterval(async () => {
        if (!summarizer || !sessionManager || !sessionId) return;
        try {
          const global = await summarizer.updateGlobalSummary();
          if (global) {
            send(ws, { type: "global_summary", content: global });
            await sessionManager.addSummary(
              sessionId,
              "global",
              global,
              null,
              null,
            );
          }
        } catch (err) {
          logger.error({ err }, "Global summary update failed");
        }
      }, GLOBAL_SUMMARY_INTERVAL_MS);

      sessionActive = true;

      send(ws, { type: "session_started", sessionId });
      logger.info({ sessionId, userId }, "Session started");
    }

    // ── audio_data ───────────────────────────────────────────────────
    function handleAudioData(msg: Extract<ClientMessage, { type: "audio_data" }>): void {
      if (!sessionActive || !provider) {
        sendError(ws, "NO_SESSION", "No active session");
        return;
      }
      const audioBuffer = Buffer.from(msg.data, "base64");
      provider.sendAudio(audioBuffer, msg.timestamp);
    }

    // ── stop_session ─────────────────────────────────────────────────
    async function handleStopSession(): Promise<void> {
      if (!sessionActive) {
        sendError(ws, "NO_SESSION", "No active session to stop");
        return;
      }

      await cleanup();
      ws.close(1000, "Session stopped");
    }

    // ── Cleanup / finalization ───────────────────────────────────────
    async function cleanup(): Promise<void> {
      if (!sessionActive) return;
      sessionActive = false;

      // Stop timers
      if (rollingTimer) clearInterval(rollingTimer);
      if (globalTimer) clearInterval(globalTimer);
      rollingTimer = null;
      globalTimer = null;

      // Stop transcription provider
      if (provider) {
        try {
          await provider.stop();
        } catch (err) {
          logger.error({ err }, "Error stopping transcription provider");
        }
        provider = null;
      }

      // Generate and persist final summary
      if (summarizer && sessionManager && sessionId) {
        try {
          const finalSummary = await summarizer.generateFinalSummary();
          if (finalSummary) {
            await sessionManager.addSummary(sessionId, "final", finalSummary, null, null);
          }
        } catch (err) {
          logger.error({ err }, "Final summary generation failed during cleanup");
        }
      }

      // Mark session as ended
      if (sessionManager && sessionId) {
        try {
          await sessionManager.endSession(sessionId);
        } catch (err) {
          logger.error({ err }, "Failed to end session");
        }
      }

      logger.info({ sessionId }, "Session cleanup complete");
    }
  });
}
