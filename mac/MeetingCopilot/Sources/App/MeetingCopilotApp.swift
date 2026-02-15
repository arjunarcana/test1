// MeetingCopilotApp.swift
// Main entry point for the Meeting Copilot macOS menu bar companion app.
// This app captures microphone and/or system audio and streams it via WebSocket
// to the Meeting Copilot Chrome extension for transcription.

import SwiftUI

@main
struct MeetingCopilotApp: App {
    /// Shared application state managing capture, WebSocket server, and permissions.
    @StateObject private var appState = AppState()

    var body: some Scene {
        // MenuBarExtra provides a menu bar presence without a dock icon (macOS 13+).
        MenuBarExtra {
            MenuBarView(appState: appState)
        } label: {
            // The menu bar icon changes color when recording.
            Image(systemName: "waveform.circle")
                .symbolRenderingMode(.palette)
                .foregroundStyle(appState.isCapturing ? .red : .primary)
        }
        .menuBarExtraStyle(.window)
    }
}
