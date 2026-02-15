/**
 * SummarizationOrchestrator - coordinates rolling summaries, global summaries,
 * and mention detection for a single session.
 *
 * Provides a unified API for the WebSocket handler to feed transcript segments
 * and retrieve summarisation results.
 */

import OpenAI from "openai";
import { config } from "../../config.js";
import { logger } from "../../utils/logger.js";
import { RollingSummaryService } from "./rolling-summary.js";
import { GlobalSummaryService } from "./global-summary.js";
import { MentionsDetector, type MentionEvent } from "./mentions-detector.js";

const FINAL_SUMMARY_PROMPT = `You are a meeting summarizer. Given the full transcript of a meeting, produce a comprehensive final summary with the following sections:

**Key Discussion Points**
- List the main topics discussed

**Decisions Made**
- List all decisions that were agreed upon

**Action Items**
- List action items with owners (if mentioned)

**Open Questions / Risks**
- List any unresolved questions or flagged risks

Use plain bullet points. Be specific and concise.`;

export class SummarizationOrchestrator {
  private rollingSummary: RollingSummaryService;
  private globalSummary: GlobalSummaryService;
  private mentionsDetector: MentionsDetector;
  private allSegments: Array<{ text: string; speaker: string | null; timestamp: number }> = [];
  private openai: OpenAI | null;

  constructor(watchNames: string[]) {
    this.rollingSummary = new RollingSummaryService();
    this.globalSummary = new GlobalSummaryService();
    this.mentionsDetector = new MentionsDetector(watchNames);
    this.openai = config.llmApiKey
      ? new OpenAI({ apiKey: config.llmApiKey, baseURL: config.llmBaseUrl })
      : null;
  }

  /**
   * Feed a finalized transcript segment to all sub-services.
   * Returns any mention events detected in this segment.
   */
  addSegment(
    text: string,
    speaker: string | null,
    timestamp: number,
  ): MentionEvent[] {
    this.allSegments.push({ text, speaker, timestamp });
    this.rollingSummary.addSegment(text, speaker, timestamp);
    return this.mentionsDetector.detect(text, timestamp);
  }

  /**
   * Regenerate the rolling summary and feed it to the global summary.
   * Returns the new rolling summary text and time window.
   */
  async updateRollingSummary(): Promise<{
    content: string;
    windowStart: number;
    windowEnd: number;
  }> {
    const content = await this.rollingSummary.update();
    const window = this.rollingSummary.getWindow();

    // Feed rolling summary snapshot to global summary as a chunk
    if (content) {
      this.globalSummary.addChunk(content);
    }

    return {
      content,
      windowStart: window.start,
      windowEnd: window.end,
    };
  }

  /**
   * Regenerate the global summary.
   * Returns the summary text.
   */
  async updateGlobalSummary(): Promise<string> {
    return this.globalSummary.update();
  }

  /**
   * Get the current rolling summary without regenerating.
   */
  getRollingSummary(): string {
    return this.rollingSummary.getSummary();
  }

  /**
   * Get the current global summary without regenerating.
   */
  getGlobalSummary(): string {
    return this.globalSummary.getSummary();
  }

  /**
   * Generate a comprehensive final summary using the full transcript.
   * This is called once when the session ends.
   */
  async generateFinalSummary(): Promise<string> {
    if (this.allSegments.length === 0) {
      return "No transcript segments recorded.";
    }

    const fullTranscript = this.allSegments
      .map((s) => `${s.speaker ?? "Unknown"}: ${s.text}`)
      .join("\n");

    if (!this.openai) {
      // Fallback: return the global summary plus transcript excerpt
      const globalFallback = this.globalSummary.getSummary();
      if (globalFallback) {
        return `Final Summary (auto-generated without AI):\n\n${globalFallback}`;
      }
      const truncated =
        fullTranscript.length > 2000
          ? fullTranscript.slice(0, 2000) + "\n\n[...truncated]"
          : fullTranscript;
      return `Final Summary (no AI key):\n\n${truncated}`;
    }

    try {
      // For very long transcripts, use the global summary as input instead
      const input =
        fullTranscript.length > 15000
          ? `[Note: This is a compressed summary of the full meeting due to length.]\n\n${this.globalSummary.getSummary()}\n\n[Last 10 minutes transcript:]\n${fullTranscript.slice(-5000)}`
          : fullTranscript;

      const response = await this.openai.chat.completions.create({
        model: config.llmModel,
        temperature: 0.3,
        max_tokens: 1500,
        messages: [
          { role: "system", content: FINAL_SUMMARY_PROMPT },
          { role: "user", content: input },
        ],
      });

      return response.choices[0]?.message?.content?.trim() ?? "";
    } catch (err) {
      logger.error({ err }, "Final summary generation failed");
      // Return whatever global summary we have
      return (
        this.globalSummary.getSummary() ||
        "Summary generation failed. Please review the transcript."
      );
    }
  }
}
