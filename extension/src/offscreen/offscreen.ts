// offscreen.ts
// Runs inside the offscreen document to capture audio using Web APIs
// (getUserMedia for mic, navigator.mediaDevices for tab capture).
// Service workers cannot access these APIs directly, so the offscreen
// document handles capture and sends PCM16 base64 chunks back to the
// service worker via chrome.runtime.sendMessage.

import { MSG } from '../shared/protocol.ts';

const SAMPLE_RATE = 16000;
const BUFFER_SIZE = 4096; // Frames per processing chunk

let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let scriptProcessor: ScriptProcessorNode | null = null;

/**
 * Converts Float32 audio samples to base64-encoded Int16 PCM.
 */
function float32ToBase64Int16(float32Array: Float32Array): string {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  const bytes = new Uint8Array(int16Array.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Sets up the audio processing pipeline:
 * MediaStream -> AudioContext -> ScriptProcessor -> base64 chunks -> service worker
 */
function setupAudioPipeline(stream: MediaStream): void {
  mediaStream = stream;

  audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
  const source = audioContext.createMediaStreamSource(stream);

  // ScriptProcessorNode for raw PCM access (deprecated but widely supported;
  // AudioWorklet is not available in offscreen documents in all Chrome versions).
  scriptProcessor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

  scriptProcessor.onaudioprocess = (event) => {
    const inputData = event.inputBuffer.getChannelData(0);
    const base64Data = float32ToBase64Int16(inputData);

    // Send audio chunk to service worker
    chrome.runtime.sendMessage({
      type: MSG.OFFSCREEN_AUDIO_CHUNK,
      payload: { data: base64Data },
    }).catch(() => {
      // Service worker may not be listening
    });
  };

  source.connect(scriptProcessor);
  scriptProcessor.connect(audioContext.destination);
}

/**
 * Starts microphone capture using getUserMedia.
 */
async function startMicCapture(): Promise<void> {
  stopCapture();

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      sampleRate: SAMPLE_RATE,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });

  setupAudioPipeline(stream);
}

/**
 * Starts tab audio capture using a stream ID from the service worker.
 * The service worker obtains the streamId via chrome.tabCapture.getMediaStreamId().
 */
async function startTabCapture(streamId: string): Promise<void> {
  stopCapture();

  // Use the stream ID to get a MediaStream for the tab's audio.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    } as MediaStreamConstraints['audio'],
    video: false,
  });

  setupAudioPipeline(stream);
}

/**
 * Stops all active audio capture and cleans up resources.
 */
function stopCapture(): void {
  if (scriptProcessor) {
    scriptProcessor.disconnect();
    scriptProcessor = null;
  }

  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
}

/**
 * Listen for messages from the service worker.
 */
chrome.runtime.onMessage.addListener(
  (
    message: { type: string; target?: string; payload?: Record<string, unknown> },
    _sender,
    sendResponse,
  ) => {
    // Only handle messages targeted at the offscreen document
    if (message.target !== 'offscreen') return;

    switch (message.type) {
      case MSG.OFFSCREEN_START_MIC:
        startMicCapture()
          .then(() => sendResponse({ success: true }))
          .catch((err) =>
            sendResponse({ success: false, error: err instanceof Error ? err.message : 'Mic capture failed' }),
          );
        return true; // Keep channel open for async

      case MSG.OFFSCREEN_START_TAB: {
        const streamId = message.payload?.streamId as string;
        if (!streamId) {
          sendResponse({ success: false, error: 'No streamId provided' });
          return false;
        }
        startTabCapture(streamId)
          .then(() => sendResponse({ success: true }))
          .catch((err) =>
            sendResponse({ success: false, error: err instanceof Error ? err.message : 'Tab capture failed' }),
          );
        return true;
      }

      case MSG.OFFSCREEN_STOP:
        stopCapture();
        sendResponse({ success: true });
        return false;
    }
  },
);
