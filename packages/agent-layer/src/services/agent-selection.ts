/**
 * AK7: app-owned selection implementation.
 *
 * selectAgentByAppDefaults implements app-owned agent selection defaults.
 *
 * Per-surface behaviour (architecture §6.2):
 *   bet_decomposer  — role-match PM on candidates; else candidates[0]; else null.
 *   bet_task        — role-match short-circuit; else candidates[spreadIndex % len]
 *                     (the round-robin spread — the regression trap, §6.3).
 *   routine_delegate — ignores candidates (always []). Runs findDelegate's exact
 *                      userSkills-scoped query verbatim (concept §3a carve-out):
 *                      same population, same order, same WIP fallback.
 *
 * @lore AK7: selectAgentByAppDefaults is a pure function for bet_* surfaces (takes
 * candidates + spreadIndex; no DB query). For routine_delegate it queries DB.
 * The candidate source is surface-specific by design (concept §3a): bet_* picks
 * from a Kernel-enumerated team roster; routine_delegate runs its own system-wide
 * userSkills query — the two surfaces select over genuinely different populations.
 *
 * @lore AK7 §6.3 (round-robin spread regression trap): spreadIndex is the loop
 * index `i` (not a per-branch counter). Without it, all null-role tasks collapse
 * to candidates[0]. The golden test (§7) catches a collapsed impl with [A,B,A] vs [A,A,A].
 */

import { getUserById } from "@hyperidle/core-app";
import { type HyperIdleDb, sessions, userSkills } from "@hyperidle/db";
import { and, eq, sql } from "drizzle-orm";
import type { SelectAgentOutcome, SelectAgentRequest } from "./contracts.js";

// ---------------------------------------------------------------------------
// WIP helpers (relocated from routine-scheduler.ts for the routine_delegate branch)
// ---------------------------------------------------------------------------

async function getActiveSessionCount(db: HyperIdleDb, agentId: string): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)` })
		.from(sessions)
		.where(and(eq(sessions.agentId, agentId), eq(sessions.state, "active")))
		.limit(1);
	return row?.count ?? 0;
}

/**
 * Returns true if the agent is at or beyond their maxConcurrentSessions limit.
 * Exported so routine-scheduler.ts can continue to call isAgentAtWipLimit via this module.
 *
 * @lore AK7: This is the verbatim body of the private isAgentAtWipLimit in
 * routine-scheduler.ts — relocated here so selectAgentByAppDefaults owns the routine_delegate
 * branch without a circular import.
 */
export async function isAgentAtWipLimit(db: HyperIdleDb, agentId: string): Promise<boolean> {
	const agent = await getUserById(db, agentId);
	if (!agent) return true;
	const activeCount = await getActiveSessionCount(db, agentId);
	return activeCount >= agent.maxConcurrentSessions;
}

// ---------------------------------------------------------------------------
// routine_delegate: findDelegate's exact query, verbatim (concept §3a carve-out)
// ---------------------------------------------------------------------------

/**
 * Runs findDelegate's exact userSkills-scoped query verbatim.
 * Population: every user holding the skill, system-wide, in userSkills insertion order.
 * No team filter, no kind='ai' filter, no status='active' filter.
 * Returns the first non-owner, non-WIP candidate's userId; else null.
 *
 * @lore AK7 §5.3 / concept §3a: This is byte-identical to the pre-AK7 findDelegate
 * in routine-scheduler.ts:245-263. The function moved here behind app-owned selection
 * but did NOT CHANGE. The population, order, WIP-fallback, and null-on-none semantics
 * are preserved exactly. routine_delegate ignores `candidates` entirely.
 */
async function findDelegateVerbatim(
	db: HyperIdleDb,
	skillId: string,
	excludeAgentId: string,
): Promise<string | null> {
	// userSkills insertion order — no ORDER BY added (byte-identical to original)
	const candidates = await db
		.select({ agentId: userSkills.userId })
		.from(userSkills)
		.where(eq(userSkills.skillId, skillId));

	for (const candidate of candidates) {
		if (candidate.agentId === excludeAgentId) continue;
		if (!(await isAgentAtWipLimit(db, candidate.agentId))) {
			return candidate.agentId;
		}
	}
	return null;
}

// ---------------------------------------------------------------------------
// selectAgentByAppDefaults — the app defaults contract implementation
// ---------------------------------------------------------------------------

/**
 * AK7: app-owned selection.
 *
 * Never throws for missing candidates — returns { agentId: null } to signal
 * "no agent" (the Kernel takes the no-agent path).
 */
export async function selectAgentByAppDefaults(
	req: SelectAgentRequest,
): Promise<SelectAgentOutcome> {
	switch (req.surface) {
		case "bet_decomposer": {
			// role-match PM; else candidates[0]; else null.
			// Oracle: bet-decomposition.ts:294 — eligible.find(role==='product_manager') ?? eligible[0]
			const byRole = req.roleHint ? req.candidates.find((c) => c.role === req.roleHint) : undefined;
			const chosen = byRole ?? req.candidates[0];
			return { agentId: chosen?.agentId ?? null };
		}

		case "bet_task": {
			// Role-match short-circuit; else candidates[spreadIndex % len] (round-robin spread).
			// @lore AK7 §6.3: Short-circuit ONLY on the match branch. spreadIndex is the loop
			// `i` — consulted only on the mismatch branch. A role match at any index never
			// consumes the index, so the next null-role task sees the full original `i`.
			// Oracle: bet-decomposition.ts:150-158 — exact role-match → round-robin fallback.
			const byRole = req.roleHint ? req.candidates.find((c) => c.role === req.roleHint) : undefined;
			if (byRole) {
				return { agentId: byRole.agentId };
			}
			const len = req.candidates.length;
			if (len === 0) {
				return { agentId: null };
			}
			const idx = (req.spreadIndex ?? 0) % len;
			return { agentId: req.candidates[idx]?.agentId ?? null };
		}

		case "routine_delegate": {
			// Ignores candidates (always []). Runs findDelegate's exact userSkills query.
			// @lore AK7 §5.3: routine_delegate is owned by app-runtime. The call site
			// (routine-scheduler.ts) passes skillId and excludeAgentId; teamId is null.
			if (!(req.skillId && req.excludeAgentId)) {
				return { agentId: null };
			}
			const agentId = await findDelegateVerbatim(req.db, req.skillId, req.excludeAgentId);
			return { agentId };
		}
	}
}
