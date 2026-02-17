/**
 * Offscreen document for SpeechRecognition.
 *
 * Chrome's webkitSpeechRecognition is unreliable in extension side panels
 * (no-speech timeouts, breaks after reload). Offscreen documents run in a
 * full renderer process with proper Web API support.
 *
 * Messages:
 *   service-worker → offscreen:  START_SPEECH  { lang }
 *   service-worker → offscreen:  STOP_SPEECH
 *   offscreen → service-worker:  SPEECH_RESULT  { id, text, timestamp, isFinal }
 *   offscreen → service-worker:  SPEECH_STATUS  { status, error? }
 */

/* ─── SpeechRecognition type shim (not in TS DOM lib) ─────────────────────── */

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  onaudiostart: (() => void) | null;
  start(): void;
  abort(): void;
}

interface SpeechResultItem {
  isFinal: boolean;
  0: { transcript: string };
}

interface SpeechResultEvent {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechResultItem };
}

/* ─── Setup ───────────────────────────────────────────────────────────────── */

const SpeechRecognitionCtor = (
  window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }
).webkitSpeechRecognition;

let recognition: SpeechRecognitionLike | null = null;
let shouldRestart = false;
let segCounter = 0;
// Keep the mic stream alive so SpeechRecognition can access the mic.
// Stopping the stream before SpeechRecognition starts leaves the mic in
// a dead state in Chrome extension contexts.
let micStream: MediaStream | null = null;

function send(type: string, payload: Record<string, unknown>) {
  chrome.runtime.sendMessage({ type, payload }).catch((err) => {
    console.warn('[offscreen] sendMessage failed:', err);
  });
}

function createRecognition(lang: string) {
  if (!shouldRestart || !SpeechRecognitionCtor) return;

  const rec = new SpeechRecognitionCtor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = lang;
  rec.maxAlternatives = 1;
  recognition = rec;

  rec.onaudiostart = () => {
    console.log('[offscreen] Audio capture started');
  };

  rec.onresult = (event: unknown) => {
    const e = event as SpeechResultEvent;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i];
      const text = result[0].transcript.trim();
      if (!text) continue;

      const isFinal = result.isFinal;
      const id = isFinal ? `seg_${++segCounter}` : `seg_${segCounter + 1}`;

      send('SPEECH_RESULT', { id, text, timestamp: Date.now(), isFinal });
    }
  };

  rec.onerror = (event: unknown) => {
    const e = event as { error: string };
    if (e.error === 'aborted') return;
    if (e.error === 'no-speech') {
      console.log('[offscreen] no-speech, restarting...');
      return;
    }
    console.error('[offscreen] Speech error:', e.error);
    send('SPEECH_STATUS', { status: 'error', error: `Speech error: ${e.error}` });
  };

  rec.onend = () => {
    recognition = null;
    if (shouldRestart) {
      setTimeout(() => createRecognition(lang), 100);
    }
  };

  try {
    rec.start();
    send('SPEECH_STATUS', { status: 'listening' });
  } catch (err) {
    console.error('[offscreen] Failed to start recognition:', err);
    send('SPEECH_STATUS', { status: 'error', error: 'Failed to start speech recognition' });
  }
}

async function startSpeech(lang: string) {
  // Keep mic stream alive — SpeechRecognition in extension contexts needs
  // an active getUserMedia stream to work reliably. Do NOT stop the tracks.
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    console.error('[offscreen] Mic access failed:', err);
    send('SPEECH_STATUS', {
      status: 'error',
      error: 'Microphone not accessible. Please grant permission and try again.',
    });
    return;
  }

  shouldRestart = true;
  segCounter = 0;
  createRecognition(lang);
}

function stopSpeech() {
  shouldRestart = false;
  if (recognition) {
    try { recognition.abort(); } catch { /* already stopped */ }
    recognition = null;
  }
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
}

chrome.runtime.onMessage.addListener((message: { type: string; payload?: Record<string, unknown> }) => {
  if (message.type === 'START_SPEECH') {
    startSpeech((message.payload?.lang as string) ?? 'en-US');
  } else if (message.type === 'STOP_SPEECH') {
    stopSpeech();
  }
});
