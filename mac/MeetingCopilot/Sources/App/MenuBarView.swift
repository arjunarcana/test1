// MenuBarView.swift
// SwiftUI view rendered inside the menu bar popover.
// Provides controls for audio capture, status display, and permission management.

import SwiftUI
import AppKit

struct MenuBarView: View {
    @ObservedObject var appState: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // ── Title ──
            Text("Meeting Copilot")
                .font(.headline)
                .frame(maxWidth: .infinity, alignment: .center)

            Divider()

            // ── Status Indicator ──
            HStack(spacing: 8) {
                Circle()
                    .fill(statusColor)
                    .frame(width: 10, height: 10)
                Text(statusText)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }

            // ── Error Message ──
            if let error = appState.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
                    .lineLimit(3)
            }

            Divider()

            // ── Capture Mode Picker ──
            VStack(alignment: .leading, spacing: 4) {
                Text("Capture Mode")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Picker("", selection: $appState.captureMode) {
                    Text("Microphone Only").tag(CaptureMode.microphoneOnly)
                    Text("System Audio").tag(CaptureMode.systemAudio)
                    Text("Both").tag(CaptureMode.both)
                }
                .pickerStyle(.segmented)
                .disabled(appState.isCapturing)
            }

            // ── Start / Stop Button ──
            Button(action: {
                if appState.isCapturing {
                    appState.stopCapture()
                } else {
                    appState.startCapture()
                }
            }) {
                HStack {
                    Image(systemName: appState.isCapturing ? "stop.circle.fill" : "play.circle.fill")
                    Text(appState.isCapturing ? "Stop Capture" : "Start Capture")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(appState.isCapturing ? .red : .green)
            .controlSize(.large)

            Divider()

            // ── Connected Clients ──
            HStack {
                Image(systemName: "network")
                Text("Connected Clients:")
                Spacer()
                Text("\(appState.connectedClients)")
                    .fontWeight(.medium)
            }
            .font(.subheadline)

            // ── Port Display ──
            HStack {
                Image(systemName: "antenna.radiowaves.left.and.right")
                Text("Port:")
                Spacer()
                Text("\(appState.port)")
                    .fontWeight(.medium)
                    .font(.system(.subheadline, design: .monospaced))
            }
            .font(.subheadline)

            Divider()

            // ── Permissions Section ──
            VStack(alignment: .leading, spacing: 6) {
                Text("Permissions")
                    .font(.caption)
                    .foregroundColor(.secondary)

                HStack {
                    Image(systemName: "mic.fill")
                    Text("Microphone")
                    Spacer()
                    PermissionBadge(state: appState.micPermission)
                    if appState.micPermission == .denied {
                        Button("Open Settings") { appState.openMicSettings() }
                            .font(.caption2)
                            .buttonStyle(.borderless)
                    }
                }
                .font(.subheadline)

                HStack {
                    Image(systemName: "rectangle.dashed.badge.record")
                    Text("Screen Recording")
                    Spacer()
                    PermissionBadge(state: appState.screenPermission)
                    if appState.screenPermission == .denied {
                        Button("Open Settings") { appState.openScreenSettings() }
                            .font(.caption2)
                            .buttonStyle(.borderless)
                    }
                }
                .font(.subheadline)

                if appState.micPermission != .granted || appState.screenPermission != .granted {
                    Button("Request Permissions") {
                        appState.requestPermissions()
                    }
                    .font(.subheadline)
                    .frame(maxWidth: .infinity)
                    .buttonStyle(.bordered)
                }
            }

            Divider()

            // ── Quit Button ──
            Button(action: {
                appState.stopCapture()
                NSApplication.shared.terminate(nil)
            }) {
                HStack {
                    Image(systemName: "power")
                    Text("Quit Meeting Copilot")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
        }
        .padding(16)
        .frame(width: 300)
    }

    // MARK: - Computed Properties

    private var statusText: String {
        if appState.errorMessage != nil {
            return "Error"
        }
        return appState.isCapturing ? "Recording" : "Idle"
    }

    private var statusColor: Color {
        if appState.errorMessage != nil {
            return .red
        }
        return appState.isCapturing ? .red : .gray
    }
}

// MARK: - Permission Badge

/// Small badge showing whether a permission is granted, denied, or undetermined.
struct PermissionBadge: View {
    let state: PermissionState

    var body: some View {
        Text(state.label)
            .font(.caption2)
            .fontWeight(.medium)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(state.color.opacity(0.15))
            .foregroundColor(state.color)
            .clipShape(Capsule())
    }
}

/// Represents the state of an OS-level permission.
enum PermissionState: Equatable {
    case granted
    case denied
    case undetermined

    var label: String {
        switch self {
        case .granted: return "Granted"
        case .denied: return "Denied"
        case .undetermined: return "Not Set"
        }
    }

    var color: Color {
        switch self {
        case .granted: return .green
        case .denied: return .red
        case .undetermined: return .orange
        }
    }
}
