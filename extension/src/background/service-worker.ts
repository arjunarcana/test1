import type {
  SessionState,
  TranscriptSegment,
  CaptureSource,
} from '../shared/types.ts';
import { DEFAULT_SESSION_STATE } from '../shared/types.ts';
import { MSG } from '../shared/protocol.ts';
import { getSettings, getSessionState, saveSessionState } from '../shared/storage.ts';

/* ─── State ───────────────────────────────────────────────────────────────── */

let sessionState: SessionState = { ...DEFAULT_SESSION_STATE };

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function broadcastState(partial: Partial<SessionState>): void {
  sessionState = { ...sessionState, ...partial };

  chrome.runtime.sendMessage({
    type: MSG.SESSION_STATE_UPDATE,
    payload: partial,
  }).catch(() => {
    // No listeners - that's fine (views may be closed)
  });

  saveSessionState(partial).catch(console.error);
}

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/* ─── Recording lifecycle ─────────────────────────────────────────────────── */

async function startRecording(source: CaptureSource): Promise<void> {
  const sessionId = generateSessionId();

  // Transition straight to 'recording' — the side panel will pick up
  // the status change and start SpeechRecognition in its own page context.
  broadcastState({
    status: 'recording',
    sessionId,
    source,
    segments: [],
    rollingSummary: null,
    globalSummary: null,
    mentions: [],
    startedAt: Date.now(),
    error: null,
  });
}

async function stopRecording(): Promise<void> {
  broadcastState({ status: 'stopped' });
}

/* ─── Message listener ────────────────────────────────────────────────────── */

chrome.runtime.onMessage.addListener(
  (
    message: { type: string; payload?: Record<string, unknown> },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ) => {
    switch (message.type) {
      case MSG.START_RECORDING: {
        const source = (message.payload?.source as CaptureSource) ?? 'mic-only';
        startRecording(source)
          .then(() => sendResponse({ success: true }))
          .catch((err) =>
            sendResponse({ success: false, error: err instanceof Error ? err.message : 'Unknown error' })
          );
        return true;
      }

      case MSG.STOP_RECORDING: {
        stopRecording()
          .then(() => sendResponse({ success: true }))
          .catch((err) =>
            sendResponse({ success: false, error: err instanceof Error ? err.message : 'Unknown error' })
          );
        return true;
      }

      case MSG.GET_STATUS: {
        sendResponse({
          status: sessionState.status,
          source: sessionState.source,
          sessionId: sessionState.sessionId,
          startedAt: sessionState.startedAt,
          error: sessionState.error,
        });
        return false;
      }

      case MSG.GET_SESSION_STATE: {
        sendResponse(sessionState);
        return false;
      }

      /* ─── Transcript messages from side panel ────────────────────────── */

      case MSG.TRANSCRIPT_PARTIAL: {
        const { id, text, timestamp } = message.payload as {
          id: string;
          text: string;
          timestamp: number;
        };
        const segment: TranscriptSegment = {
          id,
          text,
          timestamp,
          isFinal: false,
        };
        const segments = [...sessionState.segments];
        const idx = segments.findIndex((s) => s.id === segment.id);
        if (idx >= 0) {
          segments[idx] = segment;
        } else {
          segments.push(segment);
        }
        broadcastState({ segments });
        return false;
      }

      case MSG.TRANSCRIPT_FINAL: {
        const { id, text, timestamp } = message.payload as {
          id: string;
          text: string;
          timestamp: number;
        };
        const segment: TranscriptSegment = {
          id,
          text,
          timestamp,
          isFinal: true,
        };
        const segments = [...sessionState.segments];
        const idx = segments.findIndex((s) => s.id === segment.id);
        if (idx >= 0) {
          segments[idx] = segment;
        } else {
          segments.push(segment);
        }
        broadcastState({ segments });

        // Check for name mentions
        checkMentions(text, timestamp);
        return false;
      }

      default:
        return false;
    }
  }
);

/* ─── Mention detection (local) ───────────────────────────────────────────── */

async function checkMentions(text: string, timestamp: number): Promise<void> {
  const settings = await getSettings();
  if (settings.names.length === 0) return;

  const lower = text.toLowerCase();
  for (const name of settings.names) {
    if (lower.includes(name.toLowerCase())) {
      const mentions = [
        ...sessionState.mentions,
        {
          name,
          context: text,
          timestamp,
          sentiment: 'neutral',
        },
      ];
      broadcastState({ mentions });
    }
  }
}

/* ─── Restore state on service worker restart ─────────────────────────────── */

(async () => {
  try {
    const savedState = await getSessionState();
    if (savedState.status === 'recording' || savedState.status === 'transcribing') {
      sessionState = {
        ...savedState,
        status: 'error',
        error: 'Recording interrupted. Please restart.',
      };
      await saveSessionState(sessionState);
    } else {
      sessionState = savedState;
    }
  } catch {
    sessionState = { ...DEFAULT_SESSION_STATE };
  }
})();

/* ─── Side panel behavior ─────────────────────────────────────────────────── */

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error);
