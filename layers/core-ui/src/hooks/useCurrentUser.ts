/**
 * useCurrentUser — the caller's own row via `open_user({})`.
 *
 * @lore M3 A10: replaces the hardcoded founder-id / demo-founder-id constants
 * used across AppShell, WorkBet, HostThreadSection, and task-thread callers.
 * Returns a { user, status, error } result so callers can handle loading and
 * error states without blocking render.
 *
 * @lore BC5 T9: the door swap — `call("open_user", {})` replaces
 * `apiFetch("/api/auth/me")`. No id opens the caller (architecture.md §1).
 * The hook's own return shape (`CurrentUser`) is untouched — every consumer
 * across the app (AppShell, DocumentCreate, ScopeChangeDialog, …) keeps
 * reading id/name/email/avatarUrl/teamId exactly as before.
 */

import { useCallback, useEffect, useState } from "react";
import { call } from "../services/call.js";

export interface CurrentUser {
	id: string;
	name: string;
	email: string;
	avatarUrl: string | null;
	/** Team membership — present when the user belongs to a team. */
	teamId?: string;
}

export type UseCurrentUserStatus = "loading" | "ready" | "error";

export interface UseCurrentUserResult {
	user: CurrentUser | null;
	status: UseCurrentUserStatus;
	error: string | null;
	/** @lore NEW-24: re-issues the open_user request. Call alongside any
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
				const result = await call("open_user", {});
				if (cancelled) return;
				if (!result.ok) {
					setError(result.problems[0]?.message ?? "Something went wrong. Please try again.");
					setStatus("error");
					return;
				}
				const row = result.data.user;
				if (row === null) {
					// First-run: caller has no row yet (architecture.md §7).
					setError("No profile yet.");
					setStatus("error");
					return;
				}
				setUser({
					id: row.id,
					name: row.name,
					email: row.email ?? "",
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
