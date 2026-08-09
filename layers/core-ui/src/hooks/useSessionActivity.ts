/**
 * Q1 §4.7: useSessionActivity hook.
 *
 * Fetches GET /api/sessions/:id/activity for the initial activity snapshot,
 * then subscribes to the WebSocket topic session:<sessionId> for live updates.
 *
 * States:
 * - connecting: initial fetch in flight
 * - streaming: session is active, receiving events
 * - ended: session ended (session_ended event received or initial state=done)
 * - error: fetch or WS connection failed
 *
 * @lore Q1 review issue #5: WebSocket subscription is now implemented.
 * After the initial REST fetch, the hook subscribes to topic `session:<sessionId>`.
 * Incoming `tool_call_recorded` events are appended. `session_ended` transitions
 * to status "ended" with a summary. Cleanup unsubscribes on unmount.
 *
 * @lore Q1 review issue #9: ActivityEntry uses a discriminated union instead of
 * Record<string, unknown> so callers get precise types without unsafe casts.
 */

import type { ActivityEntry } from "@hyperidle/domain-model";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";
import { getSessionStreamClient } from "../services/ws-client.js";

// AM3: ActivityEntry is now the canonical type from @hyperidle/shared.
// Re-export for existing callers.
export type { ActivityEntry } from "@hyperidle/domain-model";
export type ToolCallData = Extract<ActivityEntry, { type: "tool_call" }>["data"];
export type ReasoningData = Extract<ActivityEntry, { type: "reasoning" }>["data"];

export interface SessionSummary {
	agentId: string;
	taskId: string;
	endedAt: string | null;
}

export type SessionActivityStatus = "connecting" | "streaming" | "ended" | "error";

export interface UseSessionActivityResult {
	status: SessionActivityStatus;
	entries: ReadonlyArray<ActivityEntry>;
	summary: SessionSummary | null;
	error: string | null;
}

function isToolCallData(data: unknown): data is ToolCallData {
	if (typeof data !== "object" || data === null) return false;
	const d = data as Record<string, unknown>;
	return typeof d.toolName === "string" && typeof d.argsSummary === "string";
}

function isReasoningData(data: unknown): data is ReasoningData {
	if (typeof data !== "object" || data === null) return false;
	const d = data as Record<string, unknown>;
	return typeof d.excerpt === "string";
}

function parseActivityEntry(value: unknown): ActivityEntry | null {
	if (typeof value !== "object" || value === null) return null;
	const v = value as Record<string, unknown>;
	if (typeof v.type !== "string" || typeof v.timestamp !== "number") return null;

	if (v.type === "tool_call" && isToolCallData(v.data)) {
		return { type: "tool_call", timestamp: v.timestamp, data: v.data };
	}
	if (v.type === "reasoning" && isReasoningData(v.data)) {
		return { type: "reasoning", timestamp: v.timestamp, data: v.data };
	}
	return null;
}

// Maximum number of activity entries to keep client-side (FIFO eviction)
const MAX_CLIENT_ENTRIES = 200;

// ---------------------------------------------------------------------------
// WS message handler (extracted to reduce cognitive complexity in the hook)
// ---------------------------------------------------------------------------

interface WsHandlerCallbacks {
	setEntries: React.Dispatch<React.SetStateAction<ReadonlyArray<ActivityEntry>>>;
	setSummary: React.Dispatch<React.SetStateAction<SessionSummary | null>>;
	setStatus: React.Dispatch<React.SetStateAction<SessionActivityStatus>>;
	getAborted: () => boolean;
}

function appendEntry(
	entry: ActivityEntry,
	setEntries: React.Dispatch<React.SetStateAction<ReadonlyArray<ActivityEntry>>>,
): void {
	setEntries((prev) => {
		const next = [...prev, entry];
		return next.length > MAX_CLIENT_ENTRIES ? next.slice(-MAX_CLIENT_ENTRIES) : next;
	});
}

function handleSessionEnded(
	msg: Record<string, unknown>,
	callbacks: Pick<WsHandlerCallbacks, "setSummary" | "setStatus">,
): void {
	const agentId = typeof msg.agentId === "string" ? msg.agentId : "";
	const taskId = typeof msg.taskId === "string" ? msg.taskId : "";
	const endedAt = typeof msg.timestamp === "number" ? new Date(msg.timestamp).toISOString() : null;
	callbacks.setSummary({ agentId, taskId, endedAt });
	callbacks.setStatus("ended");
}

function handleToolCallRecorded(
	msg: Record<string, unknown>,
	setEntries: React.Dispatch<React.SetStateAction<ReadonlyArray<ActivityEntry>>>,
): void {
	const entry = parseActivityEntry({
		type: "tool_call",
		timestamp: typeof msg.timestamp === "number" ? msg.timestamp : Date.now(),
		data: { toolName: msg.toolName ?? "", argsSummary: msg.argsSummary ?? "" },
	});
	if (entry) {
		appendEntry(entry, setEntries);
	}
}

function makeWsMessageHandler(callbacks: WsHandlerCallbacks): (data: unknown) => void {
	return (data: unknown) => {
		if (callbacks.getAborted()) return;
		if (typeof data !== "object" || data === null) return;
		const msg = data as Record<string, unknown>;
		if (msg.type === "session_ended") {
			handleSessionEnded(msg, callbacks);
		} else if (msg.type === "tool_call_recorded") {
			handleToolCallRecorded(msg, callbacks.setEntries);
		}
	};
}

// ---------------------------------------------------------------------------
// Fetch helper (extracted to reduce cognitive complexity in the hook)
// ---------------------------------------------------------------------------

type FetchFailure = { ok: false; error: string };
type FetchSuccess = {
	ok: true;
	entries: ActivityEntry[];
	sessionState: string;
	sessionMeta: { agentId: string; taskId: string };
};
type FetchResult = FetchFailure | FetchSuccess;

async function fetchSessionActivity(sessionId: string, signal: AbortSignal): Promise<FetchResult> {
	const res = await apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}/activity`, { signal });
	if (!res.ok) {
		return { ok: false, error: `HTTP ${res.status}` };
	}
	const body = (await res.json()) as {
		session?: {
			id: string;
			agentId: string;
			taskId: string;
			state: string;
			startedAt: string;
			modelTier: string;
		};
		activity?: unknown[];
	};

	const entries: ActivityEntry[] = Array.isArray(body.activity)
		? (body.activity as unknown[]).flatMap((e) => {
				const parsed = parseActivityEntry(e);
				return parsed ? [parsed] : [];
			})
		: [];

	return {
		ok: true,
		entries,
		sessionState: body.session?.state ?? "active",
		sessionMeta: {
			agentId: body.session?.agentId ?? "",
			taskId: body.session?.taskId ?? "",
		},
	};
}

/**
 * Subscribe to session activity for the given session id.
 */
export function useSessionActivity(sessionId: string): UseSessionActivityResult {
	const [status, setStatus] = useState<SessionActivityStatus>("connecting");
	const [entries, setEntries] = useState<ReadonlyArray<ActivityEntry>>([]);
	const [summary, setSummary] = useState<SessionSummary | null>(null);
	const [error, setError] = useState<string | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	useEffect(() => {
		const ac = new AbortController();
		abortRef.current?.abort();
		abortRef.current = ac;
		setStatus("connecting");
		setError(null);
		setSummary(null);

		let unsubscribe: (() => void) | null = null;

		fetchSessionActivity(sessionId, ac.signal)
			.then((result) => {
				if (ac.signal.aborted) return;
				if (!result.ok) {
					setError(result.error);
					setStatus("error");
					return;
				}
				setEntries(result.entries);

				if (result.sessionState === "done") {
					setSummary({ ...result.sessionMeta, endedAt: null });
					setStatus("ended");
					return;
				}

				setStatus("streaming");

				// Q1 §4.7 / review issue #5: subscribe to WebSocket topic for live updates.
				// @lore AU26 J3: `session:<id>` is served by agent-orchestration's own
				// socket now, not core-api's — the Layer that owns the run owns its live
				// stream. Founder: *"session dial in is 1000% orchestration."*
				const wsClient = getSessionStreamClient();
				const handler = makeWsMessageHandler({
					setEntries,
					setSummary,
					setStatus,
					getAborted: () => ac.signal.aborted,
				});
				unsubscribe = wsClient.subscribe(`session:${sessionId}`, handler);
			})
			.catch((cause) => {
				if (ac.signal.aborted) return;
				if (cause instanceof Error && cause.name === "AbortError") return;
				setError(cause instanceof Error ? cause.message : "Network error");
				setStatus("error");
			});

		return () => {
			ac.abort();
			// Q1 review issue #5: unsubscribe from WebSocket topic on unmount
			if (unsubscribe) {
				unsubscribe();
			}
		};
	}, [sessionId]);

	return { status, entries, summary, error };
}
