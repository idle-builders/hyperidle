/**
 * Q1 §4.8: useRecipients hook.
 *
 * Fetches GET /api/recipients (optionally with ?q=<query>) and returns
 * the mapped recipient list. Uses apiFetch for API key injection.
 */

import { useCallback, useEffect, useRef, useState } from "react";
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

function isRecipient(value: unknown): value is Recipient {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.id === "string" &&
		(v.kind === "agent" || v.kind === "user") &&
		typeof v.name === "string" &&
		typeof v.role === "string" &&
		typeof v.status === "string" &&
		typeof v.hasActiveSession === "boolean" &&
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
				const valid = (body.recipients as unknown[]).filter(isRecipient);
				setRecipients(valid);
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
