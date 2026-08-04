/**
 * Q1 §4.8: useRecipients hook.
 *
 * Fetches GET /api/recipients (optionally with ?q=<query>) and returns
 * the mapped recipient list. Uses apiFetch for API key injection.
 *
 * @lore AU26 J4: `hasActiveSession` no longer rides on the core-api response —
 * core-api stopped reading `agent-orchestration`'s `sessions` table. The hook
 * now fetches `GET /api/agent-orchestration/runs/active-counts` alongside the
 * recipient list and stamps the flag itself, so the picker's live busy dot
 * renders exactly as before. A run-count failure degrades to "nobody is busy"
 * rather than failing the picker, which is core's data and stands on its own.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchActiveRunCounts } from "../services/agent-runs.js";
import { apiFetch } from "../services/api-fetch.js";

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
				const res = await apiFetch(url, { signal: ac.signal });
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
				const counts: Readonly<Record<string, number>> = await fetchActiveRunCounts(
					undefined,
					ac.signal,
				).catch(() => ({}));
				if (ac.signal.aborted) return;
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
