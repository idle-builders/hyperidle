import { useCallback, useEffect, useState } from "react";
import { call } from "../services/call.js";

export interface CurrentUser {
	id: string;
	name: string;
	avatarUrl: string | null;
	teamId?: string;
}

export type UseCurrentUserStatus = "loading" | "ready" | "error";

export interface UseCurrentUserResult {
	user: CurrentUser | null;
	status: UseCurrentUserStatus;
	error: string | null;
	/** retry() re-issues open_user — callers like useThreads skip fetching until viewer id resolves; retry unblocks them on recovery. */
	retry: () => void;
}

export function useCurrentUser(): UseCurrentUserResult {
	const [user, setUser] = useState<CurrentUser | null>(null);
	const [status, setStatus] = useState<UseCurrentUserStatus>("loading");
	const [error, setError] = useState<string | null>(null);
	const [tick, setTick] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: tick is intentional — incrementing it via retry() re-runs the fetch
	useEffect(() => {
		let cancelled = false;
		setStatus("loading");
		setError(null);

		(async (): Promise<void> => {
			try {
				const result = await call("open_user", {});
				if (cancelled) return;
				if (!result.ok) {
					setError(result.problems[0]?.message ?? "Something went wrong. Please try again.");
					setStatus("error");
					return;
				}
				const row = result.data.user;
				if (row === null) {
					setError("No profile yet.");
					setStatus("error");
					return;
				}
				setUser({
					id: row.id,
					name: row.name,
					avatarUrl: row.avatarUrl,
					// `team` is the wire's "no team"; CurrentUser.teamId stays an
					// optional string so every `!== undefined` gate downstream
					// (DocumentCreate, ScopeChangeDialog) reads "no team" correctly.
					teamId: row.team?.id ?? undefined,
				});
				setStatus("ready");
			} catch (cause) {
				if (cancelled) return;
				setError(cause instanceof Error ? cause.message : "Network error");
				setStatus("error");
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [tick]);

	const retry = useCallback((): void => {
		setTick((n) => n + 1);
	}, []);

	return { user, status, error, retry };
}
