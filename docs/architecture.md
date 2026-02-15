# Architecture

This document describes the overall architecture of Meeting Copilot, including all components, their responsibilities, data flow, and security boundaries.

---

## System Overview

```
+============================================================================+
|                              User's Machine                                |
|                                                                            |
|  +---------------------------+      +----------------------------------+   |
|  |    Chrome Extension       |      |       macOS Companion App        |   |
|  |  (Manifest V3)            |      |   (Swift + ScreenCaptureKit)     |   |
|  |                           |      |                                  |   |
|  |  +-------+ +----------+  |      |  +-------------+ +----------+   |   |
|  |  |Popup  | |Side Panel|  |      |  |AudioCapture | |Permissions|  |   |
|  |  +-------+ +----+-----+  |      |  |  Manager    | |  Manager  |  |   |
|  |                 |         |      |  +------+------+ +----------+   |   |
|  |  +---------+    |         |      |         |                       |   |
|  |  |Settings |    |         |      |  +------+------+                |   |
|  |  +---------+    |         |      |  | WebSocket   |                |   |
|  |                 |         |      |  | Bridge      |                |   |
|  |  +---------+ +--+------+  |      |  | Server      |                |   |
|  |  |Offscreen| |Service  |  |      |  +------+------+                |   |
|  |  |Document | |Worker   |  |      |         |                       |   |
|  |  |  (audio)| | (bg)    |  |      +---------+-----------------------+   |
|  |  +----+----+ +----+----+  |                 |                          |
|  |       |           |       |    ws://127.0.0.1:{port}                   |
|  |       +-----------+       |        (local bridge)                      |
|  |             |             |                 |                           |
|  +-------------+-------------+                 |                          |
|                |                               |                          |
|                +-------------------------------+                          |
|                |                                                          |
|        ws://localhost:3001/ws                                             |
|                |                                                          |
|  +-------------+------------------------------------------------------+  |
|  |                         Backend Server                              | |
|  |                    (Node.js + Fastify + Prisma)                     | |
|  |                                                                      | |
|  |  +----------+  +-------------+  +-----------+  +----------------+   | |
|  |  |WebSocket |  |Transcription|  |Summarize  |  | Session        |   | |
|  |  |Handler   |->|Service      |->|Service    |->| Manager (DB)   |   | |
|  |  +----------+  +------+------+  +-----+-----+  +-------+--------+   | |
|  |                       |               |                 |            | |
|  |                       v               v                 v            | |
|  |               +-------+---+   +-------+---+   +--------+--------+  | |
|  |               | Deepgram  |   |  OpenAI   |   |   PostgreSQL    |  | |
|  |               | (STT API) |   |  (GPT API)|   |   (via Prisma)  |  | |
|  |               +-----------+   +-----------+   +-----------------+  | |
|  +--------------------------------------------------------------------+ |
+============================================================================+
```

---

## Component Descriptions

### Chrome Extension (`/extension`)

**Technology:** React 18, TypeScript, Vite 5, CRXJS, Chrome Manifest V3

The extension is the primary user interface. It is responsible for:

| Module | Responsibility |
|---|---|
| **Service Worker** (`background/`) | Lifecycle management, message routing between extension components, WebSocket connection to the backend |
| **Offscreen Document** (`offscreen/`) | Audio capture using `tabCapture` or `getUserMedia` (microphone). The offscreen document runs in a hidden page and has access to Web Audio APIs that service workers lack |
| **Side Panel** (`sidepanel/`) | Main UI: live transcript feed, rolling summary, global summary, mention alerts, session controls |
| **Popup** (`popup/`) | Quick status display and recording toggle |
| **Settings** (`settings/`) | Configuration: backend URL, names to watch, language, transcription provider, retention settings |
| **Shared** (`shared/`) | Protocol type definitions, storage helpers, and common types used across all extension modules |

**Permissions requested:**

| Permission | Purpose |
|---|---|
| `tabCapture` | Capture audio from the active browser tab (e.g., Google Meet) |
| `offscreen` | Create an offscreen document for audio processing |
| `sidePanel` | Render the persistent side panel UI |
| `storage` | Persist user settings and session state locally |

### Backend Server (`/server`)

**Technology:** Node.js 20, Fastify 4, Prisma 5, PostgreSQL 16, Pino logging

The backend is the processing hub. It receives raw audio, delegates to third-party AI services, and streams results back to the extension.

| Module | Responsibility |
|---|---|
| **WebSocket Handler** (`websocket/`) | Manages bidirectional communication with the extension; routes audio to transcription, receives results |
| **Transcription Service** (`services/transcription/`) | Adapts between providers (Deepgram for production, mock for development) |
| **Summarization Service** (`services/summarization/`) | Generates rolling 5-minute and global summaries using OpenAI GPT |
| **Session Manager** (`services/session-manager.ts`) | CRUD operations for sessions, transcript segments, summaries, and mentions |
| **Encryption** (`services/encryption.ts`) | AES-256-GCM encryption/decryption for transcript text at rest |
| **Auth Middleware** (`middleware/auth.ts`) | JWT verification; attaches `userId` to authenticated requests |
| **REST Routes** (`routes/`) | HTTP API for auth, session listing/detail/deletion, transcript retrieval, and session export |
| **Database** (`db/`) | Prisma client singleton and connection management |

**Database schema (PostgreSQL):**

```
users ──< sessions ──< transcript_segments
                   ──< summaries
                   ──< mentions
```

All child tables cascade-delete when a session is deleted.

### macOS Companion App (`/mac/MeetingCopilot`)

**Technology:** Swift 5.9, SwiftUI, ScreenCaptureKit, SwiftNIO, WebSocketKit

The companion app is a menu bar utility that captures system audio and/or microphone audio on macOS and streams it to the Chrome extension.

| Module | Responsibility |
|---|---|
| **App** (`Sources/App/`) | SwiftUI app entry point with `MenuBarExtra`; no dock icon |
| **AudioCapture** (`Sources/AudioCapture/`) | ScreenCaptureKit integration for system audio; AVAudioEngine for microphone |
| **Bridge** (`Sources/Bridge/`) | Local WebSocket server (binds to `127.0.0.1`) that the Chrome extension connects to |
| **Permissions** (`Sources/Permissions/`) | Checks and requests macOS permissions (microphone, screen recording) |

**Capture modes:**

| Mode | Audio Source | macOS Permission Required |
|---|---|---|
| Microphone Only | AVAudioEngine via mic input | Microphone |
| System Audio | ScreenCaptureKit | Screen Recording |
| Both | Mixed mic + system audio | Microphone + Screen Recording |

---

## Audio Capture Flows

### Mode 1: Mic-Only (any platform)

```
Microphone
    |
    v
Offscreen Document (getUserMedia)
    |
    v
PCM16 @ 16kHz mono, chunked to ~100ms
    |
    v
Service Worker (via chrome.runtime message)
    |
    v
WebSocket to Backend (audio_data messages)
    |
    v
Transcription Service (Deepgram / mock)
```

No native app required. Works on any OS that Chrome supports.

### Mode 2: Tab Capture (browser-based meetings)

```
Browser Tab (e.g., Google Meet)
    |
    v
chrome.tabCapture.capture()
    |
    v
Offscreen Document (processes MediaStream)
    |
    v
PCM16 @ 16kHz mono, chunked to ~100ms
    |
    v
Service Worker
    |
    v
WebSocket to Backend
    |
    v
Transcription Service
```

Captures all audio playing in the active tab. The user sees Chrome's tab-sharing indicator.

### Mode 3: System + Mic via Native Companion (desktop apps on macOS)

```
Desktop App (Zoom, Slack, etc.)              Microphone
    |                                            |
    v                                            v
ScreenCaptureKit                            AVAudioEngine
    |                                            |
    +--------------------+------------------------+
                         |
                         v
                macOS Companion App
                  (mix + resample)
                         |
                         v
               Local WebSocket Bridge
           ws://127.0.0.1:{port}
                         |
                         v
               Chrome Extension
              (Service Worker)
                         |
                         v
              WebSocket to Backend
                         |
                         v
             Transcription Service
```

System audio is captured via ScreenCaptureKit (requires Screen Recording permission). The companion mixes system and mic audio, converts to PCM16 at 16kHz mono, and streams it to the extension over a localhost-only WebSocket.

---

## WebSocket Connection Topology

```
+-------------------+
| Chrome Extension  |
| (Service Worker)  |
+--------+----------+
         |
         |  (1) ws://localhost:3001/ws
         |      Authenticated via JWT
         |      Carries: audio, control, transcripts, summaries
         |
+--------+----------+
|   Backend Server   |
+--------------------+

+-------------------+
| Chrome Extension  |
| (Service Worker)  |
+--------+----------+
         |
         |  (2) ws://127.0.0.1:{port}
         |      No authentication (localhost-only)
         |      Carries: audio frames, capture control, status
         |
+--------+----------+
| macOS Companion   |
+-------------------+
```

**Connection (1)** is always active during a recording session. The extension authenticates with a JWT token in the first `start_session` message.

**Connection (2)** is only used when the macOS companion is running and the user selects system audio capture. The port is discovered via a known file path written by the companion on startup.

---

## Data Flow: Audio to UI

```
1. Audio Capture
   Browser tab / microphone / system audio
        |
        v
2. Encoding
   Raw PCM audio -> base64-encoded chunks (~100ms each)
        |
        v
3. Transport
   WebSocket message: { type: "audio_data", data: "<base64>", ... }
        |
        v
4. Transcription (Backend)
   Deepgram streaming API or mock provider
   Returns partial and final transcript segments
        |
        v
5. Persistence (Backend)
   Final segments saved to PostgreSQL (encrypted if ENCRYPTION_KEY set)
        |
        v
6. Summarization (Backend, async)
   Every ~5 min: rolling summary via OpenAI
   On stop: global summary via OpenAI
        |
        v
7. Mention Detection (Backend)
   Scan final segments for configured names
   Compute sentiment of surrounding context
        |
        v
8. Delivery to Extension
   WebSocket messages: transcript_partial, transcript_final,
   rolling_summary, global_summary, mention_detected
        |
        v
9. UI Rendering (Extension Side Panel)
   Live transcript feed, summary cards, mention alerts
```

---

## Security Boundaries

### What Runs Locally

| Component | Network Access | Data Stored Locally |
|---|---|---|
| Chrome Extension | Connects to backend (localhost or remote) and optionally to macOS companion (localhost) | User settings in `chrome.storage.local`; session state in `chrome.storage.session` (cleared on browser restart) |
| macOS Companion | Listens on `127.0.0.1` only; no outbound connections | Port file at a known path; no audio stored |
| PostgreSQL | Listens on `localhost:5432` by default | All session data: users, sessions, segments, summaries, mentions |

### What Communicates Externally

| Service | Data Sent | Purpose |
|---|---|---|
| **Deepgram** | Raw audio stream (PCM16) | Speech-to-text transcription |
| **OpenAI** | Transcript text | Summarization and mention sentiment analysis |

> **Note:** In demo mode (`TRANSCRIPTION_PROVIDER=mock`), no data leaves the local machine. Both Deepgram and OpenAI are only contacted when their respective API keys are configured and enabled.

### Authentication Boundaries

- **Extension to Backend:** JWT tokens (7-day expiry) issued by the backend's `/auth/register` or `/auth/login` endpoints. Tokens are stored in the extension's `chrome.storage.local`.
- **Extension to macOS Companion:** No authentication. The bridge binds exclusively to `127.0.0.1`, making it inaccessible from the network. Only processes on the same machine can connect.
- **Backend REST API:** All routes except `/health` and `/auth/*` require a valid JWT in the `Authorization: Bearer <token>` header.
- **Backend WebSocket:** JWT is sent in the first `start_session` message's `token` field.
