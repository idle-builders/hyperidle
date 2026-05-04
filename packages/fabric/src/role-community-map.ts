import type { AgentRole } from "@hyperidle/shared";

/**
 * Map each agent role to its default L3 practice community scope ID.
 *
 * @lore `practice_facilitator` currently maps to `ops` for every facilitator,
 * regardless of the agent's actual scope (each facilitator's scope lives in
 * the `agents.skills` JSON blob and is not yet read here). G2 must replace
 * this with a per-agent lookup that respects `skills.scope` — otherwise a
 * `product` facilitator sees only `ops` practices. Keeping every AgentRole
 * key present prevents silent 0-scoring for facilitator agents in the
 * relevance engine. See plans/work-packages/plans/G1-plan.md §5 step 9 and
 * the G2 work package for the planned fix.
 */
export const ROLE_TO_COMMUNITY: Record<AgentRole, string> = {
	builder: "building",
	growth: "growth",
	product_manager: "product",
	practice_facilitator: "ops",
	chief_of_staff: "ops",
	brand_voice: "growth",
};
