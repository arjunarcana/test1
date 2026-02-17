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

/* ─── Offscreen document management ──────────────────────────────────────── */

const OFFSCREEN_URL = 'src/offscreen/index.html';

async function ensureOffscreen(): Promise<void> {
  const contexts = await (chrome.runtime as unknown as {
    getContexts: (filter: { contextTypes: string[] }) => Promise<{ documentUrl?: string }[]>;
  }).getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });

  if (contexts.some((c) => c.documentUrl?.endsWith(OFFSCREEN_URL))) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: 'SpeechRecognition requires a full renderer context',
  });
}

async function removeOffscreen(): Promise<void> {
  try {
    await chrome.offscreen.closeDocument();
  } catch { /* no document open */ }
}

/* ─── Recording lifecycle ─────────────────────────────────────────────────── */

async function startRecording(source: CaptureSource): Promise<void> {
  const sessionId = generateSessionId();
  const settings = await getSettings();

  const langMap: Record<string, string> = {
    en: 'en-US', es: 'es-ES', fr: 'fr-FR',
    de: 'de-DE', pt: 'pt-BR', ja: 'ja-JP', zh: 'zh-CN',
  };
  const lang = langMap[settings.language] ?? 'en-US';

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

  // Launch offscreen document for SpeechRecognition
  await ensureOffscreen();
  chrome.runtime.sendMessage({ type: 'START_SPEECH', payload: { lang } }).catch(() => {});
}

async function stopRecording(): Promise<void> {
  chrome.runtime.sendMessage({ type: 'STOP_SPEECH' }).catch(() => {});
  broadcastState({ status: 'stopped' });
  // Clean up after a short delay to let the stop message arrive
  setTimeout(() => removeOffscreen(), 500);
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

      /* ─── Transcript from offscreen document ──────────────────────── */

      case 'SPEECH_RESULT':
      case MSG.TRANSCRIPT_PARTIAL:
      case MSG.TRANSCRIPT_FINAL: {
        const { id, text, timestamp, isFinal } = message.payload as {
          id: string;
          text: string;
          timestamp: number;
          isFinal?: boolean;
        };
        const final = message.type === MSG.TRANSCRIPT_FINAL || (isFinal === true);
        const segment: TranscriptSegment = { id, text, timestamp, isFinal: final };
        const segments = [...sessionState.segments];
        const idx = segments.findIndex((s) => s.id === segment.id);
        if (idx >= 0) {
          segments[idx] = segment;
        } else {
          segments.push(segment);
        }
        broadcastState({ segments });

        if (final) checkMentions(text, timestamp);
        return false;
      }

      case 'SPEECH_STATUS': {
        // Forward mic status to side panel
        const { status: micStatus, error: micError } = message.payload as {
          status: string;
          error?: string;
        };
        chrome.runtime.sendMessage({
          type: 'MIC_STATUS_UPDATE',
          payload: { micStatus, micError: micError ?? null },
        }).catch(() => {});
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
