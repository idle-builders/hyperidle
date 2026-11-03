/**
 * WebRTC huddle call: one RTCPeerConnection per remote participant. The joiner offers to
 * everyone already in the huddle; already-joined peers answer. Signaling travels over the WS
 * layer. ICE candidates arriving before the remote SDP is set are queued and flushed after.
 */
import { call } from "./api";
import { onSignal, sendSignal } from "./live";

const ICE_SERVERS: RTCConfiguration = {
	iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
};

const peers = new Map<string, RTCPeerConnection>();
let onSpeechErrorCallback: ((message: string) => void) | null = null;

/** Subscribe to speech errors during a call (e.g. Dictation off). Pass null to unsubscribe. */
export function onHuddleSpeechError(cb: ((message: string) => void) | null): void {
	onSpeechErrorCallback = cb;
}

const callChangeListeners = new Set<() => void>();

function notifyCallChange(): void {
	for (const cb of callChangeListeners) cb();
}

/**
 * Subscribe to call state changes — fires whenever the active huddle id is set or cleared.
 * Returns an unsubscribe function, compatible with useSyncExternalStore.
 */
export function onCallChange(cb: () => void): () => void {
	callChangeListeners.add(cb);
	return () => {
		callChangeListeners.delete(cb);
	};
}
/** ICE candidates that arrived before setRemoteDescription; flushed once SDP is set. */
const iceCandidateQueues = new Map<string, RTCIceCandidateInit[]>();
const remoteAudios = new Map<string, HTMLAudioElement>();
let localStream: MediaStream | null = null;
let stopSignalListener: (() => void) | null = null;
let activeHuddleId: string | null = null;
let activeThreadId: string | null = null;
let activeSelf: string | null = null;
let speechStop: (() => Promise<void>) | null = null;

export function getActiveHuddleId(): string | null {
	return activeHuddleId;
}

/** False while the call waits for the microphone, which macOS may be asking the person about. */
export function isMicOpen(): boolean {
	return localStream !== null;
}

function makeConnection(huddleId: string, remoteId: string): RTCPeerConnection {
	const pc = new RTCPeerConnection(ICE_SERVERS);
	peers.set(remoteId, pc);
	iceCandidateQueues.set(remoteId, []);

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

	return pc;
}

async function flushCandidates(remoteId: string, pc: RTCPeerConnection): Promise<void> {
	const q = iceCandidateQueues.get(remoteId) ?? [];
	iceCandidateQueues.set(remoteId, []);
	for (const c of q) {
		await pc.addIceCandidate(new RTCIceCandidate(c));
	}
}

async function handleSignal(from: string, huddleId: string, data: unknown): Promise<void> {
	if (huddleId !== activeHuddleId || from === activeSelf) return;
	const msg = data as {
		type?: string;
		sdp?: RTCSessionDescriptionInit;
		candidate?: RTCIceCandidateInit;
	};

	if (msg.type === "offer") {
		let pc = peers.get(from);
		if (!pc) pc = makeConnection(huddleId, from);
		await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp as RTCSessionDescriptionInit));
		await flushCandidates(from, pc);
		const answer = await pc.createAnswer();
		await pc.setLocalDescription(answer);
		sendSignal(huddleId, from, { type: "answer", sdp: pc.localDescription });
	} else if (msg.type === "answer") {
		const pc = peers.get(from);
		if (!pc) return;
		await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp as RTCSessionDescriptionInit));
		await flushCandidates(from, pc);
	} else if (msg.type === "candidate" && msg.candidate) {
		const pc = peers.get(from);
		if (pc?.remoteDescription) {
			await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
		} else {
			const q = iceCandidateQueues.get(from) ?? [];
			q.push(msg.candidate);
			iceCandidateQueues.set(from, q);
		}
	}
}

async function startSpeech(): Promise<void> {
	const speech = window.__HYPERIDLE__?.speech;
	if (!speech) return;
	await speech.start(
		(spoken) => {
			if (spoken.kind === "error") {
				onSpeechErrorCallback?.(spoken.message);
			} else if (spoken.kind === "final" && spoken.text && activeHuddleId && activeThreadId) {
				void call("send_message", { threadId: activeThreadId, text: spoken.text });
			}
		},
		{ utterances: true },
	);
	speechStop = speech.stop.bind(speech);
}

/**
 * Begin a huddle call. `alreadyJoined` are the people already present; offer to each.
 * Returns why the call could not start (the microphone did not open), or null once it runs. A call
 * without a microphone leaves the huddle, so nobody waits on a silent person.
 */
export async function startHuddleCall(
	huddleId: string,
	self: string,
	threadId: string,
	alreadyJoined: readonly string[],
): Promise<string | null> {
	activeHuddleId = huddleId;
	activeThreadId = threadId;
	activeSelf = self;
	notifyCallChange();

	try {
		localStream = await navigator.mediaDevices.getUserMedia({
			audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
		});
	} catch (error) {
		activeHuddleId = null;
		activeThreadId = null;
		activeSelf = null;
		notifyCallChange();
		await call("adjust_thread", { id: threadId, message: { id: huddleId, huddle: "leave" } });
		return error instanceof DOMException && error.name === "NotAllowedError"
			? "The microphone is off for HyperIdle. Turn it on in System Settings → Privacy & Security → Microphone, then join again."
			: `The microphone could not start: ${error instanceof Error ? error.message : String(error)}`;
	}

	stopSignalListener = onSignal((from, hId, data) => {
		void handleSignal(from, hId, data);
	});

	for (const remoteId of alreadyJoined) {
		if (remoteId === self) continue;
		const pc = makeConnection(huddleId, remoteId);
		const offer = await pc.createOffer();
		await pc.setLocalDescription(offer);
		sendSignal(huddleId, remoteId, { type: "offer", sdp: pc.localDescription });
	}

	notifyCallChange();
	void startSpeech();
	return null;
}

/**
 * Called whenever the huddle payload changes. Closes connections to people who have left;
 * new joiners will send an offer so no action needed here for them.
 */
export function updateHuddlePeople(
	people: readonly { readonly id: string; readonly leftAt: string | null }[],
): void {
	if (!activeHuddleId) return;
	const stillIn = new Set(people.filter((p) => p.leftAt === null).map((p) => p.id));
	for (const [remoteId, pc] of peers) {
		if (!stillIn.has(remoteId)) {
			pc.close();
			peers.delete(remoteId);
			iceCandidateQueues.delete(remoteId);
			const audio = remoteAudios.get(remoteId);
			if (audio) {
				audio.srcObject = null;
				audio.remove();
				remoteAudios.delete(remoteId);
			}
		}
	}
}

/** Mute or unmute: disable local audio tracks and pause/resume speech recognition. */
export function muteHuddleCall(nowMuted: boolean): void {
	if (localStream) {
		for (const track of localStream.getAudioTracks()) {
			track.enabled = !nowMuted;
		}
	}
	if (nowMuted) {
		if (speechStop)
			void speechStop().finally(() => {
				speechStop = null;
			});
	} else if (activeThreadId) {
		void startSpeech();
	}
}

/** Close all peer connections and stop local audio. */
export function stopHuddleCall(): void {
	for (const pc of peers.values()) pc.close();
	peers.clear();
	iceCandidateQueues.clear();
	for (const [, audio] of remoteAudios) {
		audio.srcObject = null;
		audio.remove();
	}
	remoteAudios.clear();
	for (const t of localStream?.getTracks() ?? []) t.stop();
	localStream = null;
	stopSignalListener?.();
	stopSignalListener = null;
	if (speechStop)
		void speechStop().finally(() => {
			speechStop = null;
		});
	activeHuddleId = null;
	activeThreadId = null;
	activeSelf = null;
	notifyCallChange();
}
