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

async function startSpeech(threadId: string): Promise<void> {
	const speech = window.__HYPERIDLE__?.speech;
	if (!speech) return;
	await speech.start(
		(spoken) => {
			if (spoken.kind === "final" && spoken.text && activeHuddleId && activeThreadId) {
				void call("send_message", { threadId: activeThreadId, text: spoken.text });
			}
		},
		{ utterances: true },
	);
	speechStop = speech.stop.bind(speech);
}

/** Begin a huddle call. `alreadyJoined` are the people already present; offer to each. */
export async function startHuddleCall(
	huddleId: string,
	self: string,
	threadId: string,
	alreadyJoined: readonly string[],
): Promise<void> {
	activeHuddleId = huddleId;
	activeThreadId = threadId;
	activeSelf = self;

	localStream = await navigator.mediaDevices.getUserMedia({
		audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
	});

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

	void startSpeech(threadId);
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
		if (speechStop) void speechStop().finally(() => { speechStop = null; });
	} else if (activeThreadId) {
		void startSpeech(activeThreadId);
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
	localStream?.getTracks().forEach((t) => t.stop());
	localStream = null;
	stopSignalListener?.();
	stopSignalListener = null;
	if (speechStop) void speechStop().finally(() => { speechStop = null; });
	activeHuddleId = null;
	activeThreadId = null;
	activeSelf = null;
}
