// @lore: model source — descriptor.models discovered at probe time; MODEL_CATALOG never used; empty list → hasModels:false; catalog import banned by deletion

import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";

export interface ModelOption {
	value: string;
	label: string;
}

export interface ModelOptionsResult {
	hasModels: boolean;
	options: ModelOption[];
}

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
