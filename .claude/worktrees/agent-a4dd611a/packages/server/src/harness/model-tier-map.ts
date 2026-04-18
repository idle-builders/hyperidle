/** Model tier to Claude model string mapping (D2). */

import type { ModelTier } from "@hyperidle/shared";

export const MODEL_TIER_MAP: Record<ModelTier, string> = {
	reasoning: "claude-opus-4-20250514",
	workhorse: "claude-sonnet-4-20250514",
	fast: "claude-haiku-3-5-20241022",
} as const;

export function resolveModel(tier: ModelTier): string {
	return MODEL_TIER_MAP[tier];
}
