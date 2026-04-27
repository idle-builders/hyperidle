/**
 * L10 — first-run status hook.
 *
 * Wraps `GET /api/first-run/status`. Returns the four flags + helpers
 * that POST to each step. Surfaces in <App /> redirect logic and inside
 * <FirstRunFlow />.
 *
 * @lore L10: a single hook owns the cache so the gating redirect and the
 * flow page never disagree about state. `refresh()` is awaited by every
 * step submitter so the next render reflects the new flag.
 */
import { useCallback, useEffect, useState } from "react";

export interface FirstRunStatus {
	readonly factoryReady: boolean;
	readonly apiKeyReady: boolean;
	readonly apiKeyLast4: string | null;
	readonly northStarReady: boolean;
	readonly teamScaffoldHandled: boolean;
	readonly complete: boolean;
}

interface UseFirstRunResult {
	status: FirstRunStatus | null;
	loading: boolean;
	error: Error | null;
	refresh: () => Promise<void>;
}

function parseStatus(json: unknown): FirstRunStatus {
	if (!json || typeof json !== "object") throw new Error("Invalid first-run status");
	const r = json as Record<string, unknown>;
	const bool = (k: string): boolean => r[k] === true;
	const last4 = r.apiKeyLast4;
	return {
		factoryReady: bool("factoryReady"),
		apiKeyReady: bool("apiKeyReady"),
		apiKeyLast4: typeof last4 === "string" ? last4 : null,
		northStarReady: bool("northStarReady"),
		teamScaffoldHandled: bool("teamScaffoldHandled"),
		complete: bool("complete"),
	};
}

export function useFirstRun(): UseFirstRunResult {
	const [status, setStatus] = useState<FirstRunStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	const refresh = useCallback(async (): Promise<void> => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/first-run/status");
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const json: unknown = await res.json();
			setStatus(parseStatus(json));
		} catch (err) {
			setError(err instanceof Error ? err : new Error(String(err)));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	return { status, loading, error, refresh };
}
