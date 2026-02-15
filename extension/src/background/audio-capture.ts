// audio-capture.ts
// Manages audio capture by sending commands to the offscreen document.
// The offscreen document runs MediaRecorder / AudioContext in a regular
// DOM context (service workers cannot access getUserMedia or tabCapture streams).

import { MSG } from '../shared/protocol.ts';

/** Starts capturing microphone audio via the offscreen document. */
export async function startMicCapture(): Promise<void> {
  await chrome.runtime.sendMessage({
    type: MSG.OFFSCREEN_START_MIC,
    target: 'offscreen',
  });
}

/**
 * Starts capturing tab audio via the offscreen document.
 * Uses chrome.tabCapture.getMediaStreamId() to obtain a stream ID
 * that the offscreen document can use to capture the tab's audio.
 */
export async function startTabCapture(tabId: number): Promise<void> {
  // Get a media stream ID for the tab (must be called from the service worker).
  const streamId = await new Promise<string>((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(id);
    });
  });

  await chrome.runtime.sendMessage({
    type: MSG.OFFSCREEN_START_TAB,
    target: 'offscreen',
    payload: { streamId },
  });
}

/** Stops any active audio capture in the offscreen document. */
export async function stopCapture(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      type: MSG.OFFSCREEN_STOP,
      target: 'offscreen',
    });
  } catch {
    // Offscreen document may already be closed
  }
}
