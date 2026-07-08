/**
 * AV1 — Derive a PrimaryHarnessConfig from a HarnessCapabilityDescriptor.
 *
 * Maps the chosen descriptor to the team creation seam.
 * Filters models on .selectable === true to exclude inherited/non-choosable models.
 *
 * @lore AV1: Only called on a choosable (installed/ready) descriptor — greyed rows
 * never produce a primaryHarness. The .selectable filter is essential: CLI harnesses
 * list non-selectable models (inheritedFromGateway) that must not become the primary.
 */

import type { PrimaryHarnessConfig } from "../team.js";
import type { HarnessCapabilityDescriptor } from "./harness-capability-descriptor.js";

/**
 * Derive a PrimaryHarnessConfig from a choosable HarnessCapabilityDescriptor.
 * Never call on a greyed (missing/unavailable) descriptor.
 */
export function derivePrimaryHarness(
	descriptor: HarnessCapabilityDescriptor,
): PrimaryHarnessConfig {
	const firstSelectable = descriptor.models.find((m) => m.selectable === true);
	return {
		harnessType: descriptor.type,
		modelId: firstSelectable?.id ?? "claude-sonnet-4-6",
		modelProvider: firstSelectable?.provider ?? descriptor.modelProviders[0] ?? "anthropic",
	};
}
