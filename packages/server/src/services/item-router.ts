/**
 * Pure function that determines which view an item routes to
 * based on risk_tier, kind, and verb.
 *
 * @lore L9 review (arch C1): `'critical'` was added to `RISK_TIERS` in
 * shared types but the router still hardcoded `'medium' | 'high'`,
 * silently demoting critical items to `'rail'`. Critical is strictly
 * higher than high — it MUST route to Conversations.
 */
export function routeItem(item: {
	riskTier?: string | null;
	kind?: string | null;
	verb?: string | null;
}): "conversations" | "rail" | "work" | "knowledge" {
	if (item.riskTier === "medium" || item.riskTier === "high" || item.riskTier === "critical") {
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
	return "rail";
}
