/**
 * L1 — Autonomy ladder type. Single source of truth for the L1–L4 ladder
 * applied to every (agent, skill) pair. The DB column is a plain integer
 * 1..4; the ladder constants below give every level a stable code, a UI
 * label, and a semantic description.
 *
 * @see docs/plans/L1.md Decision 2 (numeric union + const metadata map).
 */

/**
 * Numeric ladder level. The DB column is `INTEGER`, JSON wire format is a
 * number, the React `<select>` parses to a number — there is no benefit to
 * a tagged union. The metadata map below provides the UI label/description.
 */
export type AutonomyLevel = 1 | 2 | 3 | 4;

/**
 * Iterable, render-stable order of the ladder levels. Kept as a `readonly
 * AutonomyLevel[]` so callers cannot accidentally reorder or mutate it.
 */
export const AUTONOMY_LEVELS = [1, 2, 3, 4] as const;

/**
 * Per-level metadata. Consumers (UI labels, audit log rendering, route
 * documentation) read from this map so semantic strings live in one place.
 */
export const AUTONOMY_LEVEL_META = {
	1: {
		level: 1,
		code: "L1",
		label: "Asks every step",
		description:
			"Agent confirms before each action. Default for new (agent, skill) pairs — not yet trusted.",
	},
	2: {
		level: 2,
		code: "L2",
		label: "Asks before commit",
		description: "Agent works freely but pauses before any state-changing commit.",
	},
	3: {
		level: 3,
		code: "L3",
		label: "Commits low-risk, asks high-risk",
		description: "Agent commits low-risk work; pauses only for high-risk decisions.",
	},
	4: {
		level: 4,
		code: "L4",
		label: "Autonomous, retro only",
		description: "Agent acts fully autonomously and reports outcomes after the fact.",
	},
} as const;

export type AutonomyLevelMeta = (typeof AUTONOMY_LEVEL_META)[AutonomyLevel];

/**
 * Runtime guard for narrowing `unknown` (typically request bodies) to
 * `AutonomyLevel` without an unsafe cast.
 */
export function isAutonomyLevel(value: unknown): value is AutonomyLevel {
	return value === 1 || value === 2 || value === 3 || value === 4;
}
