/**
 * MockTranscriptionProvider - simulates realistic transcription for demo/dev.
 *
 * Cycles through pre-written meeting dialogue lines, emitting partial then
 * final transcripts with a realistic delay when audio data arrives.
 */

import type { TranscriptionProvider } from "./provider.js";
import { logger } from "../../utils/logger.js";

/** Sample meeting dialogue for a realistic demo experience. */
const SAMPLE_LINES: Array<{ speaker: string; text: string }> = [
  { speaker: "Alice", text: "Good morning everyone, thanks for joining the standup." },
  { speaker: "Bob", text: "Morning! I've got a quick update on the API migration." },
  { speaker: "Alice", text: "Great, go ahead Bob." },
  { speaker: "Bob", text: "So I finished refactoring the authentication endpoints yesterday. All tests are passing." },
  { speaker: "Carol", text: "Nice. Did you also update the rate limiting middleware?" },
  { speaker: "Bob", text: "Not yet, that's my plan for today. I need to check the Redis configuration first." },
  { speaker: "Alice", text: "Sounds good. Carol, how's the dashboard coming along?" },
  { speaker: "Carol", text: "The main dashboard is done. I'm working on the analytics charts now." },
  { speaker: "Carol", text: "I ran into an issue with the date range picker component. It doesn't handle timezone offsets correctly." },
  { speaker: "Alice", text: "Can you file a bug for that? We should track it in the sprint board." },
  { speaker: "Carol", text: "Already done. I tagged it as a blocker for the release." },
  { speaker: "Dave", text: "Hey, sorry I'm late. Quick question about the deployment pipeline." },
  { speaker: "Alice", text: "Sure Dave, go ahead." },
  { speaker: "Dave", text: "Are we still targeting Friday for the staging deployment?" },
  { speaker: "Alice", text: "Yes, Friday afternoon. Please make sure your PRs are merged by Thursday end of day." },
  { speaker: "Bob", text: "I should be able to get the rate limiter PR up by Wednesday." },
  { speaker: "Carol", text: "Same here, the analytics feature should be ready for review tomorrow." },
  { speaker: "Dave", text: "Perfect. I'll need to update the CI config to add the new environment variables." },
  { speaker: "Alice", text: "Good call. Can you also document those in the README?" },
  { speaker: "Dave", text: "Sure, I'll do that as part of the same PR." },
  { speaker: "Alice", text: "Any blockers or risks anyone wants to flag?" },
  { speaker: "Bob", text: "One concern - the third-party payment API has been flaky this week. We might want a fallback." },
  { speaker: "Alice", text: "Good point. Let's schedule a quick meeting to discuss the fallback strategy. Carol, can you set that up?" },
  { speaker: "Carol", text: "Sure, I'll send out a calendar invite for this afternoon." },
  { speaker: "Alice", text: "Great. Anything else? No? Alright, let's get to it. Have a productive day everyone!" },
];

export class MockTranscriptionProvider implements TranscriptionProvider {
  private onPartial: ((text: string, timestamp: number) => void) | null = null;
  private onFinal:
    | ((text: string, speaker: string | null, timestamp: number, confidence: number) => void)
    | null = null;
  private lineIndex = 0;
  private running = false;
  private pendingTimeouts: ReturnType<typeof setTimeout>[] = [];

  async start(
    onPartial: (text: string, timestamp: number) => void,
    onFinal: (text: string, speaker: string | null, timestamp: number, confidence: number) => void,
  ): Promise<void> {
    this.onPartial = onPartial;
    this.onFinal = onFinal;
    this.running = true;
    logger.info("MockTranscriptionProvider started");
  }

  sendAudio(_data: Buffer, timestamp: number): void {
    if (!this.running || !this.onPartial || !this.onFinal) return;

    const line = SAMPLE_LINES[this.lineIndex % SAMPLE_LINES.length];
    this.lineIndex++;

    const words = line.text.split(" ");

    // Emit partial transcripts as words accumulate
    let partialText = "";
    words.forEach((word, i) => {
      const delay = (i + 1) * 80; // ~80ms per word for a realistic feel
      const timeout = setTimeout(() => {
        if (!this.running) return;
        partialText += (partialText ? " " : "") + word;
        this.onPartial?.(partialText, timestamp);
      }, delay);
      this.pendingTimeouts.push(timeout);
    });

    // Emit final transcript after all words
    const finalDelay = words.length * 80 + randomBetween(200, 500);
    const finalTimeout = setTimeout(() => {
      if (!this.running) return;
      const confidence = 0.85 + Math.random() * 0.14; // 0.85-0.99
      this.onFinal?.(line.text, line.speaker, timestamp, parseFloat(confidence.toFixed(2)));
    }, finalDelay);
    this.pendingTimeouts.push(finalTimeout);
  }

  async stop(): Promise<void> {
    this.running = false;
    // Clear all pending simulated timeouts
    for (const t of this.pendingTimeouts) {
      clearTimeout(t);
    }
    this.pendingTimeouts = [];
    logger.info("MockTranscriptionProvider stopped");
  }
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
