/**
 * useCurrentUser — fetch the authenticated user identity from GET /api/auth/me.
 *
 * @lore M3 A10: replaces the hardcoded founder-id / demo-founder-id constants
 * used across AppShell, WorkBet, HostThreadSection, and task-thread callers.
 * Returns a { user, status, error } result so callers can handle loading and
 * error states without blocking render.
 */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";

export interface CurrentUser {
	id: string;
	name: string;
	email: string;
	avatarUrl: string | null;
	/** AF13 §6: team membership — present when the user belongs to a team. */
	teamId?: string;
}

export type UseCurrentUserStatus = "loading" | "ready" | "error";

export interface UseCurrentUserResult {
	user: CurrentUser | null;
	status: UseCurrentUserStatus;
	error: string | null;
	/** @lore NEW-24: re-issues the /api/auth/me request. Call alongside any
	 * surface-level Retry so a full-outage recovery unblocks callers like
	 * `useThreads`, which skip fetching entirely while no viewer id is resolved. */
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
				const res = await apiFetch("/api/auth/me");
				if (cancelled) return;
				if (!res.ok) {
					setError("Something went wrong. Please try again.");
					setStatus("error");
					return;
				}
				const data = (await res.json()) as {
					id: string;
					name: string;
					email: string;
					avatarUrl: string | null;
					teamId?: string;
				};
				if (cancelled) return;
				setUser({
					id: data.id,
					name: data.name,
					email: data.email,
					avatarUrl: data.avatarUrl,
					teamId: data.teamId,
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
