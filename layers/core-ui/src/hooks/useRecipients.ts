/**
 * Q1 §4.8: useRecipients hook.
 *
 * Fetches GET /api/recipients (optionally with ?q=<query>) and returns
 * the mapped recipient list. Uses apiFetch for API key injection.
 *
 * @lore AU26 J4: `hasActiveSession` no longer rides on the core-api response —
 * core-api stopped reading `agent-orchestration`'s `sessions` table.
 *
 * @lore `GET /api/agent-orchestration/runs/active-counts` is deleted; the
 * hook now calls `search_sessions({ state: "active" })` — `POST
 * /api/actions/search_sessions`, the same door a person's client and an
 * agent's MCP tool use — alongside the recipient list, and counts the active
 * rows per agent itself, so the picker's live busy dot renders exactly as
 * before. An active-session read failure degrades to "nobody is busy" rather
 * than failing the picker, which is core's data and stands on its own.
 */

import type { SessionRow } from "@hyperidle/domain-model";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";
import { call } from "../services/call.js";

export interface Recipient {
	id: string;
	kind: "agent" | "user";
	name: string;
	role: string;
	status: string;
	hasActiveSession: boolean;
	avatarUrl: string | null;
}

export interface UseRecipientsResult {
	status: "loading" | "ready" | "error";
	recipients: ReadonlyArray<Recipient>;
	error: string | null;
	retry: () => void;
}

/** The core-api half of a recipient — everything except the live busy flag. */
type RecipientBase = Omit<Recipient, "hasActiveSession">;

function isRecipientBase(value: unknown): value is RecipientBase {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.id === "string" &&
		(v.kind === "agent" || v.kind === "user") &&
		typeof v.name === "string" &&
		typeof v.role === "string" &&
		typeof v.status === "string" &&
		(v.avatarUrl === null || typeof v.avatarUrl === "string")
	);
}

/**
 * `search_sessions` defaults to 100 with no `limit` set; the old route had no
 * cap at all. 500 (the action's max) is the closest this read can get to
 * "every active session" under the new contract.
 */
const MAX_ACTIVE_SESSIONS = 500;

/** Active session count per agent, from the rows `search_sessions` answers. */
function countActiveSessions(rows: ReadonlyArray<SessionRow>): Readonly<Record<string, number>> {
	const counts: Record<string, number> = {};
	for (const row of rows) {
		counts[row.agentId] = (counts[row.agentId] ?? 0) + 1;
	}
	return counts;
}

/**
 * Active session counts keyed by agent id, degrading to "nobody is busy" on
 * any failure — the recipient list is core's data and stands on its own.
 */
async function fetchActiveSessionCounts(
	signal: AbortSignal,
): Promise<Readonly<Record<string, number>>> {
	try {
		const result = await call(
			"search_sessions",
			{ state: "active", limit: MAX_ACTIVE_SESSIONS },
			signal,
		);
		return result.ok ? countActiveSessions(result.data) : {};
	} catch {
		return {};
	}
}

/**
 * Fetch the recipient list from GET /api/recipients.
 *
 * @param query - Optional search query forwarded as ?q=<query>.
 */
export function useRecipients(query?: string): UseRecipientsResult {
	const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
	const [recipients, setRecipients] = useState<ReadonlyArray<Recipient>>([]);
	const [error, setError] = useState<string | null>(null);
	const [tick, setTick] = useState(0);
	const abortRef = useRef<AbortController | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: tick is intentionally a dependency for retry()
	useEffect(() => {
		const ac = new AbortController();
		abortRef.current?.abort();
		abortRef.current = ac;
		setStatus("loading");
		setError(null);

		(async (): Promise<void> => {
			try {
				const url = query ? `/api/recipients?q=${encodeURIComponent(query)}` : "/api/recipients";
				// @lore AU26 review W4: the two reads are INDEPENDENT — core-api's
				// recipient list and the active-session count — so they go out
				// together. Awaiting the count after the list resolved made the
				// picker two serial round-trips for no reason.
				const [res, counts] = await Promise.all([
					apiFetch(url, { signal: ac.signal }),
					fetchActiveSessionCounts(ac.signal),
				]);
				if (ac.signal.aborted) return;
				if (!res.ok) {
					setError(`HTTP ${res.status}`);
					setStatus("error");
					return;
				}
				const body = (await res.json()) as { recipients?: unknown };
				if (ac.signal.aborted) return;
				if (!Array.isArray(body.recipients)) {
					setError("Malformed response");
					setStatus("error");
					return;
				}
				const valid = (body.recipients as unknown[]).filter(isRecipientBase);
				setRecipients(valid.map((r) => ({ ...r, hasActiveSession: (counts[r.id] ?? 0) > 0 })));
				setStatus("ready");
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
	}, [query, tick]);

	const retry = useCallback((): void => {
		setTick((n) => n + 1);
	}, []);

	return { status, recipients, error, retry };
}
