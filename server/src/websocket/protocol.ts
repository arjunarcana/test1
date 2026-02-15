/**
 * WebSocket message protocol types.
 *
 * Uses discriminated unions on the `type` field so each message variant
 * carries exactly the fields it needs.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Client -> Server messages
// ─────────────────────────────────────────────────────────────────────────────

export interface StartSession {
  type: "start_session";
  /** Audio source identifier, e.g. "browser-mic", "system-audio" */
  source: string;
  /** JWT token for authentication */
  token: string;
  /** Optional names to monitor for mentions */
  watchNames?: string[];
}

export interface AudioData {
  type: "audio_data";
  /** Base64-encoded audio chunk (PCM/16-bit LE, 16 kHz mono) */
  data: string;
  /** Client-side timestamp of this chunk in seconds from session start */
  timestamp: number;
}

export interface StopSession {
  type: "stop_session";
}

export type ClientMessage = StartSession | AudioData | StopSession;

// ─────────────────────────────────────────────────────────────────────────────
// Server -> Client messages
// ─────────────────────────────────────────────────────────────────────────────

export interface SessionStarted {
  type: "session_started";
  sessionId: string;
}

export interface TranscriptPartial {
  type: "transcript_partial";
  text: string;
  timestamp: number;
}

export interface TranscriptFinal {
  type: "transcript_final";
  segmentId: string;
  text: string;
  speaker: string | null;
  timestamp: number;
  confidence: number;
}

export interface RollingSummary {
  type: "rolling_summary";
  content: string;
  windowStart: number;
  windowEnd: number;
}

export interface GlobalSummary {
  type: "global_summary";
  content: string;
}

export interface MentionDetected {
  type: "mention_detected";
  mentionId: string;
  name: string;
  context: string;
  timestamp: number;
  sentiment: string | null;
}

export interface ErrorMessage {
  type: "error";
  code: string;
  message: string;
}

export type ServerMessage =
  | SessionStarted
  | TranscriptPartial
  | TranscriptFinal
  | RollingSummary
  | GlobalSummary
  | MentionDetected
  | ErrorMessage;
