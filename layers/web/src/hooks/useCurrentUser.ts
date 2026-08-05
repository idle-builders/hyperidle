/**
 * useCurrentUser — fetch the authenticated user identity from GET /api/auth/me.
 *
 * @lore M3 A10: replaces the hardcoded founder-id / demo-founder-id constants
 * used across AppShell, WorkBet, HostThreadSection, and task-thread callers.
 * Returns a { user, status, error } result so callers can handle loading and
 * error states without blocking render.
 */

import { useEffect, useState } from "react";
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
}

export function useCurrentUser(): UseCurrentUserResult {
	const [user, setUser] = useState<CurrentUser | null>(null);
	const [status, setStatus] = useState<UseCurrentUserStatus>("loading");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		setStatus("loading");
		setError(null);

		(async (): Promise<void> => {
			try {
				const res = await apiFetch("/api/auth/me");
				if (cancelled) return;
				if (!res.ok) {
					setError(`HTTP ${res.status}`);
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
	}, []);

	return { user, status, error };
}
