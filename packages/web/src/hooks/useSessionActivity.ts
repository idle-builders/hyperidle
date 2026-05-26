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
 * @lore Q1: WebSocket subscription for session:<id> is not implemented in Q1
 * — the hook fetches REST snapshot only. WS upgrade is a follow-up. The hook
 * interface is future-proof: it exposes entries and summary which will be
 * populated by WS events in a follow-up story.
 */

import { useEffect, useRef, useState } from "react";

export interface ActivityEntry {
	type: "tool_call" | "reasoning" | "cost_tick";
	timestamp: number;
	data: Record<string, unknown>;
}

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

function isActivityEntry(value: unknown): value is ActivityEntry {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.type === "string" &&
		typeof v.timestamp === "number" &&
		typeof v.data === "object" &&
		v.data !== null
	);
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

		(async (): Promise<void> => {
			try {
				const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/activity`, {
					signal: ac.signal,
				});
				if (ac.signal.aborted) return;
				if (!res.ok) {
					setError(`HTTP ${res.status}`);
					setStatus("error");
					return;
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
				if (ac.signal.aborted) return;

				const validEntries = Array.isArray(body.activity)
					? (body.activity as unknown[]).filter(isActivityEntry)
					: [];
				setEntries(validEntries);

				// If session is already done, go straight to ended
				if (body.session?.state === "done") {
					setSummary({
						agentId: body.session.agentId,
						taskId: body.session.taskId,
						endedAt: null,
					});
					setStatus("ended");
				} else {
					setStatus("streaming");
				}
			} catch (cause) {
				if (ac.signal.aborted) return;
				if (cause instanceof Error && cause.name === "AbortError") return;
				setError(cause instanceof Error ? cause.message : "Network error");
				setStatus("error");
			}
		})();

		return () => {
			ac.abort();
		};
	}, [sessionId]);

	return { status, entries, summary, error };
}
