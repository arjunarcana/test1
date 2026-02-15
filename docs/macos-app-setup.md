# macOS Companion App Setup

The Meeting Copilot macOS companion is a menu bar utility that captures system audio and microphone input on macOS and streams it to the Chrome extension. It is required for transcribing desktop meeting applications (Zoom desktop, Slack desktop, Microsoft Teams desktop, etc.) that the Chrome extension cannot access directly.

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| **macOS** | 13.0+ (Ventura) | ScreenCaptureKit requires macOS 13 or later |
| **Xcode** | 15.0+ | Or the Xcode Command Line Tools with Swift 5.9+ |
| **Swift** | 5.9+ | Included with Xcode 15+ or installable via swift.org |

> **Note:** If you only need Swift Package Manager and the compiler (no Xcode IDE), you can install just the Command Line Tools:
> ```bash
> xcode-select --install
> ```

---

## Build

```bash
cd mac/MeetingCopilot
swift build
```

This resolves Swift package dependencies (SwiftNIO, WebSocketKit), compiles all source modules, and produces a debug binary.

For a release build with optimizations:

```bash
swift build -c release
```

The release binary is located at `.build/release/MeetingCopilot`.

### Build Output

```
.build/
  debug/
    MeetingCopilot           # Debug executable
  release/
    MeetingCopilot           # Release executable (after swift build -c release)
```

---

## Run

```bash
.build/debug/MeetingCopilot
```

Or for the release build:

```bash
.build/release/MeetingCopilot
```

The app launches as a **menu bar application** -- there is no Dock icon. Look for the waveform icon in your macOS menu bar (top-right area of the screen).

### What Happens on Launch

1. The app appears in the menu bar with a waveform circle icon
2. A local WebSocket server starts, binding to `127.0.0.1` on an available port
3. The port number is written to a known file path for the Chrome extension to discover
4. The app checks the current state of microphone and screen recording permissions
5. The menu bar popover shows the current status, capture mode selector, and permission badges

---

## Permissions Setup

The macOS companion requires two system permissions to function fully. These are managed through System Settings and are enforced by macOS at the OS level.

### Microphone Permission

**What it does:** Allows the app to capture audio from the built-in or connected microphone.

**When it is needed:** For "Microphone Only" and "Both" capture modes.

**How to grant:**

1. **On first use:** macOS will automatically prompt you with a dialog: "MeetingCopilot would like to access the microphone." Click **OK** or **Allow**.

2. **If you missed the prompt or denied it:**
   - Open **System Settings** (Apple menu > System Settings)
   - Navigate to **Privacy & Security** > **Microphone**
   - Find **MeetingCopilot** in the list
   - Toggle it **on**

> **Note:** If MeetingCopilot does not appear in the Microphone list, launch the app and attempt to start a capture in "Microphone Only" mode. This triggers macOS to register the app in the permission list.

### Screen Recording Permission

**What it does:** Allows the app to capture system audio using ScreenCaptureKit. Despite the name "Screen Recording," this permission is required by macOS for any app that uses ScreenCaptureKit, even if the app only captures audio and not video.

**When it is needed:** For "System Audio" and "Both" capture modes. This is the permission that enables capturing audio from desktop apps like Zoom, Slack, and Teams.

**How to grant:**

1. Open **System Settings** (Apple menu > System Settings)
2. Navigate to **Privacy & Security** > **Screen Recording**
3. Click the **+** button (you may need to authenticate with your password or Touch ID)
4. Navigate to the MeetingCopilot executable and add it, or find it in the list if it already appears
5. Toggle it **on**

> **Important: Screen Recording permission requires an app restart after granting.** macOS does not apply this permission to already-running processes. After toggling the permission on, you must quit and relaunch MeetingCopilot for the change to take effect.

### Permission Status in the App

The menu bar popover displays the current permission status with color-coded badges:

| Badge | Meaning |
|---|---|
| **Granted** (green) | Permission is active and working |
| **Denied** (red) | Permission was explicitly denied; must be granted in System Settings |
| **Not Set** (orange) | Permission has not been requested yet; will be prompted on first use |

If permissions are missing, the app shows a "Request Permissions" button that triggers the system prompt (for microphone) or opens System Settings (for screen recording).

---

## How It Works

### Menu Bar App

MeetingCopilot runs as a `MenuBarExtra` SwiftUI app. It has no Dock icon and no main window. The entire interface is a popover that appears when you click the menu bar icon.

The menu bar icon changes appearance based on state:
- **Idle:** Standard waveform icon in the default system color
- **Recording:** Waveform icon turns red

### Capture Modes

| Mode | Description | Permissions Required |
|---|---|---|
| **Microphone Only** | Captures audio from the system microphone only | Microphone |
| **System Audio** | Captures all system audio output using ScreenCaptureKit | Screen Recording |
| **Both** | Mixes microphone and system audio into a single stream | Microphone + Screen Recording |

The capture mode is selected in the menu bar popover before starting a capture. It cannot be changed while a capture is in progress.

### Audio Processing

1. Audio is captured from the selected source(s)
2. The raw audio is converted to PCM 16-bit signed integer format
3. The sample rate is resampled to 16kHz mono
4. Audio is chunked into frames of approximately 100ms
5. Each frame is base64-encoded and sent to connected clients via WebSocket

### Local WebSocket Bridge

The companion runs a WebSocket server that **binds exclusively to `127.0.0.1`** (localhost). This means:

- Only applications on the same machine can connect
- The server is not accessible from other devices on the network
- No authentication is required because access is limited to the local machine

The Chrome extension's service worker connects to this WebSocket to receive audio frames during system audio capture.

---

## Port Discovery

When the companion app starts, it:

1. Selects an available TCP port (or uses a default if available)
2. Starts the WebSocket server on that port
3. Writes the port number to a known file path:
   ```
   ~/Library/Application Support/MeetingCopilot/bridge-port
   ```

The Chrome extension reads this file (or receives the port through user configuration in the settings page) to know where to connect.

The port is also displayed in the menu bar popover under the "Port" label for manual configuration.

---

## Troubleshooting Permissions

### "System audio not captured" After Granting Screen Recording

**Cause:** macOS requires an app restart after granting Screen Recording permission.

**Fix:**
1. Quit MeetingCopilot (click "Quit Meeting Copilot" in the popover, or use Activity Monitor)
2. Relaunch the app
3. Verify the Screen Recording badge shows "Granted" in the popover

### App Does Not Appear in Screen Recording List

**Cause:** macOS only adds apps to the Screen Recording list after they attempt to use ScreenCaptureKit.

**Fix:**
1. Launch MeetingCopilot
2. Select "System Audio" or "Both" capture mode
3. Click "Start Capture" -- this will likely fail, but it registers the app with macOS
4. Open System Settings > Privacy & Security > Screen Recording
5. MeetingCopilot should now appear in the list
6. Toggle it on, then quit and relaunch the app

### Microphone Permission Denied After Clicking "Don't Allow"

**Cause:** Once denied through the system prompt, you must grant the permission manually.

**Fix:**
1. Open **System Settings** > **Privacy & Security** > **Microphone**
2. Find MeetingCopilot and toggle it on
3. The app does **not** need a restart for microphone permission changes (unlike Screen Recording)

### ScreenCaptureKit Errors on macOS < 13

**Cause:** ScreenCaptureKit was introduced in macOS 13 (Ventura). Older versions do not support it.

**Fix:** Upgrade to macOS 13 or later. There is no workaround for older macOS versions. You can still use "Microphone Only" mode without ScreenCaptureKit, but system audio capture is not available.

### "Connection Refused" from Chrome Extension

**Cause:** The extension is trying to connect to the companion's WebSocket, but the app is not running or the port is wrong.

**Fix:**
1. Verify MeetingCopilot is running (look for the waveform icon in the menu bar)
2. Check the port displayed in the popover
3. In the Chrome extension settings, verify the native bridge port matches
4. If the port file is stale, quit and relaunch the app

---

## Project Structure

```
mac/MeetingCopilot/
  Package.swift                    # Swift Package Manager manifest
  Sources/
    App/
      MeetingCopilotApp.swift      # @main entry point, MenuBarExtra scene
      MenuBarView.swift            # SwiftUI popover UI
    AudioCapture/                  # ScreenCaptureKit + AVAudioEngine wrappers
    Bridge/                        # Local WebSocket server
    Permissions/                   # macOS permission checking and requesting
```

### Dependencies (from Package.swift)

| Package | Version | Purpose |
|---|---|---|
| **swift-nio** | 2.50+ | Asynchronous networking foundation |
| **swift-nio-extras** | 1.19+ | Additional NIO utilities |
| **websocket-kit** | 2.14+ | WebSocket server implementation on top of SwiftNIO |

---

## Next Steps

- [Extension Setup](extension-setup.md) -- configure the Chrome extension to connect to the companion
- [Protocol](protocol.md) -- detailed message format for the local bridge WebSocket
- [Troubleshooting](troubleshooting.md) -- more troubleshooting scenarios
