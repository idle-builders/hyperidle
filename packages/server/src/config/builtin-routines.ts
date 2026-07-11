/**
 * AU11: editable-config half of the former `app-runtime/services/builtin-routines.ts`.
 * Holds the 5 built-in routines' stable IDs, kind-extraction helpers, and the
 * concrete default specs (owner role, trigger config, cron). The *handlers*
 * that execute these routines (`provisionTeamRoutines`, `runBuiltinRoutine`,
 * `registerBuiltinRoutineHandlers`) are agent-owned — see
 * `services/builtin-routine-handlers.ts`.
 */

// --- Stable IDs ---

/**
 * Stable, non-UUID identifiers for the four built-in routines seeded at
 * factory initialisation. Prefix `builtin:` — reserved — distinguishes
 * system-seeded routines from operator-authored ones so the manual-trigger
 * API can route to the correct handler.
 *
 * @lore G4 builtin id prefix: the `builtin:` prefix is load-bearing for the
 * manual-trigger API, which decides whether to call `runBuiltinRoutine`
 * (builtin) vs. the legacy session-creation path (non-builtin). Changing
 * this prefix requires updating `routes/routines-routes.ts` and the seed.
 *
 * @lore AD8c: `builtin:cost-sentinel` removed. Cost sentinel is now application
 * code registered via `startCostSentinel` in `services/cost-sentinel.ts`
 * (server-factory.ts wires it through `registerAgentLayerServices`). There
 * are now 5 builtin IDs.
 * @lore AF9: `builtin:knowledge-promotion` added — daily 03:00 UTC sweep that
 * auto-promotes provisional items meeting the repetition threshold.
 */
export const BUILTIN_ROUTINE_IDS = [
	"builtin:practice-meeting",
	"builtin:post-bet-retro",
	"builtin:portfolio-retro",
	"builtin:knowledge-decay",
	"builtin:knowledge-promotion", // AF9: auto-promote provisional items meeting threshold
] as const;

export type BuiltinRoutineId = (typeof BUILTIN_ROUTINE_IDS)[number];

/**
 * Returns true when `id` is a builtin routine id or a per-team builtin id.
 *
 * Per-team builtin ids use the scheme `builtin:<kind>:<teamId>` where
 * `builtin:<kind>` is one of the 5 stable BUILTIN_ROUTINE_IDS. This allows
 * multiple teams to each have their own 5 builtin routines without id collision.
 *
 * @lore AF17: changed from exact equality to kind-prefix check so that
 * per-team scoped ids (`builtin:post-bet-retro:<teamId>`) are recognised by the
 * scheduler and manual-trigger route. The kind is always recoverable from the
 * stored id via `extractBuiltinKind`.
 */
export function isBuiltinRoutineId(id: string): boolean {
	const kind = extractBuiltinKind(id);
	return kind !== null;
}

/**
 * Extract the builtin kind prefix from a stored routine id.
 * Returns the `BuiltinRoutineId` kind if the id is a builtin (global or per-team),
 * or null if it is not a builtin.
 *
 * Examples:
 *   `"builtin:post-bet-retro"` → `"builtin:post-bet-retro"`
 *   `"builtin:post-bet-retro:team-abc"` → `"builtin:post-bet-retro"`
 *   `"user-routine-123"` → `null`
 */
export function extractBuiltinKind(id: string): BuiltinRoutineId | null {
	// Global id (legacy / pre-AF17)
	if ((BUILTIN_ROUTINE_IDS as readonly string[]).includes(id)) {
		return id as BuiltinRoutineId;
	}
	// Per-team id: `builtin:<kind>:<teamId>` — extract the first two segments
	if (id.startsWith("builtin:")) {
		const parts = id.split(":");
		// builtin:kind or builtin:kind:teamId
		if (parts.length >= 3) {
			// @lore AF17: per-team ids have the form builtin:<kind-part>:<teamId>
			// The kind is always "builtin:" + parts[1] (e.g. "post-bet-retro")
			const kindCandidate = `builtin:${parts[1]}` as BuiltinRoutineId;
			if ((BUILTIN_ROUTINE_IDS as readonly string[]).includes(kindCandidate)) {
				return kindCandidate;
			}
		}
	}
	return null;
}

// --- Trigger config constants ---

// @lore AD8c: COST_SENTINEL_INTERVAL_SECONDS removed — cost sentinel timing is
// now COST_SENTINEL_INTERVAL_MS (milliseconds) in cost-sentinel.ts.
const PRACTICE_MEETING_CRON = "0 10 * * MON"; // weekly Monday 10:00 UTC
/**
 * Cron expression for the monthly portfolio retro — fires on the first
 * Monday of every month at 10:00 UTC.
 *
 * @lore G4 portfolio-retro first-Monday cron: the combination
 * `dayOfMonth=1-7` AND `dayOfWeek=MON` relies on the AND semantics of our
 * in-house cron matcher (`parseCron` + `fieldMatches` in
 * `services/routine-scheduler.ts`): a candidate minute is a match only
 * when every field matches. Standard POSIX cron uses OR semantics when
 * BOTH dayOfMonth AND dayOfWeek are restricted (it fires if either
 * matches), which would fire this routine far too often. We deliberately
 * diverge from POSIX here — do NOT swap the matcher to OR without first
 * reworking this constant. Pinned by
 * `packages/server/src/__tests__/routine-scheduler.test.ts` (12-month
 * window assertion).
 */
const PORTFOLIO_RETRO_CRON = "0 10 1-7 * MON"; // first Monday of the month
const KNOWLEDGE_DECAY_CRON = "0 2 * * *"; // daily 02:00 UTC
/**
 * Cron for the knowledge-promotion sweep — daily 03:00 UTC.
 * Deliberately one hour after knowledge-decay (02:00) so the two heavy
 * sweeps don't collide on the same scheduler tick.
 * @lore AF9 R2: offset from decay to avoid concurrent sweep load.
 */
const KNOWLEDGE_PROMOTION_CRON = "0 3 * * *"; // daily 03:00 UTC

/**
 * @lore AF17: Added ownerRole so provisionTeamRoutines can resolve owners from
 * the team's own roster rather than from hardcoded factory agent ids. The role
 * is used to look up the ownerByRole map; falls back to leadAgentId if absent.
 */
export interface BuiltinSpec {
	readonly id: BuiltinRoutineId;
	readonly name: string;
	/** AF17: replaced ownerAgentId — resolved at provision time from team roster. */
	readonly ownerRole: string;
	readonly triggerType: "heartbeat" | "calendar" | "event";
	readonly triggerConfig: Record<string, unknown>;
	readonly skillId: string;
	readonly doneCondition: string;
	readonly humanReview: boolean;
	readonly silent: boolean;
}

/**
 * Concrete specs for the 5 built-in routines.
 *
 * @lore AF17: `ownerAgentId` replaced by `ownerRole` — owners are resolved at
 * provision time from the team's roster (ownerByRole map), not hardcoded factory
 * agent ids. This allows each team to own its built-ins via its own agents.
 * @lore AD8c: builtin:cost-sentinel removed — it is now application code.
 * builtin:knowledge-decay ownership transferred to facilitator role.
 */
export const BUILTIN_SPECS: readonly BuiltinSpec[] = [
	{
		id: "builtin:practice-meeting",
		name: "Practice meeting",
		ownerRole: "facilitator",
		triggerType: "calendar",
		triggerConfig: { cron: PRACTICE_MEETING_CRON },
		skillId: "practice_meeting",
		doneCondition: "3-turn practice meeting anchor created",
		humanReview: false,
		silent: false,
	},
	{
		id: "builtin:post-bet-retro",
		name: "Post-bet retro",
		ownerRole: "product_manager",
		triggerType: "event",
		triggerConfig: { eventType: "bet_state_changed" },
		skillId: "bet_retro",
		doneCondition: "Review item comparing hypothesis vs reality written",
		humanReview: true,
		silent: false,
	},
	{
		id: "builtin:portfolio-retro",
		name: "Portfolio retro",
		ownerRole: "assistant",
		triggerType: "calendar",
		triggerConfig: { cron: PORTFOLIO_RETRO_CRON },
		skillId: "portfolio_retro",
		doneCondition: "Cross-product portfolio review item written",
		humanReview: true,
		silent: false,
	},
	{
		id: "builtin:knowledge-decay",
		name: "Knowledge decay",
		// @lore AD8c: ownership transferred to facilitator (practice-layer concern).
		ownerRole: "facilitator",
		triggerType: "calendar",
		triggerConfig: { cron: KNOWLEDGE_DECAY_CRON },
		skillId: "knowledge_decay",
		doneCondition: "Stale knowledge items transitioned",
		humanReview: false,
		silent: true,
	},
	{
		id: "builtin:knowledge-promotion",
		name: "Knowledge promotion",
		// @lore AF9: same owner as knowledge-decay — both are practice-layer lifecycle concerns.
		ownerRole: "facilitator",
		triggerType: "calendar",
		triggerConfig: { cron: KNOWLEDGE_PROMOTION_CRON },
		skillId: "knowledge_promotion",
		doneCondition: "Provisional items meeting repetition threshold promoted",
		humanReview: false,
		// silent: false — promotions emit knowledge_updated events so triage/git-export
		// consumers receive them. Decay is silent to avoid daily floods; promotion
		// touches far fewer items and the events are editorially significant.
		// @lore AF9 R5: the sweep already emits per-promotion events; the builtin
		// handler must NOT additionally emit — only call runAutoPromotionSweep.
		silent: false,
	},
];
