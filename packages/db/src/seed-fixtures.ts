/**
 * Shared seed fixture data for the PG seeder.
 *
 * @lore I3 (TRACK-I.md L161-164): the SQLite and PG seeds produced the same
 * logical fixture set. After Phase 2 the schema is PG-only, so `asBit01()`
 * was removed — booleans are passed straight through to PG as true/false.
 */

export const FACILITATOR_TOOLS = [
	"route_item",
	"score_attention",
	"promote_knowledge",
	"create_conflict_review",
] as const;

export const PRACTICE_COMMUNITIES = ["build", "product", "growth", "ops", "facilitation"] as const;
export type PracticeCommunity = (typeof PRACTICE_COMMUNITIES)[number];

export const COMMUNITY_DISPLAY_NAMES: Record<PracticeCommunity, string> = {
	build: "Build",
	product: "Product",
	growth: "Growth",
	ops: "Ops",
	facilitation: "Facilitation",
};

// @lore AF17: BUILTIN_ROUTINE_SEEDS and BuiltinRoutineSeed were removed.
// The global seeding loop was eliminated by the seed factory split — builtin routines
// are now provisioned per-team via provisionTeamRoutines() in
// packages/server/src/services/builtin-routine-handlers.ts (@hyperidle/server/routines
// public export). BUILTIN_SPECS in packages/server/src/config/builtin-routines.ts
// (AU11: split from the former app-runtime/services/builtin-routines.ts) is the
// canonical source of the 5 builtin routine defaults.
