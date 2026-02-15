/**
 * RollingSummaryService - maintains a summary of the last ~5 minutes of
 * transcript text.
 *
 * When update() is called, it sends recent transcript to OpenAI to produce
 * 2-3 concise bullet points. Falls back to a simple truncation when no
 * API key is available.
 */

import OpenAI from "openai";
import { config } from "../../config.js";
import { logger } from "../../utils/logger.js";

/** A transcript segment kept in the rolling buffer. */
interface BufferedSegment {
  text: string;
  speaker: string | null;
  timestamp: number;
}

/** Five minutes in seconds. */
const WINDOW_SECONDS = 300;

const SYSTEM_PROMPT = `You are a concise meeting summarizer. Given the last few minutes of a meeting transcript, produce 2-3 bullet points capturing the key points discussed. Be specific, mention names, and focus on decisions and action items. Do not use markdown headers. Use plain bullet points starting with "- ".`;

export class RollingSummaryService {
  private buffer: BufferedSegment[] = [];
  private openai: OpenAI | null;
  private currentSummary = "";

  constructor() {
    this.openai = config.llmApiKey
      ? new OpenAI({ apiKey: config.llmApiKey, baseURL: config.llmBaseUrl })
      : null;
  }

  /** Add a finalized segment to the rolling buffer. */
  addSegment(text: string, speaker: string | null, timestamp: number): void {
    this.buffer.push({ text, speaker, timestamp });
    this.pruneBuffer(timestamp);
  }

  /**
   * Regenerate the rolling summary from the current buffer.
   * Returns the summary text.
   */
  async update(): Promise<string> {
    if (this.buffer.length === 0) {
      this.currentSummary = "";
      return this.currentSummary;
    }

    const transcript = this.buffer
      .map((s) => `${s.speaker ?? "Unknown"}: ${s.text}`)
      .join("\n");

    if (!this.openai) {
      // Fallback: simple truncation
      const maxLen = 500;
      const truncated =
        transcript.length > maxLen
          ? transcript.slice(transcript.length - maxLen)
          : transcript;
      this.currentSummary = `Last 5 min: ${truncated}`;
      return this.currentSummary;
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: config.llmModel,
        temperature: 0.3,
        max_tokens: 300,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: transcript },
        ],
      });

      this.currentSummary =
        response.choices[0]?.message?.content?.trim() ?? "";
    } catch (err) {
      logger.error({ err }, "Rolling summary generation failed");
      // Keep the previous summary on error
    }

    return this.currentSummary;
  }

  /** Get the current rolling summary without regenerating. */
  getSummary(): string {
    return this.currentSummary;
  }

  /** Get the time window covered by the buffer. */
  getWindow(): { start: number; end: number } {
    if (this.buffer.length === 0) return { start: 0, end: 0 };
    return {
      start: this.buffer[0].timestamp,
      end: this.buffer[this.buffer.length - 1].timestamp,
    };
  }

  /** Remove segments older than the rolling window. */
  private pruneBuffer(currentTimestamp: number): void {
    const cutoff = currentTimestamp - WINDOW_SECONDS;
    this.buffer = this.buffer.filter((s) => s.timestamp >= cutoff);
  }
}
