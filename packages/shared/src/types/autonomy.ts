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
export const AUTONOMY_LEVELS = [1, 2, 3, 4] as const satisfies readonly AutonomyLevel[];

/**
 * Per-level metadata. Consumers (UI labels, audit log rendering, route
 * documentation) read from this map so semantic strings live in one place.
 */
export interface AutonomyLevelMeta {
	readonly level: AutonomyLevel;
	readonly code: "L1" | "L2" | "L3" | "L4";
	readonly label: string;
	readonly description: string;
	readonly commitsAutonomously: boolean;
	readonly retrospectiveOnly: boolean;
}

export const AUTONOMY_LEVEL_META: Readonly<Record<AutonomyLevel, AutonomyLevelMeta>> = {
	1: {
		level: 1,
		code: "L1",
		label: "Asks every step",
		description:
			"Agent confirms before each action. Default for new (agent, skill) pairs — not yet trusted.",
		commitsAutonomously: false,
		retrospectiveOnly: false,
	},
	2: {
		level: 2,
		code: "L2",
		label: "Asks before commit",
		description: "Agent works freely but pauses before any state-changing commit.",
		commitsAutonomously: false,
		retrospectiveOnly: false,
	},
	3: {
		level: 3,
		code: "L3",
		label: "Commits low-risk, asks high-risk",
		description: "Agent commits low-risk work; pauses only for high-risk decisions.",
		commitsAutonomously: true,
		retrospectiveOnly: false,
	},
	4: {
		level: 4,
		code: "L4",
		label: "Autonomous, retro only",
		description: "Agent acts fully autonomously and reports outcomes after the fact.",
		commitsAutonomously: true,
		retrospectiveOnly: true,
	},
};

/**
 * Runtime guard for narrowing `unknown` (typically request bodies) to
 * `AutonomyLevel` without an unsafe cast.
 */
export function isAutonomyLevel(value: unknown): value is AutonomyLevel {
	return value === 1 || value === 2 || value === 3 || value === 4;
}

/**
 * Parse a `Lx` code string (the on-screen label prefix) into its numeric
 * ladder value. Returns `null` for unknown codes.
 */
export function autonomyLevelFromCode(code: string): AutonomyLevel | null {
	switch (code) {
		case "L1":
			return 1;
		case "L2":
			return 2;
		case "L3":
			return 3;
		case "L4":
			return 4;
		default:
			return null;
	}
}

/**
 * The default level for an `(agent, skill)` pair that has no row yet.
 * Aligned with the validation scenario "every skill defaults to L1 with a
 * 'not yet trusted' hint."
 */
export const DEFAULT_AUTONOMY_LEVEL: AutonomyLevel = 1;

/**
 * Documented mapping from the legacy 3-state autonomy strings to the
 * ladder. Exported because the spec calls for "documented mapping" — kept
 * authoritative even though no DB row uses the legacy strings any more.
 *
 * @lore L1: surviving fixtures may emit `"manual" | "supervised" |
 * "autonomous"` until they're migrated. Use this table when porting them.
 */
export const LEGACY_AUTONOMY_MAPPING = {
	manual: 1,
	supervised: 2,
	autonomous: 4,
} as const satisfies Readonly<Record<"manual" | "supervised" | "autonomous", AutonomyLevel>>;
