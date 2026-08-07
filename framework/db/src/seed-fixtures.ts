/**
 * Shared seed fixture data for the PG seeder.
 *
 * @lore I3 (TRACK-I.md L161-164): the SQLite and PG seeds produced the same
 * logical fixture set. After Phase 2 the schema is PG-only, so `asBit01()`
 * was removed — booleans are passed straight through to PG as true/false.
 */

// @lore AU26 G1: `FACILITATOR_TOOLS` was deleted with the `users.skills` column
// it was the only writer of. That column had zero production readers repo-wide
// (this seeder wrote it and nothing ever read it back), so it was DROPPED, not
// relocated — see migration 0055. If per-agent tool scoping is wanted again it
// is a new design, not a resurrection of this list.

export const PRACTICE_COMMUNITIES = ["build", "product", "growth", "ops", "facilitation"] as const;
export type PracticeCommunity = (typeof PRACTICE_COMMUNITIES)[number];

export const COMMUNITY_DISPLAY_NAMES: Record<PracticeCommunity, string> = {
	build: "Build",
	product: "Product",
	growth: "Growth",
	ops: "Ops",
	facilitation: "Facilitation",
};
