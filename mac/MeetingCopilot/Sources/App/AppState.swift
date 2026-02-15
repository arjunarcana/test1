// AppState.swift
// Central ObservableObject managing all application state, audio capture lifecycle,
// and coordination between audio sources and the WebSocket bridge.

import Foundation
import SwiftUI
import Combine

/// The capture mode determines which audio sources are active.
enum CaptureMode: String, Codable, CaseIterable {
    case microphoneOnly = "microphone"
    case systemAudio = "system"
    case both = "both"

    /// Returns the list of active channel names for this mode.
    var channels: [String] {
        switch self {
        case .microphoneOnly: return ["microphone"]
        case .systemAudio: return ["system"]
        case .both: return ["microphone", "system"]
        }
    }
}

@MainActor
final class AppState: ObservableObject {
    // MARK: - Published State

    /// Whether audio capture is currently active.
    @Published var isCapturing: Bool = false

    /// Current capture mode (microphone, system, or both).
    @Published var captureMode: CaptureMode = .both

    /// Number of WebSocket clients currently connected.
    @Published var connectedClients: Int = 0

    /// The port the WebSocket server is listening on.
    @Published var port: Int = 0

    /// Current microphone permission state.
    @Published var micPermission: PermissionState = .undetermined

    /// Current screen recording permission state.
    @Published var screenPermission: PermissionState = .undetermined

    /// Most recent error message, if any.
    @Published var errorMessage: String?

    // MARK: - Subsystems

    private let micCapture = MicrophoneCapture()
    private let systemCapture = SystemAudioCapture()
    private let audioMixer = AudioMixer()
    private let webSocketServer = WebSocketServer()
    private let permissionsManager = PermissionsManager()

    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization

    init() {
        setupBindings()
        refreshPermissions()
        startServer()
    }

    // MARK: - Server Lifecycle

    /// Starts the local WebSocket server on a random available port.
    private func startServer() {
        // Configure message handler for incoming client commands.
        webSocketServer.onClientMessage = { [weak self] message in
            Task { @MainActor in
                self?.handleClientMessage(message)
            }
        }

        // Observe connected client count changes.
        webSocketServer.onClientCountChanged = { [weak self] count in
            Task { @MainActor in
                self?.connectedClients = count
            }
        }

        Task {
            do {
                let assignedPort = try await webSocketServer.start(host: "127.0.0.1", port: 0)
                self.port = assignedPort
                self.errorMessage = nil
            } catch {
                self.errorMessage = "Failed to start server: \(error.localizedDescription)"
            }
        }
    }

    // MARK: - Audio Capture Lifecycle

    /// Starts audio capture based on the currently selected capture mode.
    /// Verifies permissions before starting and reports errors to the UI.
    func startCapture() {
        errorMessage = nil
        refreshPermissions()

        // Validate permissions for the selected mode.
        if captureMode == .microphoneOnly || captureMode == .both {
            guard micPermission == .granted else {
                errorMessage = "Microphone permission is required. Please grant access in System Settings."
                broadcastPermissionRequired("microphone")
                return
            }
        }
        if captureMode == .systemAudio || captureMode == .both {
            guard screenPermission == .granted else {
                errorMessage = "Screen Recording permission is required for system audio capture."
                broadcastPermissionRequired("screen_recording")
                return
            }
        }

        do {
            // Start microphone capture if needed.
            if captureMode == .microphoneOnly || captureMode == .both {
                try micCapture.start { [weak self] audioData in
                    self?.handleMicAudio(audioData)
                }
            }

            // Start system audio capture if needed.
            if captureMode == .systemAudio || captureMode == .both {
                systemCapture.start { [weak self] audioData in
                    self?.handleSystemAudio(audioData)
                }
            }

            isCapturing = true

            // Broadcast status update to all connected clients.
            broadcastStatus()
        } catch {
            errorMessage = "Failed to start capture: \(error.localizedDescription)"
            stopCapture()
        }
    }

    /// Stops all active audio capture and notifies connected clients.
    func stopCapture() {
        micCapture.stop()
        systemCapture.stop()
        audioMixer.reset()
        isCapturing = false
        broadcastStatus()
    }

    // MARK: - Audio Callbacks

    /// Called when microphone audio data is available.
    private func handleMicAudio(_ data: Data) {
        if captureMode == .both {
            audioMixer.addMicAudio(data) { [weak self] mixedData in
                self?.sendAudioFrame(mixedData, channel: "mixed")
            }
        } else {
            sendAudioFrame(data, channel: "microphone")
        }
    }

    /// Called when system audio data is available.
    private func handleSystemAudio(_ data: Data) {
        if captureMode == .both {
            audioMixer.addSystemAudio(data) { [weak self] mixedData in
                self?.sendAudioFrame(mixedData, channel: "mixed")
            }
        } else {
            sendAudioFrame(data, channel: "system")
        }
    }

    /// Encodes audio data as base64 and sends it to all connected WebSocket clients.
    private func sendAudioFrame(_ data: Data, channel: String) {
        let base64 = data.base64EncodedString()
        let timestamp = Date().timeIntervalSince1970
        let message = ServerMessage.audioFrame(
            data: base64,
            channel: channel,
            timestamp: timestamp
        )
        webSocketServer.broadcast(message)
    }

    // MARK: - Client Message Handling

    /// Handles incoming messages from WebSocket clients.
    private func handleClientMessage(_ message: ClientMessage) {
        switch message {
        case .startCapture(let channels):
            // Determine capture mode from requested channels.
            if channels.contains("microphone") && channels.contains("system") {
                captureMode = .both
            } else if channels.contains("system") {
                captureMode = .systemAudio
            } else {
                captureMode = .microphoneOnly
            }
            startCapture()

        case .stopCapture:
            stopCapture()

        case .getStatus:
            broadcastStatus()
        }
    }

    // MARK: - Broadcasts

    /// Sends the current status to all connected WebSocket clients.
    private func broadcastStatus() {
        let message = ServerMessage.status(
            capturing: isCapturing,
            channels: captureMode.channels,
            port: port
        )
        webSocketServer.broadcast(message)
    }

    /// Tells connected clients that a permission is required.
    private func broadcastPermissionRequired(_ permission: String) {
        let message = ServerMessage.permissionRequired(permission: permission)
        webSocketServer.broadcast(message)
    }

    // MARK: - Permissions

    /// Refreshes the current permission states from the OS.
    func refreshPermissions() {
        micPermission = permissionsManager.microphonePermissionState()
        screenPermission = permissionsManager.screenRecordingPermissionState()
    }

    /// Requests all necessary permissions from the OS.
    func requestPermissions() {
        permissionsManager.requestMicrophoneAccess { [weak self] granted in
            Task { @MainActor in
                self?.micPermission = granted ? .granted : .denied
            }
        }
        permissionsManager.requestScreenRecordingAccess()
        // Screen recording permission requires app restart; refresh state.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            self?.refreshPermissions()
        }
    }

    // MARK: - Bindings

    private func setupBindings() {
        // Periodically refresh permissions while not capturing.
        Timer.publish(every: 5.0, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                self?.refreshPermissions()
            }
            .store(in: &cancellables)
    }
}
