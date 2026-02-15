// MessageProtocol.swift
// Codable message types for the WebSocket bridge protocol between the
// macOS companion app and the Chrome extension.
// Uses a "type" discriminator field for JSON encoding/decoding.

import Foundation

// MARK: - Client Messages (Incoming from Chrome Extension)

/// Messages received from the Chrome extension via WebSocket.
///
/// JSON format examples:
/// ```json
/// {"type": "start_capture", "channels": ["microphone", "system"]}
/// {"type": "stop_capture"}
/// {"type": "get_status"}
/// ```
enum ClientMessage: Codable {
    case startCapture(channels: [String])
    case stopCapture
    case getStatus

    // MARK: - Coding Keys

    private enum CodingKeys: String, CodingKey {
        case type
        case channels
    }

    private enum MessageType: String, Codable {
        case startCapture = "start_capture"
        case stopCapture = "stop_capture"
        case getStatus = "get_status"
    }

    // MARK: - Decodable

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(MessageType.self, forKey: .type)

        switch type {
        case .startCapture:
            let channels = try container.decodeIfPresent([String].self, forKey: .channels) ?? ["microphone"]
            self = .startCapture(channels: channels)

        case .stopCapture:
            self = .stopCapture

        case .getStatus:
            self = .getStatus
        }
    }

    // MARK: - Encodable

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)

        switch self {
        case .startCapture(let channels):
            try container.encode(MessageType.startCapture, forKey: .type)
            try container.encode(channels, forKey: .channels)

        case .stopCapture:
            try container.encode(MessageType.stopCapture, forKey: .type)

        case .getStatus:
            try container.encode(MessageType.getStatus, forKey: .type)
        }
    }
}

// MARK: - Server Messages (Outgoing to Chrome Extension)

/// Messages sent from the macOS companion app to the Chrome extension via WebSocket.
///
/// JSON format examples:
/// ```json
/// {"type": "status", "capturing": true, "channels": ["microphone", "system"], "port": 9876}
/// {"type": "audio_frame", "data": "base64...", "channel": "microphone", "timestamp": 1700000000.123}
/// {"type": "error", "code": "MIC_UNAVAILABLE", "message": "Microphone not found"}
/// {"type": "permission_required", "permission": "microphone"}
/// ```
enum ServerMessage: Codable {
    case status(capturing: Bool, channels: [String], port: Int)
    case audioFrame(data: String, channel: String, timestamp: Double)
    case error(code: String, message: String)
    case permissionRequired(permission: String)

    // MARK: - Coding Keys

    private enum CodingKeys: String, CodingKey {
        case type
        case capturing
        case channels
        case port
        case data
        case channel
        case timestamp
        case code
        case message
        case permission
    }

    private enum MessageType: String, Codable {
        case status
        case audioFrame = "audio_frame"
        case error
        case permissionRequired = "permission_required"
    }

    // MARK: - Decodable

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(MessageType.self, forKey: .type)

        switch type {
        case .status:
            let capturing = try container.decode(Bool.self, forKey: .capturing)
            let channels = try container.decode([String].self, forKey: .channels)
            let port = try container.decode(Int.self, forKey: .port)
            self = .status(capturing: capturing, channels: channels, port: port)

        case .audioFrame:
            let data = try container.decode(String.self, forKey: .data)
            let channel = try container.decode(String.self, forKey: .channel)
            let timestamp = try container.decode(Double.self, forKey: .timestamp)
            self = .audioFrame(data: data, channel: channel, timestamp: timestamp)

        case .error:
            let code = try container.decode(String.self, forKey: .code)
            let message = try container.decode(String.self, forKey: .message)
            self = .error(code: code, message: message)

        case .permissionRequired:
            let permission = try container.decode(String.self, forKey: .permission)
            self = .permissionRequired(permission: permission)
        }
    }

    // MARK: - Encodable

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)

        switch self {
        case .status(let capturing, let channels, let port):
            try container.encode(MessageType.status, forKey: .type)
            try container.encode(capturing, forKey: .capturing)
            try container.encode(channels, forKey: .channels)
            try container.encode(port, forKey: .port)

        case .audioFrame(let data, let channel, let timestamp):
            try container.encode(MessageType.audioFrame, forKey: .type)
            try container.encode(data, forKey: .data)
            try container.encode(channel, forKey: .channel)
            try container.encode(timestamp, forKey: .timestamp)

        case .error(let code, let message):
            try container.encode(MessageType.error, forKey: .type)
            try container.encode(code, forKey: .code)
            try container.encode(message, forKey: .message)

        case .permissionRequired(let permission):
            try container.encode(MessageType.permissionRequired, forKey: .type)
            try container.encode(permission, forKey: .permission)
        }
    }
}
