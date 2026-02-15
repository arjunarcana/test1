/**
 * TranscriptionProvider interface and factory.
 *
 * The factory returns the appropriate provider based on config.transcriptionProvider.
 */

import { config } from "../../config.js";
import { MockTranscriptionProvider } from "./mock-provider.js";
import { DeepgramTranscriptionProvider } from "./deepgram-provider.js";

export interface TranscriptionProvider {
  /**
   * Start the provider, supplying callbacks for partial and final transcripts.
   *
   * @param onPartial  Called with interim (non-final) text and timestamp.
   * @param onFinal    Called with final text, optional speaker label, timestamp, and confidence.
   */
  start(
    onPartial: (text: string, timestamp: number) => void,
    onFinal: (
      text: string,
      speaker: string | null,
      timestamp: number,
      confidence: number,
    ) => void,
  ): Promise<void>;

  /**
   * Feed an audio chunk to the provider.
   *
   * @param data      Raw audio bytes (PCM 16-bit LE, 16 kHz mono).
   * @param timestamp Client-side timestamp in seconds from session start.
   */
  sendAudio(data: Buffer, timestamp: number): void;

  /**
   * Signal end of audio stream. The provider should flush any buffered results.
   */
  stop(): Promise<void>;
}

/**
 * Create a transcription provider based on the current configuration.
 */
export function createTranscriptionProvider(): TranscriptionProvider {
  switch (config.transcriptionProvider) {
    case "deepgram":
      if (!config.deepgramApiKey) {
        throw new Error(
          "DEEPGRAM_API_KEY is required when TRANSCRIPTION_PROVIDER=deepgram",
        );
      }
      return new DeepgramTranscriptionProvider(config.deepgramApiKey);

    case "mock":
    default:
      return new MockTranscriptionProvider();
  }
}
