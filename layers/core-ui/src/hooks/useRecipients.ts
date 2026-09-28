import type { SessionRow, UserRow } from "@hyperidle/domain-model";
import { useCallback, useEffect, useRef, useState } from "react";
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

function toRecipient(row: UserRow): Omit<Recipient, "hasActiveSession"> {
	return {
		id: row.id,
		kind: row.kind === "ai" ? "agent" : "user",
		name: row.name,
		role: row.role,
		status: row.status,
		avatarUrl: row.avatarUrl,
	};
}

/**
 * `search_sessions` defaults to 100 with no `limit` set; 500 (the action's
 * max) is the closest this read can get to "every active session".
 */
const MAX_ACTIVE_SESSIONS = 500;

function countActiveSessions(rows: ReadonlyArray<SessionRow>): Readonly<Record<string, number>> {
	const counts: Record<string, number> = {};
	for (const row of rows) {
		counts[row.agentId] = (counts[row.agentId] ?? 0) + 1;
	}
	return counts;
}

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
				const [result, counts] = await Promise.all([
					call("search_users", { status: "active", ...(query ? { name: query } : {}) }, ac.signal),
					fetchActiveSessionCounts(ac.signal),
				]);
				if (ac.signal.aborted) return;
				if (!result.ok) {
					setError(result.problems[0]?.message ?? "Failed to load recipients");
					setStatus("error");
					return;
				}
				setRecipients(
					result.data.map((row) => ({
						...toRecipient(row),
						hasActiveSession: (counts[row.id] ?? 0) > 0,
					})),
				);
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
