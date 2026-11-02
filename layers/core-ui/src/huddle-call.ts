/**
 * WebRTC huddle call: one RTCPeerConnection per remote participant. The later joiner
 * offers to everyone already in the huddle. Signaling travels over the WS layer.
 */
import { onSignal, sendSignal } from "./live";

const ICE_SERVERS: RTCConfiguration = {
	iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
};

/** One connection per remote identity. */
const peers = new Map<string, RTCPeerConnection>();
const remoteAudios = new Map<string, HTMLAudioElement>();
let localStream: MediaStream | null = null;
let stopSignalListener: (() => void) | null = null;
let activeHuddleId: string | null = null;
let activeSelf: string | null = null;
let onReloadRef: (() => void) | null = null;
let speechStop: (() => Promise<void>) | null = null;

function makeConnection(huddleId: string, remoteId: string, polite: boolean): RTCPeerConnection {
	const pc = new RTCPeerConnection(ICE_SERVERS);
	peers.set(remoteId, pc);

	if (localStream) {
		for (const track of localStream.getTracks()) pc.addTrack(track, localStream);
	}

	pc.ontrack = (evt) => {
		let audio = remoteAudios.get(remoteId);
		if (!audio) {
			audio = document.createElement("audio");
			audio.autoplay = true;
			document.body.appendChild(audio);
			remoteAudios.set(remoteId, audio);
		}
		audio.srcObject = evt.streams[0] ?? null;
	};

	pc.onicecandidate = (evt) => {
		if (evt.candidate) {
			sendSignal(huddleId, remoteId, { type: "candidate", candidate: evt.candidate });
		}
	};

	pc.onnegotiationneeded = async () => {
		if (!polite) return;
		try {
			const offer = await pc.createOffer();
			await pc.setLocalDescription(offer);
			sendSignal(huddleId, remoteId, { type: "offer", sdp: pc.localDescription });
		} catch {
			// Negotiation race; retry on next onnegotiationneeded
		}
	};

	return pc;
}

async function handleSignal(from: string, huddleId: string, data: unknown): Promise<void> {
	if (huddleId !== activeHuddleId || from === activeSelf) return;
	const msg = data as { type?: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
	let pc = peers.get(from);
	if (!pc) {
		// We are already joined; the newcomer will offer — we answer (polite = false for answerer).
		pc = makeConnection(huddleId, from, false);
	}
	if (msg.type === "offer") {
		await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp as RTCSessionDescriptionInit));
		const answer = await pc.createAnswer();
		await pc.setLocalDescription(answer);
		sendSignal(huddleId, from, { type: "answer", sdp: pc.localDescription });
	} else if (msg.type === "answer") {
		await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp as RTCSessionDescriptionInit));
	} else if (msg.type === "candidate" && msg.candidate) {
		await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
	}
}

async function startSpeech(): Promise<void> {
	const speech = window.__HYPERIDLE__?.speech;
	if (!speech) return;
	await speech.start(({ text }) => {
		// Continuous transcript loop — the text is spoken words for this huddle.
		void sendSignalTranscript(text);
	});
	speechStop = speech.stop.bind(speech);
}

async function sendSignalTranscript(text: string): Promise<void> {
	if (!activeHuddleId || !activeSelf) return;
	// Broadcast transcript to all peers in the call.
	for (const peerId of peers.keys()) {
		sendSignal(activeHuddleId, peerId, { type: "transcript", text, from: activeSelf });
	}
}

/** Begin a huddle call. `alreadyJoined` should be the other people currently in the huddle. */
export async function startHuddleCall(
	huddleId: string,
	self: string,
	_threadId: string,
	onReload: () => void,
): Promise<void> {
	activeHuddleId = huddleId;
	activeSelf = self;
	onReloadRef = onReload;

	localStream = await navigator.mediaDevices.getUserMedia({
		audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
	});

	stopSignalListener = onSignal((from, hId, data) => {
		void handleSignal(from, hId, data);
	});

	// Start speech transcription loop.
	void startSpeech();
}

/** Close all peer connections and stop local audio. */
export function stopHuddleCall(): void {
	for (const pc of peers.values()) pc.close();
	peers.clear();
	for (const [, audio] of remoteAudios) {
		audio.srcObject = null;
		audio.remove();
	}
	remoteAudios.clear();
	localStream?.getTracks().forEach((t) => t.stop());
	localStream = null;
	stopSignalListener?.();
	stopSignalListener = null;
	if (speechStop) void speechStop().finally(() => { speechStop = null; });
	activeHuddleId = null;
	activeSelf = null;
	onReloadRef = null;
}
