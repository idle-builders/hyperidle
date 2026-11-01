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
				heard = result.bestTranscription.formattedString
				if result.isFinal { finish() }
				emit(["kind": "partial", "text": heard])
			} else if let error {
				// Ending with nothing said reports an error; that is an empty recording, not a failure.
				if stopping { finish() }
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
				listen()
			}
		}
	}
}
dispatchMain()
