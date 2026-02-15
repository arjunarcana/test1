// AudioMixer.swift
// Mixes microphone and system audio into a single stereo PCM stream.
// Left channel = microphone, Right channel = system audio.
// Both inputs are expected to be PCM Int16, 16 kHz, mono.

import Foundation

/// Mixes two mono PCM Int16 audio streams into a stereo PCM Int16 stream.
///
/// When capturing both microphone and system audio, this mixer interleaves
/// the two sources into a stereo frame: left channel for the microphone,
/// right channel for system audio. This allows downstream consumers (the
/// Chrome extension / transcription engine) to separate the two sources.
final class AudioMixer {
    /// Callback delivering mixed stereo PCM Int16 data.
    typealias MixedAudioCallback = (Data) -> Void

    // MARK: - Properties

    /// Lock for thread-safe buffer access.
    private let lock = NSLock()

    /// Buffered microphone samples waiting to be mixed.
    private var micBuffer = Data()

    /// Buffered system audio samples waiting to be mixed.
    private var systemBuffer = Data()

    /// Minimum number of bytes from each source required before producing output.
    /// At 16 kHz mono Int16, 640 bytes = 320 samples = 20ms of audio.
    private let mixThresholdBytes: Int = 640

    // MARK: - Public Interface

    /// Adds microphone audio data to the mixer buffer.
    ///
    /// When enough data from both sources is available, the mixer produces
    /// interleaved stereo output and delivers it through the callback.
    ///
    /// - Parameters:
    ///   - data: Raw PCM Int16 mono audio data from the microphone.
    ///   - callback: Closure called with mixed stereo PCM Int16 data.
    func addMicAudio(_ data: Data, callback: MixedAudioCallback) {
        lock.lock()
        micBuffer.append(data)
        tryMix(callback: callback)
        lock.unlock()
    }

    /// Adds system audio data to the mixer buffer.
    ///
    /// When enough data from both sources is available, the mixer produces
    /// interleaved stereo output and delivers it through the callback.
    ///
    /// - Parameters:
    ///   - data: Raw PCM Int16 mono audio data from system capture.
    ///   - callback: Closure called with mixed stereo PCM Int16 data.
    func addSystemAudio(_ data: Data, callback: MixedAudioCallback) {
        lock.lock()
        systemBuffer.append(data)
        tryMix(callback: callback)
        lock.unlock()
    }

    /// Resets the mixer, clearing all buffered audio data.
    func reset() {
        lock.lock()
        micBuffer.removeAll()
        systemBuffer.removeAll()
        lock.unlock()
    }

    // MARK: - Private Mixing

    /// Attempts to mix buffered audio if enough data is available from both sources.
    /// Must be called while `lock` is held.
    private func tryMix(callback: MixedAudioCallback) {
        // We need at least `mixThresholdBytes` from each source.
        while micBuffer.count >= mixThresholdBytes && systemBuffer.count >= mixThresholdBytes {
            // Determine how many bytes to consume (take the minimum available,
            // aligned to Int16 sample boundaries).
            let available = min(micBuffer.count, systemBuffer.count)
            let bytesToMix = available - (available % MemoryLayout<Int16>.size)

            guard bytesToMix > 0 else { break }

            let micChunk = micBuffer.prefix(bytesToMix)
            let sysChunk = systemBuffer.prefix(bytesToMix)

            // Consume the data from both buffers.
            micBuffer.removeFirst(bytesToMix)
            systemBuffer.removeFirst(bytesToMix)

            // Interleave into stereo: [L, R, L, R, ...] where L=mic, R=system.
            let mixed = interleaveStereo(left: micChunk, right: sysChunk)
            callback(mixed)
        }

        // If one buffer is growing much faster than the other, prevent unbounded growth.
        // Drop excess data that is more than 1 second ahead (32000 bytes at 16kHz Int16).
        let maxBufferSize = 32000
        if micBuffer.count > maxBufferSize && systemBuffer.count < mixThresholdBytes {
            let excess = micBuffer.count - maxBufferSize
            micBuffer.removeFirst(excess)
        }
        if systemBuffer.count > maxBufferSize && micBuffer.count < mixThresholdBytes {
            let excess = systemBuffer.count - maxBufferSize
            systemBuffer.removeFirst(excess)
        }
    }

    /// Interleaves two mono PCM Int16 buffers into a stereo PCM Int16 buffer.
    ///
    /// - Parameters:
    ///   - left: Mono PCM Int16 data for the left channel (microphone).
    ///   - right: Mono PCM Int16 data for the right channel (system audio).
    /// - Returns: Interleaved stereo PCM Int16 data (twice the length of each input).
    private func interleaveStereo(left: Data, right: Data) -> Data {
        let sampleCount = left.count / MemoryLayout<Int16>.size

        // Prepare output buffer: stereo means 2 samples per frame.
        var output = Data(capacity: sampleCount * 2 * MemoryLayout<Int16>.size)

        left.withUnsafeBytes { leftRaw in
            right.withUnsafeBytes { rightRaw in
                guard let leftPtr = leftRaw.baseAddress?.assumingMemoryBound(to: Int16.self),
                      let rightPtr = rightRaw.baseAddress?.assumingMemoryBound(to: Int16.self) else {
                    return
                }

                for i in 0..<sampleCount {
                    // Left channel (microphone).
                    var leftSample = leftPtr[i]
                    output.append(Data(bytes: &leftSample, count: MemoryLayout<Int16>.size))

                    // Right channel (system audio).
                    var rightSample = rightPtr[i]
                    output.append(Data(bytes: &rightSample, count: MemoryLayout<Int16>.size))
                }
            }
        }

        return output
    }
}
