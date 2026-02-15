/**
 * GlobalSummaryService - hierarchical compression for full-meeting summaries.
 *
 * Strategy:
 *   1. Collect ~5-minute rolling summary snapshots as "chunks".
 *   2. When update() is called, compress all chunks into one global summary.
 *   3. For long meetings (>30 min / >6 chunks), apply progressive compression:
 *      merge older chunks first, so the context window stays manageable.
 *
 * Falls back to simple concatenation when no OpenAI key is available.
 */

import OpenAI from "openai";
import { config } from "../../config.js";
import { logger } from "../../utils/logger.js";

const SYSTEM_PROMPT = `You are a meeting summarizer. Given multiple summary chunks from different portions of a meeting, produce a single, coherent summary that covers:
- Key topics discussed
- Decisions made
- Action items and owners
- Open questions or risks

Keep the summary concise (5-10 bullet points). Use plain bullet points starting with "- ". Do not use markdown headers.`;

const COMPRESSION_PROMPT = `You are a meeting summarizer. The following are older summary chunks from a long meeting. Compress them into a shorter combined summary that preserves the most important points. Use plain bullet points starting with "- ".`;

/** Maximum chunks before we start compressing older ones. */
const COMPRESS_THRESHOLD = 6;

export class GlobalSummaryService {
  private chunks: string[] = [];
  private openai: OpenAI | null;
  private currentSummary = "";

  constructor() {
    this.openai = config.openaiApiKey
      ? new OpenAI({ apiKey: config.openaiApiKey })
      : null;
  }

  /** Add a new rolling summary snapshot as a chunk. */
  addChunk(rollingSummary: string): void {
    if (!rollingSummary.trim()) return;
    this.chunks.push(rollingSummary);
  }

  /**
   * Regenerate the global summary from all collected chunks.
   * Applies progressive compression for long meetings.
   */
  async update(): Promise<string> {
    if (this.chunks.length === 0) {
      return this.currentSummary;
    }

    // Progressive compression: merge older chunks when we exceed threshold
    if (this.chunks.length > COMPRESS_THRESHOLD) {
      await this.compressOlderChunks();
    }

    const combined = this.chunks
      .map((chunk, i) => `[Chunk ${i + 1}]\n${chunk}`)
      .join("\n\n");

    if (!this.openai) {
      // Fallback: concatenate all chunks
      this.currentSummary = this.chunks.join("\n\n---\n\n");
      return this.currentSummary;
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 800,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: combined },
        ],
      });

      this.currentSummary =
        response.choices[0]?.message?.content?.trim() ?? "";
    } catch (err) {
      logger.error({ err }, "Global summary generation failed");
    }

    return this.currentSummary;
  }

  /** Get the current global summary without regenerating. */
  getSummary(): string {
    return this.currentSummary;
  }

  /**
   * Compress the first half of older chunks into a single chunk
   * to keep the total number manageable.
   */
  private async compressOlderChunks(): Promise<void> {
    const halfIndex = Math.ceil(this.chunks.length / 2);
    const olderChunks = this.chunks.slice(0, halfIndex);
    const newerChunks = this.chunks.slice(halfIndex);

    const combined = olderChunks.join("\n\n");

    if (!this.openai) {
      // Without AI, just keep the first chunk as a concatenation
      this.chunks = [combined, ...newerChunks];
      return;
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          { role: "system", content: COMPRESSION_PROMPT },
          { role: "user", content: combined },
        ],
      });

      const compressed =
        response.choices[0]?.message?.content?.trim() ?? combined;
      this.chunks = [compressed, ...newerChunks];
    } catch (err) {
      logger.error({ err }, "Chunk compression failed");
      // Keep chunks as-is on error
    }
  }
}
