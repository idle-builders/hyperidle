/**
 * useSessionActivity — a session's row + activity buffer, kept live by the
 * `session:<id>` websocket nudge.
 *
 * @lore `GET /api/sessions/:id/activity` and the
 * second websocket are both gone. The hook now calls `call("watch_session",
 * { id })` — `POST /api/actions/watch_session`, the same door a person's
 * client and an agent's MCP tool use — and re-runs it on every frame for
 * `session:<id>`, the `useDocument.ts` nudge-and-refetch shape verbatim. The
 * nudge carries no content (`{type:"update", topic:"session:<id>",
 * kind:"session.activity", data:{sessionId}}`); this hook only reacts to the
 * topic matching, never reads `data`.
 *
 * @lore `stop_session`'s answer is the row as it
 * stood the moment it was asked, not the terminal state — a live session's
 * harness process is killed and the row is marked by normal teardown
 * afterwards, reaching the browser as this same nudge. This hook never reads
 * a `stop_session` response; "ended" only ever comes from a re-run
 * `watch_session` reporting the row is no longer `active`.
 */

import type { ActivityEntry, SessionRow } from "@hyperidle/domain-model";
import { useEffect, useRef, useState } from "react";
import { call } from "../services/call.js";
import { getWsClient } from "../services/ws-client.js";

export type { ActivityEntry } from "@hyperidle/domain-model";
export type ToolCallData = Extract<ActivityEntry, { type: "tool_call" }>["data"];

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

// Maximum number of activity entries kept client-side (FIFO — the tail is
// what a viewer opening mid-stream needs).
const MAX_CLIENT_ENTRIES = 200;

function statusFor(session: SessionRow): SessionActivityStatus {
	return session.state === "active" ? "streaming" : "ended";
}

/**
 * `summary` stays `null` while the session is active — Conversations.tsx's
 * `resolveSessionAgentAuthor` depends on that to fall back to a generic
 * agent placeholder rather than a possibly-stale id.
 */
function summaryFor(session: SessionRow): SessionSummary | null {
	if (session.state === "active") return null;
	return { agentId: session.agentId, taskId: session.taskId ?? "", endedAt: session.endedAt };
}

/**
 * Subscribe to a session's row + activity, kept live by the session's nudge
 * topic.
 */
export function useSessionActivity(sessionId: string): UseSessionActivityResult {
	const [status, setStatus] = useState<SessionActivityStatus>("connecting");
	const [entries, setEntries] = useState<ReadonlyArray<ActivityEntry>>([]);
	const [summary, setSummary] = useState<SessionSummary | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [tick, setTick] = useState(0);
	const cancelledRef = useRef(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `tick` is intentionally a dependency — bumping it via the nudge subscription re-runs watch_session.
	useEffect(() => {
		let cancelled = false;
		setStatus("connecting");
		setError(null);

		call("watch_session", { id: sessionId })
			.then((result) => {
				if (cancelled) return;
				if (!result.ok) {
					setError(result.problems[0]?.message ?? "Failed to load session");
					setStatus("error");
					return;
				}
				setEntries(result.data.activity.slice(-MAX_CLIENT_ENTRIES));
				setSummary(summaryFor(result.data.session));
				setStatus(statusFor(result.data.session));
			})
			.catch((cause: unknown) => {
				if (cancelled) return;
				setError(cause instanceof Error ? cause.message : "Network error");
				setStatus("error");
			});

		return () => {
			cancelled = true;
		};
	}, [sessionId, tick]);

	// Nudge subscription — a frame on `session:<id>` means "something about
	// this session changed"; the hook re-runs its own `watch_session` rather
	// than applying a partial update.
	useEffect(() => {
		cancelledRef.current = false;
		const ws = getWsClient();
		const topic = `session:${sessionId}`;
		const unsubscribe = ws.subscribe(topic, (raw) => {
			if (typeof raw !== "object" || raw === null) return;
			const msg = raw as Record<string, unknown>;
			if (msg.type !== "update" || msg.topic !== topic) return;
			if (!cancelledRef.current) setTick((n) => n + 1);
		});
		return (): void => {
			cancelledRef.current = true;
			unsubscribe();
		};
	}, [sessionId]);

	return { status, entries, summary, error };
}
