// MicrophoneCapture.swift
// Captures audio from the system's default microphone using AVAudioEngine.
// Delivers PCM Int16 audio buffers at 16 kHz mono for downstream processing.

import AVFoundation
import Foundation

/// Errors specific to microphone capture operations.
enum MicrophoneCaptureError: LocalizedError {
    case microphoneNotAvailable
    case engineStartFailed(Error)
    case formatConversionFailed

    var errorDescription: String? {
        switch self {
        case .microphoneNotAvailable:
            return "No microphone is available on this device."
        case .engineStartFailed(let underlying):
            return "Audio engine failed to start: \(underlying.localizedDescription)"
        case .formatConversionFailed:
            return "Failed to create the target audio format."
        }
    }
}

/// Captures microphone audio using AVAudioEngine and delivers PCM Int16 data
/// at 16 kHz, 1 channel via a callback.
final class MicrophoneCapture {
    /// Callback type that delivers raw PCM Int16 audio data chunks.
    typealias AudioDataCallback = (Data) -> Void

    // MARK: - Properties

    private let audioEngine = AVAudioEngine()
    private var isRunning = false
    private var callback: AudioDataCallback?

    /// The target audio format: 16 kHz, 1 channel, PCM Int16.
    private let targetSampleRate: Double = 16000.0
    private let targetChannelCount: AVAudioChannelCount = 1

    // MARK: - Lifecycle

    /// Starts capturing microphone audio.
    ///
    /// Installs a tap on the audio engine's input node that converts audio to
    /// 16 kHz mono PCM Int16 and delivers it through the callback.
    ///
    /// - Parameter callback: Closure called with each chunk of PCM Int16 audio data.
    /// - Throws: `MicrophoneCaptureError` if the microphone is unavailable or the engine fails.
    func start(callback: @escaping AudioDataCallback) throws {
        guard !isRunning else { return }

        self.callback = callback
        let inputNode = audioEngine.inputNode

        // Verify that a microphone input is available.
        let inputFormat = inputNode.inputFormat(forBus: 0)
        guard inputFormat.channelCount > 0 else {
            throw MicrophoneCaptureError.microphoneNotAvailable
        }

        // Create the target format for our tap: 16 kHz, mono, PCM Int16.
        guard let targetFormat = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: targetSampleRate,
            channels: targetChannelCount,
            interleaved: true
        ) else {
            throw MicrophoneCaptureError.formatConversionFailed
        }

        // Use the output format of the input node (which is what taps must use)
        // and convert in the tap callback.
        let busFormat = inputNode.outputFormat(forBus: 0)

        // Install the tap on the input node. The buffer size is in frames;
        // 1024 frames at 16 kHz ~ 64ms of audio, a good balance for latency.
        let tapBufferSize: AVAudioFrameCount = 1024

        // Create a converter from the hardware format to our target format.
        guard let converter = AVAudioConverter(from: busFormat, to: targetFormat) else {
            throw MicrophoneCaptureError.formatConversionFailed
        }

        inputNode.installTap(onBus: 0, bufferSize: tapBufferSize, format: busFormat) {
            [weak self] (buffer, _) in
            self?.processBuffer(buffer, converter: converter, targetFormat: targetFormat)
        }

        do {
            try audioEngine.start()
            isRunning = true
        } catch {
            inputNode.removeTap(onBus: 0)
            throw MicrophoneCaptureError.engineStartFailed(error)
        }
    }

    /// Stops microphone capture and tears down the audio engine tap.
    func stop() {
        guard isRunning else { return }

        audioEngine.inputNode.removeTap(onBus: 0)
        audioEngine.stop()
        isRunning = false
        callback = nil
    }

    // MARK: - Private

    /// Converts an input buffer from the hardware format to PCM Int16 at 16 kHz
    /// and delivers the raw data through the callback.
    private func processBuffer(
        _ buffer: AVAudioPCMBuffer,
        converter: AVAudioConverter,
        targetFormat: AVAudioFormat
    ) {
        // Calculate the expected output frame count based on sample rate ratio.
        let ratio = targetFormat.sampleRate / buffer.format.sampleRate
        let outputFrameCapacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio)

        guard let outputBuffer = AVAudioPCMBuffer(
            pcmFormat: targetFormat,
            frameCapacity: outputFrameCapacity
        ) else {
            return
        }

        var conversionError: NSError?
        var inputConsumed = false

        let status = converter.convert(to: outputBuffer, error: &conversionError) { _, outStatus in
            if inputConsumed {
                outStatus.pointee = .noDataNow
                return nil
            }
            outStatus.pointee = .haveData
            inputConsumed = true
            return buffer
        }

        guard status != .error, conversionError == nil else {
            return
        }

        // Extract the raw PCM Int16 bytes from the converted buffer.
        let frameCount = Int(outputBuffer.frameLength)
        let bytesPerFrame = Int(targetFormat.streamDescription.pointee.mBytesPerFrame)
        let byteCount = frameCount * bytesPerFrame

        guard let int16Data = outputBuffer.int16ChannelData else { return }
        let data = Data(bytes: int16Data[0], count: byteCount)

        callback?(data)
    }

    deinit {
        stop()
    }
}
