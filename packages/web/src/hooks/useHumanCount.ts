/**
 * useHumanCount — returns the number of human users in the org.
 *
 * Fetches GET /api/org and filters users by kind === "human".
 * Used by solo-mode conditional rendering (AD3).
 *
 * @lore AD3: Fail-open design — on fetch error, humanCount is null (not 0).
 * Callers must treat null as "unknown" and default to showing the full
 * multi-user UI, rather than hiding content based on a transient error.
 * This prevents a network blip from silently stripping UI from a multi-person team.
 *
 * @lore AD3: "Solo" is defined as humanCount <= 1, not humanCount === 0.
 * A founder who is the only human is the common solo case. Zero humans
 * (all-agent org) is also treated as solo to avoid rendering org-chart
 * features with no human subjects.
 */

import { useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";

interface OrgUser {
	id: string;
	kind: string;
	name: string;
	role: string;
}

interface OrgData {
	edges: unknown[];
	users: OrgUser[];
}

export interface UseHumanCountResult {
	/** Number of human-kind users in the org, or null while loading / on error. */
	humanCount: number | null;
	loading: boolean;
}

export function useHumanCount(): UseHumanCountResult {
	const [state, setState] = useState<UseHumanCountResult>({
		humanCount: null,
		loading: true,
	});

	useEffect(() => {
		let cancelled = false;
		setState({ humanCount: null, loading: true });

		apiFetch("/api/org")
			.then((res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json() as Promise<OrgData>;
			})
			.then((data) => {
				if (!cancelled) {
					const humanCount = data.users.filter((u) => u.kind === "human").length;
					setState({ humanCount, loading: false });
				}
			})
			.catch(() => {
				if (!cancelled) {
					// Fail-open: null signals "unknown", not "zero humans"
					setState({ humanCount: null, loading: false });
				}
			});

		return (): void => {
			cancelled = true;
		};
	}, []);

	return state;
}
