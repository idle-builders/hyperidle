/**
 * useAgentOwnership — BC3. "Every user's agent is an ordinary agent that the
 * user owns" (plan.md:66) needs a real fact: `users.ownerUserId`. `GET
 * /api/agents` (`AgentConfig`, `useAgents.ts`) does not carry it — that route
 * hand-picks its response fields and never selected the column
 * (`layers/core-api/src/routes/agents.ts`'s `GET /` handler). `GET
 * /api/users?kind=ai` does: `listUsers` is a bare `select()` over the whole
 * `users` row, so `ownerUserId` already rides that response today, unwired.
 *
 * This hook is the one place that reads it, so `AssistantOverlay` (which
 * agent is mine) and `SettingsAgents` (is this agent someone's own) share a
 * single fetch and a single parse.
 *
 * @lore BC3 build report: `GET /api/agents` gaining `ownerUserId` directly
 * would remove the second fetch this hook makes; that is a `layers/core-api`
 * change outside this item's assigned paths, so it is named rather than made.
 */

import { useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";

export interface AgentOwnershipRow {
	readonly id: string;
	readonly ownerUserId: string | null;
}

export interface UseAgentOwnershipResult {
	readonly rows: ReadonlyArray<AgentOwnershipRow>;
	readonly loading: boolean;
}

function isAgentOwnershipRow(value: unknown): value is AgentOwnershipRow {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	return typeof v.id === "string" && (v.ownerUserId === null || typeof v.ownerUserId === "string");
}

export function useAgentOwnership(): UseAgentOwnershipResult {
	const [rows, setRows] = useState<ReadonlyArray<AgentOwnershipRow>>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		apiFetch("/api/users?kind=ai")
			.then((res) => (res.ok ? (res.json() as Promise<unknown>) : []))
			.then((body) => {
				if (cancelled) return;
				const list = Array.isArray(body) ? body.filter(isAgentOwnershipRow) : [];
				setRows(list);
				setLoading(false);
			})
			.catch(() => {
				if (!cancelled) setLoading(false);
			});
		return (): void => {
			cancelled = true;
		};
	}, []);

	return { rows, loading };
}
