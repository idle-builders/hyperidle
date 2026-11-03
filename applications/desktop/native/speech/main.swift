// The desktop app's speech helper: writes down what is said, on this Mac only. For Record it listens
// to the microphone; in a huddle (--utterances) it reads the call's sound from stdin. Each result is
// one JSON line on stdout: {"kind":"partial"|"final","text"} or {"kind":"error","message"}. Closing
// stdin ends it; the last line is then "final".
import AVFoundation
import Foundation
import Speech

func emit(_ fields: [String: String]) {
	guard let line = try? JSONSerialization.data(withJSONObject: fields) else { return }
	FileHandle.standardOutput.write(line + Data("\n".utf8))
}

func fail(_ message: String) -> Never {
	emit(["kind": "error", "message": message])
	exit(1)
}

var heard = ""
var stopping = false
/** Set once the microphone is on; until then, stopping just ends with nothing heard. */
var stopListening: (() -> Void)?

func finish() -> Never {
	emit(["kind": "final", "text": heard])
	exit(0)
}

func listen() {
	guard let recognizer = SFSpeechRecognizer(), recognizer.supportsOnDeviceRecognition else {
		fail("This Mac cannot write down speech on the device for \(Locale.current.identifier).")
	}
	let request = SFSpeechAudioBufferRecognitionRequest()
	// No sound leaves the computer: refuse rather than fall back to Apple's servers.
	request.requiresOnDeviceRecognition = true
	request.shouldReportPartialResults = true
	request.addsPunctuation = true

	let engine = AVAudioEngine()
	let input = engine.inputNode
	input.installTap(onBus: 0, bufferSize: 4096, format: input.outputFormat(forBus: 0)) { buffer, _ in
		request.append(buffer)
	}
	engine.prepare()
	do { try engine.start() } catch { fail("The microphone could not start: \(error.localizedDescription)") }

	_ = recognizer.recognitionTask(with: request) { result, error in
		DispatchQueue.main.async {
			if let result {
				// After Stop the recognizer can hand back an empty final result; keep what was heard.
				let said = result.bestTranscription.formattedString
				if !said.isEmpty { heard = said }
				if result.isFinal { finish() }
				emit(["kind": "partial", "text": heard])
			} else if let error {
				// Ending with nothing said reports an error; that is an empty recording, not a failure.
				if stopping { finish() }
				// Apple's on-device recognizer runs only while the Mac's Dictation is switched on.
				let e = error as NSError
				if e.domain == "kLSRErrorDomain" && e.code == 201 {
					fail("Recording needs Dictation on. Turn it on in System Settings → Keyboard → Dictation, then press Record again.")
				}
				fail(error.localizedDescription)
			}
		}
	}

	stopListening = {
		engine.stop()
		input.removeTap(onBus: 0)
		request.endAudio()
		DispatchQueue.main.asyncAfter(deadline: .now() + 5) { finish() }
	}
}

/** Mutable reference wrapper: lets the stdin reader feed whichever request is current. */
final class Box<T> {
	var value: T
	init(_ value: T) { self.value = value }
}

/**
 * Continuous utterance loop for a huddle: 1.5 s of silence emits a `final`, swaps the recognition
 * request (no gap in the audio), and starts listening again. The sound comes on stdin, not from the
 * microphone: 16 kHz mono float32 from the call's own microphone track, which has the call's echo
 * cancellation applied, so the other people coming out of the speakers are not written down as you.
 * Runs until stdin closes.
 *
 * Generation numbers guard against stale task callbacks: each startRecognition increments
 * `generation`; callbacks whose captured `myGeneration` is behind are silently dropped.
 * The old request's endAudio() + old task's cancel() prevent late partials from leaking into
 * the next utterance.
 */
func listenUtterances() {
	guard let recognizer = SFSpeechRecognizer(), recognizer.supportsOnDeviceRecognition else {
		fail("This Mac cannot write down speech on the device for \(Locale.current.identifier).")
	}

	guard let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16000, channels: 1, interleaved: false) else {
		fail("The speech helper could not set up its audio format.")
	}

	func makeRequest() -> SFSpeechAudioBufferRecognitionRequest {
		let req = SFSpeechAudioBufferRecognitionRequest()
		req.requiresOnDeviceRecognition = true
		req.shouldReportPartialResults = true
		req.addsPunctuation = true
		return req
	}

	let box = Box(makeRequest())
	var silenceTimer: DispatchWorkItem?
	var currentText = ""
	var generation = 0
	var currentTask: SFSpeechRecognitionTask?
	// Tracks the last error code; set on first error, cleared on a good result.
	// If the restarted task fails with the same code right away, it is fatal. The same error after a
	// while, such as nothing said during a long silence, just starts listening again.
	var lastErrorCode: Int?
	var startedAt = Date()

	func startRecognition() {
		startedAt = Date()
		generation += 1
		let myGeneration = generation
		let req = makeRequest()
		// End the old request and cancel its task before swapping; any late callback
		// will be dropped by the generation check.
		let oldReq = box.value
		oldReq.endAudio()
		currentTask?.cancel()
		box.value = req
		currentTask = recognizer.recognitionTask(with: req) { result, error in
			DispatchQueue.main.async {
				guard myGeneration == generation else { return }
				if let result {
					let said = result.bestTranscription.formattedString
					if !said.isEmpty { currentText = said }
					emit(["kind": "partial", "text": currentText])
					lastErrorCode = nil
					silenceTimer?.cancel()
					let timer = DispatchWorkItem {
						if !currentText.isEmpty {
							emit(["kind": "final", "text": currentText])
						}
						currentText = ""
						startRecognition()
					}
					silenceTimer = timer
					DispatchQueue.main.asyncAfter(deadline: .now() + 1.5, execute: timer)
				} else if let error {
					if stopping { return }
					let e = error as NSError
					if e.domain == "kLSRErrorDomain" && e.code == 201 {
						fail("Writing down the huddle needs Dictation on. Turn it on in System Settings → Keyboard → Dictation, then leave the huddle and join again.")
					}
					if lastErrorCode == e.code && Date().timeIntervalSince(startedAt) < 2 {
						fail(error.localizedDescription)
					}
					lastErrorCode = e.code
					currentText = ""
					startRecognition()
				}
			}
		}
	}

	startRecognition()
	readAudio(into: { box.value.append($0) }, format: format)

	stopListening = {
		silenceTimer?.cancel()
		box.value.endAudio()
		currentTask?.cancel()
		DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
			if !currentText.isEmpty {
				emit(["kind": "final", "text": currentText])
			}
			exit(0)
		}
	}
}

/** Reads the call's sound from stdin until it closes, then stops. */
func readAudio(into append: @escaping (AVAudioPCMBuffer) -> Void, format: AVAudioFormat) {
	DispatchQueue.global().async {
		var pending = Data()
		while true {
			let chunk = FileHandle.standardInput.availableData
			if chunk.isEmpty { break }
			pending.append(chunk)
			let frames = pending.count / 4
			guard frames > 0, let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames)),
				let channel = buffer.floatChannelData?[0]
			else { continue }
			pending.withUnsafeBytes { raw in
				for i in 0..<frames { channel[i] = raw.loadUnaligned(fromByteOffset: i * 4, as: Float.self) }
			}
			buffer.frameLength = AVAudioFrameCount(frames)
			pending.removeFirst(frames * 4)
			// The current request is swapped on the main thread, so it is fed there too.
			DispatchQueue.main.async { append(buffer) }
		}
		DispatchQueue.main.async {
			stopping = true
			stopListening?()
		}
	}
}

let utterances = CommandLine.arguments.contains("--utterances")

// Stop can come while macOS is still asking for permission, so stdin is watched from the start.
// In a huddle stdin carries the sound, and its reader starts once listening has.
if !utterances {
	DispatchQueue.global().async {
		while readLine() != nil {}
		DispatchQueue.main.async {
			stopping = true
			guard let stopListening else { finish() }
			stopListening()
		}
	}
}

SFSpeechRecognizer.requestAuthorization { status in
	DispatchQueue.main.async {
		guard status == .authorized else {
			fail("Speech recognition is off for HyperIdle. Turn it on in System Settings → Privacy & Security → Speech Recognition.")
		}
		// In a huddle the page holds the microphone and sends its sound here.
		if utterances {
			listenUtterances()
			return
		}
		AVCaptureDevice.requestAccess(for: .audio) { granted in
			DispatchQueue.main.async {
				guard granted else {
					fail("The microphone is off for HyperIdle. Turn it on in System Settings → Privacy & Security → Microphone.")
				}
				listen()
			}
		}
	}
}
dispatchMain()
