# Chrome Extension Setup

This guide covers building, installing, developing, and testing the Meeting Copilot Chrome extension.

---

## Prerequisites

| Requirement | Version |
|---|---|
| **Node.js** | 18+ (20 recommended) |
| **npm** | 9+ (comes with Node.js) |
| **Google Chrome** | 116+ (for Manifest V3 side panel support) |

---

## Install Dependencies

```bash
cd extension
npm install
```

This installs React, Vite, CRXJS, TypeScript, and all other dependencies defined in `package.json`.

---

## Build for Production

```bash
npm run build
```

This runs the TypeScript compiler (`tsc`) followed by Vite's production build. The output is written to `extension/dist/`.

The `dist/` directory contains the fully compiled extension ready to be loaded into Chrome:

```
dist/
  manifest.json          # Generated MV3 manifest
  src/
    popup/index.html     # Popup UI
    sidepanel/index.html # Side panel UI
    settings/index.html  # Options page
    offscreen/index.html # Offscreen document (audio capture)
    background/          # Service worker
  assets/                # Bundled JS/CSS
```

---

## Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer Mode** using the toggle in the top-right corner
3. Click **Load unpacked**
4. Select the `extension/dist` directory (not the `extension` directory itself)
5. The extension icon should appear in your Chrome toolbar

> **Note:** If you do not see the extension icon, click the puzzle piece icon in the toolbar and pin "Meeting Copilot."

After loading, you can:

- **Click the extension icon** to open the popup (quick status and recording toggle)
- **Open the side panel** by right-clicking the extension icon and selecting "Open Side Panel," or by clicking the side panel button if available in your Chrome version
- **Access settings** by right-clicking the extension icon and selecting "Options"

---

## Development (Watch Mode)

For active development with automatic rebuilding:

```bash
npm run dev
```

This runs `vite build --watch`, which watches for file changes and incrementally rebuilds. After each rebuild, go to `chrome://extensions` and click the reload button on the Meeting Copilot card (or press Ctrl+Shift+R on the extensions page).

> **Note:** CRXJS provides hot module replacement (HMR) for popup, side panel, and options pages during development. However, the service worker requires a manual reload after changes.

### Development Workflow

1. Start the backend server (see [backend-setup.md](backend-setup.md))
2. Run `npm run dev` in the extension directory
3. Load the unpacked extension from `dist/`
4. Make code changes -- Vite rebuilds automatically
5. Reload the extension in `chrome://extensions` to pick up changes
6. Check the service worker console for background script logs (click "Service Worker" link on the extension card)

---

## Testing with Demo Mode

You can test the extension without any API keys or external services by using demo mode:

1. **Start the backend with mock transcription:**
   ```bash
   cd server
   cp .env.example .env        # TRANSCRIPTION_PROVIDER=mock is the default
   docker-compose up -d
   ```

2. **Configure the extension to use mock provider:**
   - Open the extension settings (right-click icon, select "Options")
   - Set **Backend URL** to `ws://localhost:3001`
   - Set **Transcription Provider** to `mock`

3. **Start a session:**
   - Open the side panel
   - Click "Start Recording"
   - The mock provider will generate simulated transcripts without needing real audio input

Demo mode is useful for:
- Developing and testing UI components
- Verifying WebSocket communication
- Testing the session lifecycle (start, transcript flow, stop, export)
- Evaluating the extension before committing to API subscriptions

---

## Extension Permissions

The extension requests the following Chrome permissions, declared in `manifest.json`:

| Permission | Why It Is Needed |
|---|---|
| `tabCapture` | Captures the audio stream from the active browser tab. This is how Meeting Copilot records audio from web-based meetings like Google Meet. Chrome shows a tab-sharing indicator to the user while this is active. |
| `offscreen` | Creates an offscreen document -- a hidden page that can use Web Audio APIs (AudioContext, MediaRecorder, etc.). Service workers in MV3 cannot directly access these APIs, so audio processing happens in the offscreen document. |
| `sidePanel` | Registers a side panel that persists alongside the web page. The side panel displays the live transcript, summaries, and mention alerts. |
| `storage` | Stores user settings (backend URL, watched names, language preferences) and transient session state in Chrome's local and session storage. |

### What the Extension Does NOT Request

- **No `tabs` permission** -- the extension does not read your browsing history or tab URLs
- **No `host_permissions`** -- the extension does not inject scripts into web pages
- **No `activeTab`** -- the extension does not access page content
- **No network permissions beyond WebSocket** -- all server communication goes through WebSocket to the configured backend URL

---

## Chrome Web Store Policy Notes

If you plan to publish this extension to the Chrome Web Store, be aware of the following policies:

### Recording Indicator
Chrome automatically shows a recording indicator (a blue dot or banner) when `tabCapture` is active. This is enforced by the browser and cannot be suppressed. This satisfies Chrome's requirement that users are aware when audio is being captured.

### User Consent
The extension requires the user to explicitly click "Start Recording" to begin any audio capture. There is no background or automatic recording. The side panel clearly displays when recording is in progress.

### Privacy Disclosures
When submitting to the Chrome Web Store, you must disclose:
- That audio data is captured and sent to a backend server
- That third-party services (Deepgram, OpenAI) may process the data
- What data is stored and for how long
- That users can delete their data

### Single Purpose
The extension's single purpose is meeting transcription and summarization. All features relate to this core function.

---

## Project Structure

```
extension/
  manifest.json              # Chrome MV3 manifest
  package.json               # Dependencies and scripts
  tsconfig.json              # TypeScript configuration
  vite.config.ts             # Vite + CRXJS build configuration
  public/                    # Static assets (icons, etc.)
  src/
    background/              # Service worker (message routing, WebSocket management)
    offscreen/               # Offscreen document (audio capture and processing)
    popup/                   # Popup UI (quick status and controls)
      index.html
      index.tsx
    sidepanel/               # Side panel UI (transcript, summaries, mentions)
    settings/                # Options page (configuration)
    shared/                  # Shared code used across all modules
      protocol.ts            # WebSocket message type definitions
      storage.ts             # chrome.storage helpers
      types.ts               # Common TypeScript types
```

---

## Next Steps

- [Backend Setup](backend-setup.md) -- set up the server that processes audio and manages sessions
- [macOS App Setup](macos-app-setup.md) -- install the companion app for desktop meeting capture
- [Protocol](protocol.md) -- understand the WebSocket message formats
- [Troubleshooting](troubleshooting.md) -- common issues and solutions
