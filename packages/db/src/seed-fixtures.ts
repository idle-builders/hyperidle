/**
 * Shared seed fixture data for SQLite + PG seeders.
 *
 * @lore I3 (TRACK-I.md L161-164): the SQLite seed and PG seed must produce
 * the same logical fixture set. Boolean columns diverge per dialect — SQLite
 * uses 0/1 integers, PG uses true/false. The fixtures here describe the data
 * with `boolean` semantics; each dialect's seeder coerces at the boundary
 * (`asBit01(true)` → 1 for SQLite; `bool` is passed straight through to PG).
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
	readonly ownerAgentId: string;
	readonly triggerType: "heartbeat" | "calendar" | "event";
	readonly triggerConfig: Readonly<Record<string, unknown>>;
	readonly skillId: string;
	readonly doneCondition: string;
	readonly humanReview: boolean;
	readonly silent: boolean;
}

export const BUILTIN_ROUTINE_SEEDS: readonly BuiltinRoutineSeed[] = [
	{
		id: "builtin:cost-sentinel",
		ownerAgentId: "seed-agent-cos",
		triggerType: "heartbeat",
		triggerConfig: { intervalSeconds: 900 },
		skillId: "cost_watchdog",
		doneCondition: "Factory cost spend is below warning threshold",
		humanReview: false,
		silent: true,
	},
	{
		id: "builtin:practice-meeting",
		ownerAgentId: "seed-agent-pf-facilitation",
		triggerType: "calendar",
		triggerConfig: { cron: "0 10 * * MON" },
		skillId: "practice_meeting",
		doneCondition: "3-turn practice meeting anchor created",
		humanReview: false,
		silent: false,
	},
	{
		id: "builtin:post-bet-retro",
		ownerAgentId: "seed-agent-pm-nimmly",
		triggerType: "event",
		triggerConfig: { eventType: "bet_state_changed" },
		skillId: "bet_retro",
		doneCondition: "Review item comparing hypothesis vs reality written",
		humanReview: true,
		silent: false,
	},
	{
		id: "builtin:portfolio-retro",
		ownerAgentId: "seed-agent-cos",
		triggerType: "calendar",
		triggerConfig: { cron: "0 10 1-7 * MON" },
		skillId: "portfolio_retro",
		doneCondition: "Cross-product portfolio review item written",
		humanReview: true,
		silent: false,
	},
	{
		id: "builtin:knowledge-decay",
		ownerAgentId: "seed-agent-cos",
		triggerType: "calendar",
		triggerConfig: { cron: "0 2 * * *" },
		skillId: "knowledge_decay",
		doneCondition: "Stale knowledge items transitioned",
		humanReview: false,
		silent: true,
	},
];

/** Coerce a boolean to a 0/1 integer for SQLite columns. */
export function asBit01(value: boolean): 0 | 1 {
	return value ? 1 : 0;
}
