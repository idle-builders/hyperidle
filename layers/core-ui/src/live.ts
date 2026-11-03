import { post } from "./api";

/**
 * One WebSocket for the whole app. A screen listens on topics (`conversations`, `tasks`,
 * `documents`, `thread:<id>`, `task:<id>`, `document:<id>`, `user:<id>`) and is nudged when one
 * changes; it then asks the server again. After a dropped connection every listener is nudged,
 * since what changed meanwhile was missed.
 */
type Nudge = () => void;
type SignalHandler = (from: string, huddleId: string, data: unknown) => void;

const listeners = new Map<string, Set<Nudge>>();
const signalHandlers = new Set<SignalHandler>();
const disconnectHandlers = new Set<() => void>();
const RETRY_MS = [1000, 2000, 4000, 8000, 15000];
let socket: WebSocket | null = null;
let connecting = false;
let failures = 0;
let wasOpen = false;

function send(message: { type: "subscribe" | "unsubscribe"; topic: string }): void {
	if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function nudgeAll(): void {
	for (const set of listeners.values()) for (const nudge of set) nudge();
}

function retry(): void {
	if (listeners.size === 0) return;
	setTimeout(connect, RETRY_MS[Math.min(failures, RETRY_MS.length - 1)]);
	failures++;
}

async function connect(): Promise<void> {
	if (socket || connecting || listeners.size === 0) return;
	connecting = true;
	const res = await post("/api/auth/ws-token").catch(() => null);
	const token = res?.ok ? ((await res.json()) as { token?: string }).token : undefined;
	connecting = false;
	if (!token) return retry();

	const scheme = window.location.protocol === "https:" ? "wss" : "ws";
	const ws = new WebSocket(
		`${scheme}://${window.location.host}/api/ws?token=${encodeURIComponent(token)}`,
	);
	socket = ws;
	let opened = false;
	ws.onopen = () => {
		opened = true;
		failures = 0;
		for (const topic of listeners.keys()) send({ type: "subscribe", topic });
		if (wasOpen) nudgeAll();
		wasOpen = true;
	};
	ws.onmessage = (event) => {
		if (typeof event.data !== "string") return;
		const message = JSON.parse(event.data) as {
			type?: string;
			topic?: string;
			from?: string;
			huddleId?: string;
			data?: unknown;
		};
		if (message.type === "signal" && message.from && message.huddleId) {
			for (const handler of signalHandlers)
				handler(message.from, message.huddleId, message.data ?? null);
			return;
		}
		if (message.type !== "update" || !message.topic) return;
		for (const nudge of listeners.get(message.topic) ?? []) nudge();
	};
	ws.onclose = () => {
		socket = null;
		if (opened) for (const handler of disconnectHandlers) handler();
		retry();
	};
}

/** Register a handler for WebRTC signaling messages. Returns the way to remove it. */
export function onSignal(handler: SignalHandler): () => void {
	signalHandlers.add(handler);
	return () => signalHandlers.delete(handler);
}

/** Be told when an open connection drops. Returns the way to stop. */
export function onDisconnect(handler: () => void): () => void {
	disconnectHandlers.add(handler);
	return () => disconnectHandlers.delete(handler);
}

/** Send a WebRTC signal to another identity in the same huddle. */
export function sendSignal(huddleId: string, to: string, data: unknown): void {
	if (socket?.readyState === WebSocket.OPEN) {
		socket.send(JSON.stringify({ type: "signal", huddleId, to, data }));
	}
}

/** Be nudged whenever one of `topics` changes. Returns the way to stop. */
export function listen(topics: readonly string[], nudge: Nudge): () => void {
	for (const topic of topics) {
		const set = listeners.get(topic) ?? new Set();
		if (set.size === 0) send({ type: "subscribe", topic });
		set.add(nudge);
		listeners.set(topic, set);
	}
	void connect();
	return () => {
		for (const topic of topics) {
			const set = listeners.get(topic);
			set?.delete(nudge);
			if (set?.size === 0) {
				listeners.delete(topic);
				send({ type: "unsubscribe", topic });
			}
		}
	};
}
