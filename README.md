# Meeting Copilot

Live transcription, rolling summaries, and name-mention alerts for any meeting -- whether it's in a browser tab or a desktop app.

---

## Architecture

```
+---------------------+         WebSocket (ws://localhost:3001/ws)         +---------------------+
|                     | <-----------------------------------------------------> |                     |
|  Chrome Extension   |         JSON messages: audio, transcripts,         |   Backend Server    |
|  (React + Vite)     |         summaries, mentions, control signals       |   (Fastify + Prisma)|
|                     | <-----------------------------------------------------> |                     |
+--------+------------+                                                    +----------+----------+
         |                                                                            |
         |  Local WebSocket                                                           |
         |  ws://127.0.0.1:{port}                                           +---------+---------+
         |                                                                  |                   |
+--------+------------+                                                     |   PostgreSQL DB   |
|                     |                                                     |                   |
|  macOS Companion    |                                                     +-------------------+
|  (Swift + SwiftUI)  |
|  ScreenCaptureKit   |                                                     +-------------------+
|                     |                                                     |  Deepgram (STT)   |
+---------------------+                                                     |  OpenAI (summary) |
                                                                            +-------------------+
```

**Data flows left-to-right:** The Chrome extension captures audio (from a browser tab or via the macOS companion), streams it to the backend, and receives transcripts and summaries in real time. The backend delegates speech-to-text to Deepgram and summarization to OpenAI, persisting everything in PostgreSQL.

---

## Key Features

- **Live transcription** -- real-time speech-to-text powered by Deepgram, streamed back to the extension over WebSocket.
- **Rolling 5-minute summary** -- a continuously updated digest of the last five minutes of conversation.
- **Global summary** -- a full-session summary generated on demand or when the session ends.
- **Name mention detection** -- configure names to watch and receive instant alerts with surrounding context and sentiment.
- **Google Meet (tab capture)** -- capture audio directly from a Chrome tab using the `tabCapture` API. No extra software needed.
- **Zoom / Slack desktop (via macOS companion)** -- capture system audio from desktop apps through the native ScreenCaptureKit companion.
- **Mic-only mode** -- use only the microphone for environments where tab or system capture is not available or not desired.
- **Demo mode** -- run the entire stack with mock transcription and no API keys for development and evaluation.

---

## Reality Check

> **A Chrome extension alone CANNOT capture desktop app audio on macOS.**
>
> Chrome's `tabCapture` API can only capture audio from browser tabs. If your meeting runs in a desktop application (Zoom desktop, Slack desktop, Microsoft Teams desktop, etc.), the Chrome extension has no way to access that audio stream.
>
> This is an OS-level limitation, not a bug. To capture audio from desktop apps on macOS, you **must** run the native macOS companion app, which uses Apple's ScreenCaptureKit framework (macOS 13+) to capture system audio. The companion streams the captured audio to the Chrome extension over a local-only WebSocket.
>
> **Bottom line:** Browser tab meetings (Google Meet, Zoom web) work with the extension alone. Desktop app meetings require the macOS companion.

---

## Quick Start

### 1. Backend Server

```bash
cd server
cp .env.example .env          # Uses mock transcription by default
docker-compose up -d           # Starts PostgreSQL + server
```

See [docs/backend-setup.md](docs/backend-setup.md) for manual setup, environment variables, and production configuration.

### 2. Chrome Extension

```bash
cd extension
npm install
npm run build                  # Produces dist/
```

Then load the unpacked extension in Chrome:

1. Navigate to `chrome://extensions`
2. Enable **Developer Mode**
3. Click **Load unpacked** and select the `extension/dist` directory

See [docs/extension-setup.md](docs/extension-setup.md) for development workflow, demo mode, and permissions details.

### 3. macOS Companion App (optional)

```bash
cd mac/MeetingCopilot
swift build
.build/debug/MeetingCopilot
```

Grant Microphone and Screen Recording permissions when prompted. See [docs/macos-app-setup.md](docs/macos-app-setup.md) for the full permissions guide.

---

## Tech Stack

| Component | Technologies |
|---|---|
| **Chrome Extension** | React 18, TypeScript, Vite 5, CRXJS, Chrome Manifest V3 |
| **Backend Server** | Node.js 20, Fastify 4, Prisma 5, PostgreSQL 16, Pino |
| **macOS Companion** | Swift 5.9, SwiftUI, ScreenCaptureKit, SwiftNIO, WebSocketKit |
| **Speech-to-Text** | Deepgram (production), Mock provider (development) |
| **Summarization** | OpenAI GPT (production), graceful degradation without key |
| **Encryption** | AES-256-GCM for transcripts at rest |

---

## MVP Path

The fastest way to see Meeting Copilot in action:

1. **Start the backend in demo mode** -- `docker-compose up` with default `.env` settings. The mock transcription provider generates simulated transcripts with no API keys required.
2. **Load the extension** -- build and load the unpacked extension. Open the side panel on any tab.
3. **Start a session** -- click "Start Recording" in the side panel. You will see mock transcripts flowing in real time.
4. **Add real transcription** -- set `TRANSCRIPTION_PROVIDER=deepgram` and provide your `DEEPGRAM_API_KEY` to switch to live speech-to-text.
5. **Add summarization** -- provide your `OPENAI_API_KEY` to enable rolling and global summaries.
6. **Add the macOS companion** -- build and run the native app to capture desktop meeting audio.

---

## Documentation

Detailed guides are available in the [`/docs`](docs/) directory:

| Document | Description |
|---|---|
| [Architecture](docs/architecture.md) | Component design, data flow, and security boundaries |
| [Extension Setup](docs/extension-setup.md) | Build, install, develop, and test the Chrome extension |
| [Backend Setup](docs/backend-setup.md) | Server installation, Docker, environment variables, API reference |
| [macOS App Setup](docs/macos-app-setup.md) | Build, run, and configure permissions for the native companion |
| [Protocol](docs/protocol.md) | WebSocket message formats for all communication channels |
| [Threat Model](docs/threat-model.md) | Security analysis, privacy statement, and data handling |
| [Troubleshooting](docs/troubleshooting.md) | Common issues and their solutions |

---

## License

This project is licensed under the [MIT License](LICENSE).

```
MIT License

Copyright (c) 2024 Meeting Copilot Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
