/**
 * Pure function that determines which view an item routes to
 * based on risk_tier, kind, and verb.
 */
export function routeItem(item: {
	riskTier?: string | null;
	kind?: string | null;
	verb?: string | null;
}): "conversations" | "work" | "knowledge" {
	if (item.riskTier === "medium" || item.riskTier === "high") {
		return "conversations";
	}
	if (item.kind === "review" || item.kind === "skill_change") {
		return "conversations";
	}
	if (item.kind === "knowledge") {
		return "knowledge";
	}
	if (item.kind === "work" || item.verb === "bet") {
		return "work";
	}
	if (item.kind === "chat") {
		return "conversations";
	}
	return "conversations";
}
