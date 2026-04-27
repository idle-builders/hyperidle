/**
 * L9 — Per-kind default risk-tier mapping.
 *
 * `items.risk_tier` is overridable per-instance; the founder sees a defaulted
 * tier when the producer omits it. Defaults are deliberately conservative —
 * raising autonomy or fleet-wide skill changes are high-risk by default.
 *
 * @lore L9: kept in `shared` (not `web`) because both server emitters and
 * UI renderers need the same default. Without a shared constant the founder
 * could see two different risk badges for the same artifact depending on
 * which surface produced the metadata strip.
 */

import type { ArtifactKind } from "../types/artifact.js";
import type { RiskTier } from "../types.js";

export const DEFAULT_RISK_TIER_BY_KIND: Record<ArtifactKind, RiskTier> = {
	action_summary: "high",
	skill_change: "high",
	file_lease: "medium",
	permission_request: "high",
};

/**
 * Resolve the effective risk tier for an artifact: explicit override wins,
 * otherwise the per-kind default.
 */
export function resolveRiskTier(
	kind: ArtifactKind,
	override: RiskTier | null | undefined,
): RiskTier {
	return override ?? DEFAULT_RISK_TIER_BY_KIND[kind];
}
