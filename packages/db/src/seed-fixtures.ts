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

export interface BuiltinRoutineSeed {
	readonly id: string;
	readonly name: string;
	readonly ownerAgentId: string;
	readonly teamId: string;
	readonly triggerType: "heartbeat" | "calendar" | "event";
	readonly triggerConfig: Readonly<Record<string, unknown>>;
	readonly skillId: string;
	readonly doneCondition: string;
	readonly humanReview: boolean;
	readonly silent: boolean;
}

// @lore AD8c: builtin:cost-sentinel removed from BUILTIN_ROUTINE_SEEDS.
// The cost sentinel is now application code (startCostSentinel in
// packages/fabric/src/services/cost-sentinel.ts), registered in bootstrapFabric.
// Removing it from the routines table prevents operators from disabling cost
// monitoring by flipping the `active` flag on a routine row.
export const BUILTIN_ROUTINE_SEEDS: readonly BuiltinRoutineSeed[] = [
	{
		id: "builtin:practice-meeting",
		name: "Practice meeting",
		ownerAgentId: "seed-agent-pf-facilitation",
		teamId: "seed-product-1",
		triggerType: "calendar",
		triggerConfig: { cron: "0 10 * * MON" },
		skillId: "practice_meeting",
		doneCondition: "3-turn practice meeting anchor created",
		humanReview: false,
		silent: false,
	},
	{
		id: "builtin:post-bet-retro",
		name: "Post-bet retro",
		ownerAgentId: "demo-agent-pm",
		teamId: "seed-product-1",
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
		ownerAgentId: "seed-agent-cos",
		teamId: "seed-product-1",
		triggerType: "calendar",
		triggerConfig: { cron: "0 10 1-7 * MON" },
		skillId: "portfolio_retro",
		doneCondition: "Cross-product portfolio review item written",
		humanReview: true,
		silent: false,
	},
	{
		id: "builtin:knowledge-decay",
		name: "Knowledge decay",
		// @lore AD8c: ownership transferred from seed-agent-cos to a facilitator agent.
		// Knowledge decay is a practice-layer concern — the facilitation facilitator
		// is the natural owner of cross-community knowledge lifecycle.
		ownerAgentId: "seed-agent-pf-facilitation",
		teamId: "seed-product-1",
		triggerType: "calendar",
		triggerConfig: { cron: "0 2 * * *" },
		skillId: "knowledge_decay",
		doneCondition: "Stale knowledge items transitioned",
		humanReview: false,
		silent: true,
	},
	// @lore AF9: production seed replica — mirrors BUILTIN_SPECS in
	// packages/fabric/src/services/builtin-routines.ts exactly. The db package
	// cannot depend on the fabric package (layer boundary), so this replica must
	// be kept in sync manually. See seed.ts:395-403 for the sync-required comment.
	{
		id: "builtin:knowledge-promotion",
		name: "Knowledge promotion",
		ownerAgentId: "seed-agent-pf-facilitation",
		teamId: "seed-product-1",
		triggerType: "calendar",
		triggerConfig: { cron: "0 3 * * *" },
		skillId: "knowledge_promotion",
		doneCondition: "Provisional items meeting repetition threshold promoted",
		humanReview: false,
		silent: false,
	},
];
