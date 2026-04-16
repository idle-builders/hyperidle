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
		case "practice_facilitator":
			return "cpo";
		case "chief_of_staff":
			return "both";
		default:
			return "both";
	}
}
