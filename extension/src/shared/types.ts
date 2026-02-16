export type CaptureSource = 'auto' | 'tab' | 'system+mic' | 'mic-only';
export type SessionStatus = 'idle' | 'connecting' | 'recording' | 'transcribing' | 'error' | 'stopped';

export interface TranscriptSegment {
  id: string;
  text: string;
  speaker?: string;
  timestamp: number;
  isFinal: boolean;
}

export interface RollingSummary {
  content: string;
  windowStart: number;
  windowEnd: number;
  updatedAt: number;
}

export interface MentionEvent {
  name: string;
  context: string;
  timestamp: number;
  sentiment: string;
}

export interface SessionState {
  status: SessionStatus;
  sessionId: string | null;
  source: CaptureSource;
  segments: TranscriptSegment[];
  rollingSummary: RollingSummary | null;
  globalSummary: string | null;
  mentions: MentionEvent[];
  startedAt: number | null;
  error: string | null;
}

export interface UserSettings {
  names: string[];
  language: string;
  diarizationEnabled: boolean;
  retentionDays: number;
}

export const DEFAULT_SETTINGS: UserSettings = {
  names: [],
  language: 'en',
  diarizationEnabled: true,
  retentionDays: 30,
};

export const DEFAULT_SESSION_STATE: SessionState = {
  status: 'idle',
  sessionId: null,
  source: 'auto',
  segments: [],
  rollingSummary: null,
  globalSummary: null,
  mentions: [],
  startedAt: null,
  error: null,
};
