/**
 * DeepgramTranscriptionProvider - real-time transcription via Deepgram's
 * WebSocket streaming API.
 *
 * Connects to wss://api.deepgram.com/v1/listen with Nova-2 model,
 * smart formatting, diarisation, and interim results enabled.
 */

import WebSocket from "ws";
import type { TranscriptionProvider } from "./provider.js";
import { logger } from "../../utils/logger.js";

/** Deepgram streaming API endpoint with query parameters. */
const DEEPGRAM_WS_URL =
  "wss://api.deepgram.com/v1/listen?" +
  new URLSearchParams({
    model: "nova-2",
    language: "en",
    smart_format: "true",
    diarize: "true",
    interim_results: "true",
    encoding: "linear16",
    sample_rate: "16000",
    channels: "1",
  }).toString();

/** Maximum number of automatic reconnection attempts. */
const MAX_RECONNECT_ATTEMPTS = 5;

/** Base delay between reconnects (ms). Multiplied by attempt number. */
const RECONNECT_BASE_DELAY_MS = 1000;

export class DeepgramTranscriptionProvider implements TranscriptionProvider {
  private apiKey: string;
  private ws: WebSocket | null = null;
  private onPartial: ((text: string, timestamp: number) => void) | null = null;
  private onFinal:
    | ((text: string, speaker: string | null, timestamp: number, confidence: number) => void)
    | null = null;
  private reconnectAttempts = 0;
  private running = false;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async start(
    onPartial: (text: string, timestamp: number) => void,
    onFinal: (
      text: string,
      speaker: string | null,
      timestamp: number,
      confidence: number,
    ) => void,
  ): Promise<void> {
    this.onPartial = onPartial;
    this.onFinal = onFinal;
    this.running = true;
    await this.connect();
  }

  sendAudio(data: Buffer, _timestamp: number): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.ws) {
      // Send close message to Deepgram to flush any remaining audio
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "CloseStream" }));
      }
      // Give Deepgram a moment to send final results
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          this.ws?.close();
          resolve();
        }, 2000);
        this.ws?.once("close", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
      this.ws = null;
    }
    logger.info("DeepgramTranscriptionProvider stopped");
  }

  // ── Private helpers ──────────────────────────────────────────────────

  private async connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      logger.info("Connecting to Deepgram streaming API");

      this.ws = new WebSocket(DEEPGRAM_WS_URL, {
        headers: { Authorization: `Token ${this.apiKey}` },
      });

      this.ws.on("open", () => {
        logger.info("Deepgram WebSocket connected");
        this.reconnectAttempts = 0;
        resolve();
      });

      this.ws.on("message", (raw: Buffer | string) => {
        this.handleMessage(raw);
      });

      this.ws.on("close", (code, reason) => {
        logger.warn(
          { code, reason: reason.toString() },
          "Deepgram WebSocket closed",
        );
        if (this.running) {
          this.attemptReconnect();
        }
      });

      this.ws.on("error", (err) => {
        logger.error({ err }, "Deepgram WebSocket error");
        if (this.reconnectAttempts === 0) {
          reject(err);
        }
      });
    });
  }

  private handleMessage(raw: Buffer | string): void {
    try {
      const msg = JSON.parse(raw.toString());

      // Deepgram returns results under channel.alternatives
      const channel = msg?.channel;
      if (!channel) return;

      const alt = channel.alternatives?.[0];
      if (!alt || !alt.transcript) return;

      const text: string = alt.transcript;
      if (!text.trim()) return;

      const isFinal: boolean = msg.is_final === true;
      const start: number = msg.start ?? 0;

      if (isFinal) {
        // Extract speaker from diarisation (word-level speaker info)
        let speaker: string | null = null;
        if (alt.words?.length > 0 && alt.words[0].speaker !== undefined) {
          speaker = `Speaker ${alt.words[0].speaker}`;
        }

        const confidence: number = alt.confidence ?? 0;
        this.onFinal?.(text, speaker, start, confidence);
      } else {
        this.onPartial?.(text, start);
      }
    } catch (err) {
      logger.error({ err }, "Failed to parse Deepgram message");
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logger.error("Max Deepgram reconnect attempts reached");
      return;
    }

    this.reconnectAttempts++;
    const delay = RECONNECT_BASE_DELAY_MS * this.reconnectAttempts;

    logger.info(
      { attempt: this.reconnectAttempts, delayMs: delay },
      "Scheduling Deepgram reconnect",
    );

    setTimeout(() => {
      if (this.running) {
        this.connect().catch((err) => {
          logger.error({ err }, "Deepgram reconnect failed");
        });
      }
    }, delay);
  }
}
