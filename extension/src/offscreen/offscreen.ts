// offscreen.ts
// Runs inside the offscreen document to transcribe speech using the
// Web Speech API (SpeechRecognition). This removes the need for a
// backend server — all transcription happens in the browser via
// Chrome's built-in speech recognition.

import { MSG } from '../shared/protocol.ts';

/* ─── SpeechRecognition types (Chrome uses webkit prefix) ──────────────── */

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}

const SpeechRecognitionCtor = (
  globalThis as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }
).webkitSpeechRecognition;

let recognition: SpeechRecognitionLike | null = null;
let segmentCounter = 0;
let shouldRestart = false;
let currentLanguage = 'en-US';

/**
 * Starts speech recognition for microphone input.
 * SpeechRecognition captures audio from the default mic internally —
 * no need for getUserMedia or manual audio processing.
 */
function startSpeechRecognition(language: string): void {
  if (!SpeechRecognitionCtor) {
    chrome.runtime.sendMessage({
      type: MSG.OFFSCREEN_SPEECH_ERROR,
      payload: { error: 'Speech recognition is not supported in this browser.' },
    }).catch(() => {});
    return;
  }

  stopSpeechRecognition();

  currentLanguage = language;
  segmentCounter = 0;
  shouldRestart = true;

  createAndStartRecognition();
}

function createAndStartRecognition(): void {
  if (!SpeechRecognitionCtor || !shouldRestart) return;

  recognition = new SpeechRecognitionCtor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = currentLanguage;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event: unknown) => {
    const e = event as { resultIndex: number; results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } } };
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i];
      const text = result[0].transcript.trim();
      if (!text) continue;

      if (result.isFinal) {
        segmentCounter++;
        chrome.runtime.sendMessage({
          type: MSG.OFFSCREEN_TRANSCRIPT_FINAL,
          payload: {
            id: `seg_${segmentCounter}`,
            text,
            timestamp: Date.now(),
          },
        }).catch(() => {});
      } else {
        chrome.runtime.sendMessage({
          type: MSG.OFFSCREEN_TRANSCRIPT_PARTIAL,
          payload: {
            id: `seg_${segmentCounter + 1}`,
            text,
            timestamp: Date.now(),
          },
        }).catch(() => {});
      }
    }
  };

  recognition.onerror = (event: unknown) => {
    const e = event as { error: string };
    // 'no-speech' is normal — just means silence, keep going
    if (e.error === 'no-speech') return;
    // 'aborted' happens when we intentionally stop
    if (e.error === 'aborted') return;

    console.error('[offscreen] Speech recognition error:', e.error);
    chrome.runtime.sendMessage({
      type: MSG.OFFSCREEN_SPEECH_ERROR,
      payload: { error: `Speech recognition error: ${e.error}` },
    }).catch(() => {});
  };

  recognition.onend = () => {
    // Auto-restart if we should still be recording
    // (SpeechRecognition stops automatically after silence or time limits)
    if (shouldRestart) {
      setTimeout(() => createAndStartRecognition(), 100);
    }
  };

  try {
    recognition.start();
  } catch (err) {
    console.error('[offscreen] Failed to start recognition:', err);
  }
}

/**
 * Stops speech recognition.
 */
function stopSpeechRecognition(): void {
  shouldRestart = false;
  if (recognition) {
    try {
      recognition.abort();
    } catch {
      // Already stopped
    }
    recognition = null;
  }
}

/* ─── Message listener ─────────────────────────────────────────────────── */

chrome.runtime.onMessage.addListener(
  (
    message: { type: string; target?: string; payload?: Record<string, unknown> },
    _sender,
    sendResponse,
  ) => {
    // Only handle messages targeted at the offscreen document
    if (message.target !== 'offscreen') return;

    switch (message.type) {
      case MSG.OFFSCREEN_START_MIC: {
        const language = (message.payload?.language as string) ?? 'en-US';
        startSpeechRecognition(language);
        sendResponse({ success: true });
        return false;
      }

      case MSG.OFFSCREEN_STOP:
        stopSpeechRecognition();
        sendResponse({ success: true });
        return false;
    }
  },
);
