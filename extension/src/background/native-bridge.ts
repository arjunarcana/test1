// native-bridge.ts
// Connects to the macOS companion app's local WebSocket server for system
// audio capture. The companion app captures system audio via ScreenCaptureKit
// and streams base64-encoded PCM16 frames over WebSocket.

import type {
  BridgeServerMessage,
  BridgeClientMessage,
} from '../shared/protocol.ts';

export class NativeBridge {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /** Called when the bridge receives an audio frame from the native app. */
  onAudioFrame: ((base64Data: string) => void) | null = null;

  /** Called when the bridge encounters an error. */
  onError: ((message: string) => void) | null = null;

  /**
   * Connects to the macOS companion app's WebSocket server.
   * @param port The port the native app is listening on.
   */
  async connect(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(`ws://127.0.0.1:${port}`);

        this.ws.onopen = () => {
          console.log('[NativeBridge] Connected to native app on port', port);
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data) as BridgeServerMessage;
            this.handleMessage(msg);
          } catch (err) {
            console.error('[NativeBridge] Failed to parse message:', err);
          }
        };

        this.ws.onerror = () => {
          const err = 'WebSocket connection to native app failed';
          console.error('[NativeBridge]', err);
          this.onError?.(err);
        };

        this.ws.onclose = () => {
          console.log('[NativeBridge] Disconnected from native app');
          this.ws = null;
        };

        // Reject if connection doesn't open within 5 seconds.
        setTimeout(() => {
          if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
            this.ws.close();
            reject(new Error('Connection to native bridge timed out'));
          }
        }, 5000);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Sends a start_capture command to the native app.
   * @param channels Number of audio channels (1 = mono).
   */
  async startCapture(channels: number): Promise<void> {
    this.send({
      type: 'start_capture',
      payload: {
        channels,
        sampleRate: 16000,
      },
    });
  }

  /** Sends a stop_capture command to the native app. */
  async stopCapture(): Promise<void> {
    this.send({ type: 'stop_capture' });
  }

  /** Disconnects from the native app. */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnect
      this.ws.close();
      this.ws = null;
    }
  }

  private send(msg: BridgeClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[NativeBridge] Cannot send - not connected');
      return;
    }
    this.ws.send(JSON.stringify(msg));
  }

  private handleMessage(msg: BridgeServerMessage): void {
    switch (msg.type) {
      case 'audio_frame':
        this.onAudioFrame?.(msg.payload.data);
        break;

      case 'status':
        console.log('[NativeBridge] Status:', msg.payload);
        break;

      case 'error':
        console.error('[NativeBridge] Error from native app:', msg.payload.message);
        this.onError?.(msg.payload.message);
        break;

      case 'permission_required':
        console.warn('[NativeBridge] Permission required:', msg.payload.permission);
        this.onError?.(`macOS permission required: ${msg.payload.permission}. Please grant access in System Settings.`);
        break;
    }
  }
}
