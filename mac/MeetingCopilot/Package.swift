// swift-tools-version: 5.9
// The swift-tools-version declares the minimum version of Swift Package Manager required to build this package.

import PackageDescription

let package = Package(
    name: "MeetingCopilot",
    platforms: [
        .macOS(.v13) // ScreenCaptureKit requires macOS 13+
    ],
    products: [
        .executable(
            name: "MeetingCopilot",
            targets: ["MeetingCopilot"]
        )
    ],
    dependencies: [
        .package(
            url: "https://github.com/apple/swift-nio.git",
            from: "2.50.0"
        ),
        .package(
            url: "https://github.com/apple/swift-nio-extras.git",
            from: "1.19.0"
        ),
        .package(
            url: "https://github.com/vapor/websocket-kit.git",
            from: "2.14.0"
        ),
    ],
    targets: [
        .executableTarget(
            name: "MeetingCopilot",
            dependencies: [
                .product(name: "NIO", package: "swift-nio"),
                .product(name: "NIOWebSocket", package: "swift-nio"),
                .product(name: "NIOExtras", package: "swift-nio-extras"),
                .product(name: "WebSocketKit", package: "websocket-kit"),
            ],
            path: "Sources"
        )
    ]
)
