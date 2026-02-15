// WebSocketServer.swift
// Local WebSocket server that bridges the macOS audio capture with the Chrome extension.
// Binds exclusively to 127.0.0.1 (localhost) for security. Never binds to 0.0.0.0.

import Foundation
import NIO
import NIOHTTP1
import NIOWebSocket
import WebSocketKit

/// A local WebSocket server that accepts connections from the Chrome extension,
/// receives control commands, and streams audio data to connected clients.
final class WebSocketServer: @unchecked Sendable {
    // MARK: - Callbacks

    /// Called when a message is received from any connected client.
    var onClientMessage: ((ClientMessage) -> Void)?

    /// Called when the number of connected clients changes.
    var onClientCountChanged: ((Int) -> Void)?

    // MARK: - Properties

    /// The NIO event loop group powering the server.
    private var eventLoopGroup: MultiThreadedEventLoopGroup?

    /// Thread-safe storage of connected WebSocket clients.
    private let clientsLock = NSLock()
    private var clients: [String: WebSocket] = [:]

    /// The port the server is listening on.
    private(set) var port: Int = 0

    /// JSON encoder for outgoing messages.
    private let encoder: JSONEncoder = {
        let enc = JSONEncoder()
        enc.outputFormatting = [.sortedKeys]
        return enc
    }()

    /// JSON decoder for incoming messages.
    private let decoder = JSONDecoder()

    /// Current number of connected clients.
    var clientCount: Int {
        clientsLock.lock()
        defer { clientsLock.unlock() }
        return clients.count
    }

    // MARK: - Server Lifecycle

    /// Starts the WebSocket server on the given host and port.
    ///
    /// - Parameters:
    ///   - host: The host to bind to. Forced to "127.0.0.1" for security.
    ///   - port: The port to bind to. Use 0 for a random available port.
    /// - Returns: The actual port the server is listening on.
    @discardableResult
    func start(host: String = "127.0.0.1", port: Int = 0) async throws -> Int {
        // Security: always bind to localhost only, regardless of the host parameter.
        let bindHost = "127.0.0.1"

        let group = MultiThreadedEventLoopGroup(numberOfThreads: 2)
        self.eventLoopGroup = group

        let server = try await ServerBootstrap(group: group)
            .serverChannelOption(ChannelOptions.backlog, value: 256)
            .serverChannelOption(ChannelOptions.socketOption(.so_reuseaddr), value: 1)
            .childChannelInitializer { channel in
                let upgrader = NIOWebSocketServerUpgrader(
                    shouldUpgrade: { channel, head in
                        channel.eventLoop.makeSucceededFuture(HTTPHeaders())
                    },
                    upgradePipelineHandler: { channel, request in
                        WebSocket.server(on: channel) { ws in
                            self.handleNewConnection(ws)
                        }
                    }
                )

                let upgradeConfig: NIOHTTPServerUpgradeConfiguration = (
                    upgraders: [upgrader],
                    completionHandler: { context in
                        // The HTTP handlers are removed automatically after a successful upgrade.
                    }
                )

                return channel.pipeline.configureHTTPServerPipeline(
                    withServerUpgrade: upgradeConfig
                )
            }
            .bind(host: bindHost, port: port)
            .get()

        guard let localAddress = server.localAddress,
              let actualPort = localAddress.port else {
            throw WebSocketServerError.failedToBindPort
        }

        self.port = actualPort
        print("[WebSocketServer] Listening on \(bindHost):\(actualPort)")

        return actualPort
    }

    /// Stops the WebSocket server and disconnects all clients.
    func stop() {
        // Close all client connections.
        clientsLock.lock()
        let currentClients = clients
        clients.removeAll()
        clientsLock.unlock()

        for (_, ws) in currentClients {
            ws.close(promise: nil)
        }

        // Shut down the event loop group.
        do {
            try eventLoopGroup?.syncShutdownGracefully()
        } catch {
            print("[WebSocketServer] Error shutting down: \(error.localizedDescription)")
        }
        eventLoopGroup = nil
        port = 0

        onClientCountChanged?(0)
    }

    // MARK: - Connection Handling

    /// Called when a new WebSocket connection is established.
    private func handleNewConnection(_ ws: WebSocket) {
        let clientId = UUID().uuidString

        // Register the client.
        clientsLock.lock()
        clients[clientId] = ws
        let count = clients.count
        clientsLock.unlock()

        onClientCountChanged?(count)
        print("[WebSocketServer] Client connected (id: \(clientId), total: \(count))")

        // Handle incoming text messages from this client.
        ws.onText { [weak self] _, text in
            self?.handleTextMessage(text)
        }

        // Handle incoming binary messages from this client.
        ws.onBinary { [weak self] _, buffer in
            let data = Data(buffer: buffer)
            if let text = String(data: data, encoding: .utf8) {
                self?.handleTextMessage(text)
            }
        }

        // Handle disconnection.
        ws.onClose.whenComplete { [weak self] _ in
            self?.removeClient(id: clientId)
        }
    }

    /// Removes a disconnected client by ID.
    private func removeClient(id: String) {
        clientsLock.lock()
        clients.removeValue(forKey: id)
        let count = clients.count
        clientsLock.unlock()

        onClientCountChanged?(count)
        print("[WebSocketServer] Client disconnected (id: \(id), remaining: \(count))")
    }

    // MARK: - Message Handling

    /// Parses and dispatches an incoming text message from a client.
    private func handleTextMessage(_ text: String) {
        guard let data = text.data(using: .utf8) else { return }

        do {
            let message = try decoder.decode(ClientMessage.self, from: data)
            onClientMessage?(message)
        } catch {
            print("[WebSocketServer] Failed to decode client message: \(error.localizedDescription)")
            let errorMsg = ServerMessage.error(
                code: "INVALID_MESSAGE",
                message: "Failed to parse message: \(error.localizedDescription)"
            )
            broadcast(errorMsg)
        }
    }

    // MARK: - Broadcasting

    /// Broadcasts a server message to all connected clients as JSON text.
    func broadcast(_ message: ServerMessage) {
        guard let data = try? encoder.encode(message),
              let text = String(data: data, encoding: .utf8) else {
            return
        }

        clientsLock.lock()
        let currentClients = Array(clients.values)
        clientsLock.unlock()

        for ws in currentClients {
            ws.send(text)
        }
    }

    /// Sends raw binary data to all connected clients.
    func broadcastBinary(_ data: Data) {
        clientsLock.lock()
        let currentClients = Array(clients.values)
        clientsLock.unlock()

        let byteArray = [UInt8](data)
        for ws in currentClients {
            ws.send(byteArray)
        }
    }
}

// MARK: - Errors

enum WebSocketServerError: LocalizedError {
    case failedToBindPort

    var errorDescription: String? {
        switch self {
        case .failedToBindPort:
            return "Failed to bind to a local port."
        }
    }
}
