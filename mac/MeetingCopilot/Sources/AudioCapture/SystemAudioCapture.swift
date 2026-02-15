// SystemAudioCapture.swift
// Captures system-wide audio using ScreenCaptureKit (macOS 13+).
// This requires the Screen Recording permission to be granted.
// Delivers PCM Int16 audio buffers at 16 kHz mono via a callback.

import Foundation
import ScreenCaptureKit
import CoreMedia
import AVFoundation

/// Captures system audio output using ScreenCaptureKit.
///
/// ScreenCaptureKit can capture audio from the entire system without needing
/// to capture video. This is used to get the audio from meeting applications
/// (Zoom, Google Meet, Teams, etc.) playing through the speakers.
final class SystemAudioCapture: NSObject, SCStreamOutput {
    /// Callback type that delivers raw PCM Int16 audio data chunks.
    typealias AudioDataCallback = (Data) -> Void

    // MARK: - Properties

    private var stream: SCStream?
    private var callback: AudioDataCallback?
    private var isRunning = false

    /// Target audio parameters matching the microphone capture format.
    private let targetSampleRate: Int = 16000
    private let targetChannelCount: Int = 1

    // MARK: - Lifecycle

    /// Starts capturing system audio.
    ///
    /// This method is asynchronous because it needs to query available screen content
    /// and set up the ScreenCaptureKit stream.
    ///
    /// - Parameter callback: Closure called with each chunk of PCM Int16 audio data.
    func start(callback: @escaping AudioDataCallback) {
        guard !isRunning else { return }
        self.callback = callback

        Task {
            do {
                try await beginCapture()
            } catch {
                print("[SystemAudioCapture] Failed to start: \(error.localizedDescription)")
            }
        }
    }

    /// Stops the system audio capture stream.
    func stop() {
        guard isRunning else { return }

        Task {
            do {
                try await stream?.stopCapture()
            } catch {
                print("[SystemAudioCapture] Error stopping capture: \(error.localizedDescription)")
            }
            stream = nil
            isRunning = false
            callback = nil
        }
    }

    // MARK: - Private Setup

    /// Sets up and starts the ScreenCaptureKit stream for audio-only capture.
    private func beginCapture() async throws {
        // Get the available shareable content (displays, windows, apps).
        let availableContent = try await SCShareableContent.excludingDesktopWindows(
            false,
            onScreenWindowsOnly: false
        )

        // We need at least one display to create a content filter.
        guard let display = availableContent.displays.first else {
            print("[SystemAudioCapture] No display found for content filter.")
            return
        }

        // Create a filter that captures the entire display.
        // We only want audio, so we will configure the stream accordingly.
        let filter = SCContentFilter(display: display, excludingWindows: [])

        // Configure the stream for audio-only capture.
        let configuration = SCStreamConfiguration()

        // Minimize video capture overhead since we only need audio.
        // We must still provide valid video dimensions, but we keep them minimal.
        configuration.width = 2
        configuration.height = 2
        configuration.minimumFrameInterval = CMTime(value: 1, timescale: 1) // 1 FPS minimum
        configuration.showsCursor = false

        // Audio configuration.
        configuration.capturesAudio = true
        configuration.sampleRate = targetSampleRate
        configuration.channelCount = targetChannelCount

        // Exclude the current app's audio to avoid feedback loops.
        if #available(macOS 14.0, *) {
            configuration.excludesCurrentProcessAudio = true
        }

        // Create the stream with our filter and configuration.
        let newStream = SCStream(filter: filter, configuration: configuration, delegate: nil)

        // Add ourselves as a stream output to receive audio samples.
        try newStream.addStreamOutput(
            self,
            type: .audio,
            sampleHandlerQueue: DispatchQueue(
                label: "com.meetingcopilot.systemaudio",
                qos: .userInteractive
            )
        )

        // Start the capture.
        try await newStream.startCapture()
        self.stream = newStream
        self.isRunning = true
    }

    // MARK: - SCStreamOutput

    /// Called by ScreenCaptureKit when a new audio (or video) sample is available.
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        // We only care about audio samples.
        guard type == .audio else { return }
        guard sampleBuffer.isValid else { return }

        // Convert the CMSampleBuffer to raw PCM Int16 data.
        guard let data = convertToInt16PCM(sampleBuffer: sampleBuffer) else { return }

        callback?(data)
    }

    // MARK: - Audio Conversion

    /// Converts a CMSampleBuffer containing audio data to raw PCM Int16 bytes.
    ///
    /// ScreenCaptureKit may deliver audio in Float32 format, so we convert
    /// to Int16 to match our target format.
    private func convertToInt16PCM(sampleBuffer: CMSampleBuffer) -> Data? {
        guard let formatDescription = sampleBuffer.formatDescription else { return nil }

        let audioStreamBasicDescription = CMAudioFormatDescriptionGetStreamBasicDescription(
            formatDescription
        )
        guard let asbd = audioStreamBasicDescription?.pointee else { return nil }

        // Get the raw audio data from the sample buffer.
        guard let blockBuffer = sampleBuffer.dataBuffer else { return nil }

        var totalLength = 0
        var dataPointer: UnsafeMutablePointer<Int8>?

        let status = CMBlockBufferGetDataPointer(
            blockBuffer,
            atOffset: 0,
            lengthAtOffsetOut: nil,
            totalLengthOut: &totalLength,
            dataPointerOut: &dataPointer
        )

        guard status == kCMBlockBufferNoErr, let rawData = dataPointer else { return nil }

        // Check if the audio is already Int16.
        if asbd.mFormatFlags & kAudioFormatFlagIsFloat == 0 &&
            asbd.mBitsPerChannel == 16 {
            // Already Int16, return as-is.
            return Data(bytes: rawData, count: totalLength)
        }

        // Convert from Float32 to Int16.
        if asbd.mFormatFlags & kAudioFormatFlagIsFloat != 0 &&
            asbd.mBitsPerChannel == 32 {
            let floatCount = totalLength / MemoryLayout<Float32>.size
            let floatPointer = UnsafeRawPointer(rawData).bindMemory(
                to: Float32.self,
                capacity: floatCount
            )

            var int16Samples = [Int16](repeating: 0, count: floatCount)
            for i in 0..<floatCount {
                // Clamp the float value to [-1.0, 1.0] and scale to Int16 range.
                let clamped = max(-1.0, min(1.0, floatPointer[i]))
                int16Samples[i] = Int16(clamped * Float32(Int16.max))
            }

            return int16Samples.withUnsafeBufferPointer { bufferPointer in
                Data(buffer: bufferPointer)
            }
        }

        // Unsupported format; log and return nil.
        print("[SystemAudioCapture] Unsupported audio format: \(asbd.mFormatFlags), bits: \(asbd.mBitsPerChannel)")
        return nil
    }

    deinit {
        stop()
    }
}
