/**
 * Pure function that determines which founder(s) see an item
 * based on the source agent's role.
 */
export function routeToFounder(agentRole: string | null | undefined): "ceo" | "cpo" | "both" {
	switch (agentRole) {
		case "growth":
			return "ceo";
		case "builder":
		case "product_manager":
		case "brand_voice":
		// @lore AD8c: renamed from practice_facilitator
		case "facilitator":
			return "cpo";
		case "assistant":
			return "both";
		default:
			return "both";
	}
}
