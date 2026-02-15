import type {
  SessionState,
  TranscriptSegment,
  UserSettings,
  CaptureSource,
} from '../shared/types.ts';
import { DEFAULT_SESSION_STATE } from '../shared/types.ts';
import { MSG } from '../shared/protocol.ts';
import type { ServerMessage, ClientMessage } from '../shared/protocol.ts';
import { getSettings, getSessionState, saveSessionState, clearSessionState } from '../shared/storage.ts';
import { startMicCapture, startTabCapture, stopCapture } from './audio-capture.ts';
import { NativeBridge } from './native-bridge.ts';

/* ─── State ───────────────────────────────────────────────────────────────── */

let ws: WebSocket | null = null;
let sessionState: SessionState = { ...DEFAULT_SESSION_STATE };
let settings: UserSettings | null = null;
let nativeBridge: NativeBridge | null = null;
let audioSequence = 0;
let audioBuffer: string[] = [];
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY = 1000;

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function broadcastState(partial: Partial<SessionState>): void {
  sessionState = { ...sessionState, ...partial };

  // Broadcast to all extension views (popup, sidepanel)
  chrome.runtime.sendMessage({
    type: MSG.SESSION_STATE_UPDATE,
    payload: partial,
  }).catch(() => {
    // No listeners - that's fine (views may be closed)
  });

  // Persist to session storage
  saveSessionState(partial).catch(console.error);
}

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/* ─── Offscreen document management ───────────────────────────────────────── */

let offscreenCreated = false;

async function ensureOffscreenDocument(): Promise<void> {
  if (offscreenCreated) return;

  // Check if offscreen document already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });

  if (existingContexts.length > 0) {
    offscreenCreated = true;
    return;
  }

  await chrome.offscreen.createDocument({
    url: 'src/offscreen/index.html',
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: 'Audio capture for meeting transcription',
  });
  offscreenCreated = true;
}

async function closeOffscreenDocument(): Promise<void> {
  if (!offscreenCreated) return;
  try {
    await chrome.offscreen.closeDocument();
  } catch {
    // Document may already be closed
  }
  offscreenCreated = false;
}

/* ─── WebSocket connection ────────────────────────────────────────────────── */

function connectWebSocket(userSettings: UserSettings): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      ws = new WebSocket(userSettings.backendUrl);

      ws.onopen = () => {
        console.log('[service-worker] WebSocket connected');
        reconnectAttempts = 0;

        // Send start_session message
        const startMsg: ClientMessage = {
          type: 'start_session',
          payload: {
            language: userSettings.language,
            diarization: userSettings.diarizationEnabled,
            names: userSettings.names,
            provider: userSettings.transcriptionProvider,
          },
        };
        ws!.send(JSON.stringify(startMsg));

        // Flush any buffered audio
        if (audioBuffer.length > 0) {
          for (const chunk of audioBuffer) {
            sendAudioChunk(chunk);
          }
          audioBuffer = [];
        }

        resolve();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as ServerMessage;
          handleServerMessage(msg);
        } catch (err) {
          console.error('[service-worker] Failed to parse server message:', err);
        }
      };

      ws.onerror = (event) => {
        console.error('[service-worker] WebSocket error:', event);
      };

      ws.onclose = (event) => {
        console.log('[service-worker] WebSocket closed:', event.code, event.reason);
        ws = null;

        // Attempt reconnection if still recording
        if (
          sessionState.status === 'recording' ||
          sessionState.status === 'transcribing'
        ) {
          attemptReconnect();
        }
      };
    } catch (err) {
      reject(err);
    }
  });
}

function attemptReconnect(): void {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    broadcastState({
      status: 'error',
      error: 'Lost connection to backend after multiple retries',
    });
    return;
  }

  reconnectAttempts++;
  const delay = RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts - 1);
  console.log(`[service-worker] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);

  setTimeout(async () => {
    if (!settings) return;
    try {
      await connectWebSocket(settings);
    } catch {
      attemptReconnect();
    }
  }, delay);
}

function sendAudioChunk(base64Data: string): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    // Buffer audio during brief disconnects
    audioBuffer.push(base64Data);
    if (audioBuffer.length > 100) {
      audioBuffer.shift(); // Keep buffer bounded
    }
    return;
  }

  const msg: ClientMessage = {
    type: 'audio_data',
    payload: {
      data: base64Data,
      sequence: audioSequence++,
    },
  };
  ws.send(JSON.stringify(msg));
}

/* ─── Server message handlers ─────────────────────────────────────────────── */

function handleServerMessage(msg: ServerMessage): void {
  switch (msg.type) {
    case 'session_started': {
      broadcastState({
        status: 'recording',
        sessionId: msg.payload.sessionId,
      });
      break;
    }

    case 'transcript_partial': {
      const segment: TranscriptSegment = {
        id: msg.payload.id,
        text: msg.payload.text,
        speaker: msg.payload.speaker,
        timestamp: msg.payload.timestamp,
        isFinal: false,
      };
      // Update or add the partial segment
      const segments = [...sessionState.segments];
      const idx = segments.findIndex((s) => s.id === segment.id);
      if (idx >= 0) {
        segments[idx] = segment;
      } else {
        segments.push(segment);
      }
      broadcastState({ segments });
      break;
    }

    case 'transcript_final': {
      const segment: TranscriptSegment = {
        id: msg.payload.id,
        text: msg.payload.text,
        speaker: msg.payload.speaker,
        timestamp: msg.payload.timestamp,
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
      break;
    }

    case 'rolling_summary': {
      broadcastState({
        rollingSummary: {
          content: msg.payload.content,
          windowStart: msg.payload.windowStart,
          windowEnd: msg.payload.windowEnd,
          updatedAt: Date.now(),
        },
      });
      break;
    }

    case 'global_summary': {
      broadcastState({ globalSummary: msg.payload.content });
      break;
    }

    case 'mention_detected': {
      const mention = {
        name: msg.payload.name,
        context: msg.payload.context,
        timestamp: msg.payload.timestamp,
        sentiment: msg.payload.sentiment,
      };
      broadcastState({
        mentions: [...sessionState.mentions, mention],
      });
      break;
    }

    case 'error': {
      console.error('[service-worker] Server error:', msg.payload.message);
      broadcastState({
        status: 'error',
        error: msg.payload.message,
      });
      break;
    }
  }
}

/* ─── Recording lifecycle ─────────────────────────────────────────────────── */

async function startRecording(source: CaptureSource): Promise<void> {
  // Reset state
  audioSequence = 0;
  audioBuffer = [];
  reconnectAttempts = 0;

  settings = await getSettings();

  const sessionId = generateSessionId();
  broadcastState({
    status: 'connecting',
    sessionId,
    source,
    segments: [],
    rollingSummary: null,
    globalSummary: null,
    mentions: [],
    startedAt: Date.now(),
    error: null,
  });

  // Determine effective source
  const effectiveSource = source === 'auto' ? determineAutoSource(settings) : source;

  try {
    // Start audio capture
    switch (effectiveSource) {
      case 'mic-only': {
        await ensureOffscreenDocument();
        await startMicCapture();
        break;
      }
      case 'tab': {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab?.id) throw new Error('No active tab found');
        await ensureOffscreenDocument();
        await startTabCapture(activeTab.id);
        break;
      }
      case 'system+mic': {
        if (settings.nativeBridgePort) {
          nativeBridge = new NativeBridge();
          nativeBridge.onAudioFrame = (data: string) => sendAudioChunk(data);
          nativeBridge.onError = (err: string) => {
            broadcastState({ status: 'error', error: `Native bridge error: ${err}` });
          };
          await nativeBridge.connect(settings.nativeBridgePort);
          await nativeBridge.startCapture(1);
        } else {
          // Fallback to mic-only if no native bridge
          await ensureOffscreenDocument();
          await startMicCapture();
        }
        break;
      }
      default: {
        await ensureOffscreenDocument();
        await startMicCapture();
      }
    }

    // Connect to backend WebSocket
    await connectWebSocket(settings);

    broadcastState({ status: 'recording' });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to start recording';
    broadcastState({ status: 'error', error: errorMessage });
    await cleanupRecording();
    throw err;
  }
}

function determineAutoSource(userSettings: UserSettings): CaptureSource {
  if (userSettings.nativeBridgePort) return 'system+mic';
  return 'mic-only';
}

async function stopRecording(): Promise<void> {
  // Send stop_session to backend
  if (ws && ws.readyState === WebSocket.OPEN && sessionState.sessionId) {
    const stopMsg: ClientMessage = {
      type: 'stop_session',
      payload: { sessionId: sessionState.sessionId },
    };
    ws.send(JSON.stringify(stopMsg));
  }

  await cleanupRecording();

  broadcastState({ status: 'stopped' });
}

async function cleanupRecording(): Promise<void> {
  // Close WebSocket
  if (ws) {
    ws.onclose = null; // Prevent reconnect attempt
    ws.close();
    ws = null;
  }

  // Stop audio capture
  try {
    await stopCapture();
  } catch {
    // Ignore errors during cleanup
  }

  // Disconnect native bridge
  if (nativeBridge) {
    nativeBridge.disconnect();
    nativeBridge = null;
  }

  // Close offscreen document
  await closeOffscreenDocument();
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
        const source = (message.payload?.source as CaptureSource) ?? 'auto';
        startRecording(source)
          .then(() => sendResponse({ success: true }))
          .catch((err) =>
            sendResponse({ success: false, error: err instanceof Error ? err.message : 'Unknown error' })
          );
        return true; // Keep channel open for async response
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

      case MSG.OFFSCREEN_AUDIO_CHUNK: {
        const data = message.payload?.data as string | undefined;
        if (data) {
          sendAudioChunk(data);
        }
        return false;
      }

      default:
        return false;
    }
  }
);

/* ─── Restore state on service worker restart ─────────────────────────────── */

(async () => {
  try {
    const savedState = await getSessionState();
    if (savedState.status === 'recording' || savedState.status === 'transcribing') {
      // Service worker restarted mid-session - mark as error
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
    // First run or corrupted state - use defaults
    sessionState = { ...DEFAULT_SESSION_STATE };
  }
})();

/* ─── Side panel behavior ─────────────────────────────────────────────────── */

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error);
