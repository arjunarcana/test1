// PermissionsManager.swift
// Manages macOS permissions required for audio capture:
// - Microphone access (for AVAudioEngine-based microphone capture)
// - Screen Recording access (for ScreenCaptureKit system audio capture)

import AVFoundation
import CoreGraphics
import Foundation
import AppKit

/// Manages checking and requesting macOS permissions for microphone and screen recording.
///
/// Microphone permission is required for capturing the user's microphone input.
/// Screen Recording permission is required for ScreenCaptureKit to capture system audio.
/// Both permissions must be granted in System Settings by the user.
final class PermissionsManager {

    // MARK: - Microphone Permission

    /// Returns the current microphone permission state.
    ///
    /// Uses AVCaptureDevice authorization status for the audio media type.
    func microphonePermissionState() -> PermissionState {
        let status = AVCaptureDevice.authorizationStatus(for: .audio)
        switch status {
        case .authorized:
            return .granted
        case .denied, .restricted:
            return .denied
        case .notDetermined:
            return .undetermined
        @unknown default:
            return .undetermined
        }
    }

    /// Requests microphone access from the user.
    ///
    /// On first request, macOS shows a system dialog. Subsequent calls return
    /// the cached result without showing a dialog.
    ///
    /// - Parameter completion: Called with `true` if access was granted, `false` otherwise.
    func requestMicrophoneAccess(completion: @escaping (Bool) -> Void) {
        AVCaptureDevice.requestAccess(for: .audio) { granted in
            completion(granted)
        }
    }

    // MARK: - Screen Recording Permission

    /// Returns the current screen recording permission state.
    ///
    /// Uses CGPreflightScreenCaptureAccess() (available macOS 13+) to check
    /// whether screen recording is allowed without triggering a prompt.
    func screenRecordingPermissionState() -> PermissionState {
        if CGPreflightScreenCaptureAccess() {
            return .granted
        }

        // CGPreflightScreenCaptureAccess returns false for both "not determined"
        // and "denied". We cannot distinguish between the two on macOS, so we
        // report "denied" to encourage the user to check System Settings.
        // The first time CGRequestScreenCaptureAccess() is called, macOS will
        // show the permission dialog.
        return .denied
    }

    /// Requests screen recording access from the user.
    ///
    /// On macOS 13+, this uses CGRequestScreenCaptureAccess() which shows the
    /// system permission dialog if access has not been determined. If the user
    /// has previously denied access, this opens System Settings to the
    /// Screen Recording pane.
    ///
    /// Note: Unlike microphone permission, screen recording permission changes
    /// require restarting the application to take effect.
    func requestScreenRecordingAccess() {
        let hasAccess = CGRequestScreenCaptureAccess()
        if !hasAccess {
            // If access was denied, open System Settings to the Screen Recording pane
            // so the user can manually enable it.
            openScreenRecordingSettings()
        }
    }

    // MARK: - System Settings Navigation

    /// Opens System Settings (or System Preferences on older macOS) to the
    /// Privacy & Security > Microphone pane.
    func openMicrophoneSettings() {
        openSystemSettingsPane("com.apple.preference.security?Privacy_Microphone")
    }

    /// Opens System Settings to the Privacy & Security > Screen Recording pane.
    func openScreenRecordingSettings() {
        openSystemSettingsPane("com.apple.preference.security?Privacy_ScreenCapture")
    }

    /// Opens a specific System Settings privacy pane by URL.
    ///
    /// On macOS 13+, System Settings uses a different URL scheme than the old
    /// System Preferences, but the `x-apple.systempreferences:` scheme works
    /// for both.
    private func openSystemSettingsPane(_ paneIdentifier: String) {
        // Try the modern System Settings URL first (macOS 13+).
        if let url = URL(string: "x-apple.systempreferences:\(paneIdentifier)") {
            NSWorkspace.shared.open(url)
        }
    }
}
