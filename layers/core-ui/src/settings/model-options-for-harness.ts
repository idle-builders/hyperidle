/**
 * AV2 — modelOptionsForHarness
 *
 * Reads the harness's DISCOVERED descriptor.models (from GET /api/harnesses)
 * and returns select-friendly options. Never reads MODEL_CATALOG.
 *
 * @lore AV2: The model dropdown reads descriptor.models (discovered per harness
 * at probe time), NOT MODEL_CATALOG. An empty discovered list → hasModels:false
 * so the editor renders an affordance ("This harness manages its own model"),
 * never a catalog fallback. This is the founder concept-review blocking tweak.
 *
 * The old invariant (filter MODEL_CATALOG by modelProviders) is REMOVED here.
 * modelProviders remains load-bearing for the server validator and the
 * on-switch modelProvider reconcile — but it is not the option source.
 */

import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";

export interface ModelOption {
	value: string;
	label: string;
}

export interface ModelOptionsResult {
	/** true when the harness exposes selectable models */
	hasModels: boolean;
	/** select options (always includes the "System default" empty-value option) */
	options: ModelOption[];
}

/**
 * Build model select options from the harness's discovered descriptor.models.
 *
 * Contract:
 * - Returns the descriptor's discovered models as options (+ a "System default" leading option).
 * - Returns hasModels:false + no selectable options when descriptor.models is empty.
 * - NEVER reads MODEL_CATALOG — a static import ban enforced by deletion.
 */
export function modelOptionsForHarness(
	descriptor: HarnessCapabilityDescriptor,
): ModelOptionsResult {
	const discoveredModels = descriptor.models;
	const hasModels = discoveredModels.length > 0;

	const defaultOption: ModelOption = { value: "", label: "System default" };

	if (!hasModels) {
		return { hasModels: false, options: [defaultOption] };
	}

	const modelOptions: ModelOption[] = [
		defaultOption,
		...discoveredModels.map((m) => ({
			value: m.id,
			label: m.label ?? m.id,
		})),
	];

	return { hasModels: true, options: modelOptions };
}
