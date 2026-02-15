// WebSocketServer.swift
// Local WebSocket server that bridges the macOS audio capture with the Chrome extension.
// Binds exclusively to 127.0.0.1 (localhost) for security. Never binds to 0.0.0.0.

import Foundation
import NIO
import NIOWebSocket
import WebSocketKit

/// A local WebSocket server that accepts connections from the Chrome extension,
/// receives control commands, and streams audio data to connected clients.
final class WebSocketServer {
    // MARK: - Callbacks

    /// Called when a message is received from any connected client.
    var onClientMessage: ((ClientMessage) -> Void)?

    /// Called when the number of connected clients changes.
    var onClientCountChanged: ((Int) -> Void)?

    // MARK: - Properties

    /// The NIO event loop group powering the server.
    private var eventLoopGroup: MultiThreadedEventLoopGroup?

    /// The bound server channel.
    private var channel: Channel?

    /// Thread-safe storage of connected WebSocket clients.
    private let clientsLock = NSLock()
    private var clients: [WebSocketClient] = []

    /// The port the server is listening on.
    private(set) var port: Int = 0

    /// JSON encoder for outgoing messages.
    private let encoder = JSONEncoder()

    /// JSON decoder for incoming messages.
    private let decoder = JSONDecoder()

    // MARK: - Client Tracking

    /// Represents a single connected WebSocket client.
    private struct WebSocketClient {
        let id: String
        let ws: WebSocket
    }

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
    ///   - host: The host to bind to. Must be "127.0.0.1" for security.
    ///   - port: The port to bind to. Use 0 for a random available port.
    /// - Returns: The actual port the server is listening on.
    @discardableResult
    func start(host: String = "127.0.0.1", port: Int = 0) async throws -> Int {
        // Security: always bind to localhost only.
        let bindHost = "127.0.0.1"

        let group = MultiThreadedEventLoopGroup(numberOfThreads: 2)
        self.eventLoopGroup = group

        let promise = group.next().makePromise(of: Int.self)

        // Set up the WebSocket server using WebSocketKit's upgrade mechanism.
        let bootstrap = ServerBootstrap(group: group)
            .serverChannelOption(ChannelOptions.backlog, value: 256)
            .serverChannelOption(ChannelOptions.socketOption(.so_reuseaddr), value: 1)
            .childChannelInitializer { channel in
                let upgrader = NIOWebSocketServerUpgrader(
                    shouldUpgrade: { channel, head in
                        channel.eventLoop.makeSucceededFuture(HTTPHeaders())
                    },
                    upgradePipelineHandler: { channel, req in
                        channel.pipeline.addHandler(
                            WebSocketHandler(server: self)
                        )
                    }
                )

                let config: NIOHTTPServerUpgradeConfiguration = (
                    upgraders: [upgrader],
                    completionHandler: { ctx in
                        // Remove the HTTP handler after upgrade.
                        ctx.pipeline.removeHandler(name: "HTTPHandler", promise: nil)
                    }
                )

                return channel.pipeline.configureHTTPServerPipeline(
                    withServerUpgrade: config
                ).flatMap {
                    channel.pipeline.addHandler(
                        HTTPPlaceholderHandler(),
                        name: "HTTPHandler"
                    )
                }
            }

        let serverChannel = try await bootstrap.bind(host: bindHost, port: port).get()

        guard let localAddress = serverChannel.localAddress,
              let actualPort = localAddress.port else {
            throw WebSocketServerError.failedToBindPort
        }

        self.channel = serverChannel
        self.port = actualPort

        print("[WebSocketServer] Listening on \(bindHost):\(actualPort)")

        return actualPort
    }

    /// Stops the WebSocket server and disconnects all clients.
    func stop() async {
        // Close all client connections.
        clientsLock.lock()
        let currentClients = clients
        clients.removeAll()
        clientsLock.unlock()

        for client in currentClients {
            try? await client.ws.close().get()
        }

        // Shut down the server channel and event loop group.
        try? await channel?.close()
        try? await eventLoopGroup?.shutdownGracefully()
        channel = nil
        eventLoopGroup = nil
        port = 0

        onClientCountChanged?(0)
    }

    // MARK: - Client Management

    /// Registers a new WebSocket connection.
    func addClient(_ ws: WebSocket) {
        let clientId = UUID().uuidString
        let client = WebSocketClient(id: clientId, ws: ws)

        clientsLock.lock()
        clients.append(client)
        let count = clients.count
        clientsLock.unlock()

        onClientCountChanged?(count)
        print("[WebSocketServer] Client connected (id: \(clientId), total: \(count))")

        // Set up message handling for this client.
        ws.onText { [weak self] _, text in
            self?.handleTextMessage(text)
        }

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
        clients.removeAll { $0.id == id }
        let count = clients.count
        clientsLock.unlock()

        onClientCountChanged?(count)
        print("[WebSocketServer] Client disconnected (id: \(id), remaining: \(count))")
    }

    // MARK: - Message Handling

    /// Parses and handles an incoming text message from a client.
    private func handleTextMessage(_ text: String) {
        guard let data = text.data(using: .utf8) else { return }

        do {
            let message = try decoder.decode(ClientMessage.self, from: data)
            onClientMessage?(message)
        } catch {
            print("[WebSocketServer] Failed to decode client message: \(error.localizedDescription)")
            // Send an error response back.
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
        let currentClients = clients
        clientsLock.unlock()

        for client in currentClients {
            client.ws.send(text)
        }
    }

    /// Sends raw binary data to all connected clients.
    func broadcastBinary(_ data: Data) {
        clientsLock.lock()
        let currentClients = clients
        clientsLock.unlock()

        let byteArray = [UInt8](data)
        for client in currentClients {
            client.ws.send(byteArray)
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

// MARK: - NIO Channel Handlers

/// Handles WebSocket frames after the HTTP upgrade is complete.
private final class WebSocketHandler: ChannelInboundHandler {
    typealias InboundIn = WebSocketFrame
    typealias OutboundOut = WebSocketFrame

    private weak var server: WebSocketServer?
    private var webSocket: WebSocket?

    init(server: WebSocketServer) {
        self.server = server
    }

    func handlerAdded(context: ChannelHandlerContext) {
        let ws = WebSocket(channel: context.channel, type: .server)
        self.webSocket = ws
        server?.addClient(ws)
    }

    func channelRead(context: ChannelHandlerContext, data: NIOAny) {
        let frame = unwrapInboundIn(data)
        webSocket?.handle(incoming: frame)
    }

    func channelInactive(context: ChannelHandlerContext) {
        _ = webSocket?.close()
        context.fireChannelInactive()
    }

    func errorCaught(context: ChannelHandlerContext, error: Error) {
        print("[WebSocketHandler] Error: \(error.localizedDescription)")
        context.close(promise: nil)
    }
}

/// Placeholder HTTP handler that responds to non-upgrade requests.
/// This is removed from the pipeline once the WebSocket upgrade succeeds.
private final class HTTPPlaceholderHandler: ChannelInboundHandler {
    typealias InboundIn = HTTPServerRequestPart
    typealias OutboundOut = HTTPServerResponsePart

    func channelRead(context: ChannelHandlerContext, data: NIOAny) {
        let part = unwrapInboundIn(data)

        switch part {
        case .head(let head):
            // Respond with a simple status page for non-WebSocket requests.
            if head.uri == "/health" {
                let response = HTTPResponseHead(version: head.version, status: .ok)
                context.write(wrapOutboundOut(.head(response)), promise: nil)
                var body = context.channel.allocator.buffer(capacity: 0)
                body.writeString("{\"status\":\"ok\"}")
                context.write(wrapOutboundOut(.body(.byteBuffer(body))), promise: nil)
                context.writeAndFlush(wrapOutboundOut(.end(nil)), promise: nil)
            }

        case .body, .end:
            break
        }
    }
}

// MARK: - WebSocket Extension

/// Extension to provide a handler for incoming WebSocket frames.
extension WebSocket {
    fileprivate func handle(incoming frame: WebSocketFrame) {
        switch frame.opcode {
        case .text:
            var data = frame.unmaskedData
            if let text = data.readString(length: data.readableBytes) {
                onText.callbacks.forEach { $0(self, text) }
            }

        case .binary:
            let data = frame.unmaskedData
            onBinary.callbacks.forEach { $0(self, data) }

        case .connectionClose:
            _ = close()

        case .ping:
            pong()

        default:
            break
        }
    }
}
