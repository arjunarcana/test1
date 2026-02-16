// ─── Client → Server messages ────────────────────────────────────────────────

export interface StartSessionMessage {
  type: 'start_session';
  payload: {
    language: string;
    diarization: boolean;
    names: string[];
    provider: 'mock' | 'deepgram';
  };
}

export interface AudioDataMessage {
  type: 'audio_data';
  payload: {
    data: string; // base64-encoded PCM16 mono 16 kHz
    sequence: number;
  };
}

export interface StopSessionMessage {
  type: 'stop_session';
  payload: {
    sessionId: string;
  };
}

export type ClientMessage = StartSessionMessage | AudioDataMessage | StopSessionMessage;

// ─── Server → Client messages ────────────────────────────────────────────────

export interface SessionStartedMessage {
  type: 'session_started';
  payload: {
    sessionId: string;
  };
}

export interface TranscriptPartialMessage {
  type: 'transcript_partial';
  payload: {
    id: string;
    text: string;
    speaker?: string;
    timestamp: number;
  };
}

export interface TranscriptFinalMessage {
  type: 'transcript_final';
  payload: {
    id: string;
    text: string;
    speaker?: string;
    timestamp: number;
  };
}

export interface RollingSummaryMessage {
  type: 'rolling_summary';
  payload: {
    content: string;
    windowStart: number;
    windowEnd: number;
  };
}

export interface GlobalSummaryMessage {
  type: 'global_summary';
  payload: {
    content: string;
  };
}

export interface MentionDetectedMessage {
  type: 'mention_detected';
  payload: {
    name: string;
    context: string;
    timestamp: number;
    sentiment: string;
  };
}

export interface ErrorMessage {
  type: 'error';
  payload: {
    code: string;
    message: string;
  };
}

export type ServerMessage =
  | SessionStartedMessage
  | TranscriptPartialMessage
  | TranscriptFinalMessage
  | RollingSummaryMessage
  | GlobalSummaryMessage
  | MentionDetectedMessage
  | ErrorMessage;

// ─── Native Bridge: Client → Bridge messages ────────────────────────────────

export interface StartCaptureMessage {
  type: 'start_capture';
  payload: {
    channels: number;
    sampleRate: number;
  };
}

export interface StopCaptureMessage {
  type: 'stop_capture';
}

export interface GetStatusMessage {
  type: 'get_status';
}

export type BridgeClientMessage = StartCaptureMessage | StopCaptureMessage | GetStatusMessage;

// ─── Native Bridge: Bridge → Client messages ────────────────────────────────

export interface BridgeStatusMessage {
  type: 'status';
  payload: {
    capturing: boolean;
    sampleRate: number;
    channels: number;
  };
}

export interface AudioFrameMessage {
  type: 'audio_frame';
  payload: {
    data: string; // base64 PCM16
    sequence: number;
  };
}

export interface BridgeErrorMessage {
  type: 'error';
  payload: {
    code: string;
    message: string;
  };
}

export interface PermissionRequiredMessage {
  type: 'permission_required';
  payload: {
    permission: string;
    instructions: string;
  };
}

export type BridgeServerMessage =
  | BridgeStatusMessage
  | AudioFrameMessage
  | BridgeErrorMessage
  | PermissionRequiredMessage;

// ─── Internal extension message protocol ─────────────────────────────────────

export interface ExtensionMessage {
  type: string;
  payload?: unknown;
}

export const MSG = {
  START_RECORDING: 'START_RECORDING',
  STOP_RECORDING: 'STOP_RECORDING',
  GET_STATUS: 'GET_STATUS',
  GET_SESSION_STATE: 'GET_SESSION_STATE',
  SESSION_STATE_UPDATE: 'SESSION_STATE_UPDATE',
  TRANSCRIPT_PARTIAL: 'TRANSCRIPT_PARTIAL',
  TRANSCRIPT_FINAL: 'TRANSCRIPT_FINAL',
} as const;
