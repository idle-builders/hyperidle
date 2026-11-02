// The desktop app's speech helper: listens to the microphone and writes down what is said, on this
// Mac only. Each result is one JSON line on stdout: {"kind":"partial"|"final","text"} or
// {"kind":"error","message"}. Closing stdin ends the recording; the last line is then "final".
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

/** Mutable reference wrapper: lets the audio tap closure capture a replaceable request by pointer. */
final class Box<T> {
	var value: T
	init(_ value: T) { self.value = value }
}

/**
 * Continuous utterance loop: 1.5 s of silence emits a `final`, swaps the recognition request
 * (no gap in the audio tap), and starts listening again. Runs until stdin closes.
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

	let engine = AVAudioEngine()
	let input = engine.inputNode

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
	// If the restarted task immediately fails with the same code, it is fatal.
	var lastErrorCode: Int?

	func startRecognition() {
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
						fail("Recording needs Dictation on. Turn it on in System Settings → Keyboard → Dictation, then press Record again.")
					}
					// One restart per distinct error; the same code twice in a row is fatal.
					if lastErrorCode == e.code {
						fail(error.localizedDescription)
					}
					lastErrorCode = e.code
					currentText = ""
					startRecognition()
				}
			}
		}
	}

	input.installTap(onBus: 0, bufferSize: 4096, format: input.outputFormat(forBus: 0)) { buffer, _ in
		box.value.append(buffer)
	}
	engine.prepare()
	do { try engine.start() } catch { fail("The microphone could not start: \(error.localizedDescription)") }

	startRecognition()

	stopListening = {
		silenceTimer?.cancel()
		engine.stop()
		input.removeTap(onBus: 0)
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

// Stop can come while macOS is still asking for permission, so stdin is watched from the start.
DispatchQueue.global().async {
	while readLine() != nil {}
	DispatchQueue.main.async {
		stopping = true
		guard let stopListening else { finish() }
		stopListening()
	}
}

SFSpeechRecognizer.requestAuthorization { status in
	DispatchQueue.main.async {
		guard status == .authorized else {
			fail("Speech recognition is off for HyperIdle. Turn it on in System Settings → Privacy & Security → Speech Recognition.")
		}
		AVCaptureDevice.requestAccess(for: .audio) { granted in
			DispatchQueue.main.async {
				guard granted else {
					fail("The microphone is off for HyperIdle. Turn it on in System Settings → Privacy & Security → Microphone.")
				}
				if CommandLine.arguments.contains("--utterances") {
					listenUtterances()
				} else {
					listen()
				}
			}
		}
	}
}
dispatchMain()
