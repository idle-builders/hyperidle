/**
 * AK3: Bet decomposition shared types and constants.
 *
 * These live in @hyperidle/shared because:
 * - DecompositionStatus / DecompositionBlockerReason are closed enums that
 *   appear in both the API wire type (server) and the web surface (client).
 * - DECOMPOSITION_TURN_TIMEOUT_MS is a constant the service reads; tests
 *   import it to verify the magnitude matches the plan spec.
 * - DecompositionTaskInput is the structured task-list output the PM turn
 *   produces; shared so the web layer can reference it if needed.
 *
 * @lore AK3: Closed enums (C8). Adding a new status value requires a concept
 * update — do NOT extend these types ad-hoc.
 */

/**
 * Lifecycle of a bet's decomposition pass.
 * - `running` — in-flight (CAS-guarded; at-most-one per bet)
 * - `done`    — ≥1 task inserted; dispatcher is expected to fire
 * - `blocked` — terminal failure; `decompositionBlockerReason` gives details
 */
export type DecompositionStatus = "running" | "done" | "blocked";

/**
 * Why a bet decomposition ended in `blocked`.
 * - `no_eligible_agent` — the team had no active AI agent with `category=team`
 * - `empty`             — the PM turn returned an empty task list
 * - `failed`            — turn timed out, threw, or context-assembly failed
 */
export type DecompositionBlockerReason = "no_eligible_agent" | "empty" | "failed";

/**
 * A single task the PM-turn breakdown proposes.
 * All fields except `title` are optional so the PM can omit them when unknown.
 *
 * @lore AK3: `ownerRole` is the PM's suggestion; server-side `insertProposedBetTasks`
 * resolves it to a real `ownerAgentId` via the role catalog + round-robin fallback.
 * It is NOT trusted as a direct FK reference.
 */
export interface DecompositionTaskInput {
	title: string;
	description?: string;
	doneCondition?: string;
	/** Suggested owner role. Must match a role catalog entry with category='team'. */
	ownerRole?: string;
}

/**
 * Timeout for the PM decomposition turn (ms).
 * 2 minutes — same magnitude as ASSISTANT_TURN_TIMEOUT_MS.
 *
 * @lore AK3: Intentionally the same value as ASSISTANT_TURN_TIMEOUT_MS (120_000).
 * Both cap a single task-free LLM completion. The PM decomposition turn is
 * bounded by DECOMPOSITION_TURN_TIMEOUT_MS so the bet never stays 'running'
 * indefinitely; the boot-time orphan sweep handles the crash case (CRITICAL-3).
 */
export const DECOMPOSITION_TURN_TIMEOUT_MS = 120_000;
