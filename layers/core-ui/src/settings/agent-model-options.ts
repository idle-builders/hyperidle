// @lore: model options — harness default shown, never stored; absent key = "whatever the harness does"; prevents pinning to a stale default

import type {
	HarnessCapabilityDescriptor,
	HarnessModelOptionDescriptor,
} from "@hyperidle/harness-capability";

export type ModelOptionValue = string | number | boolean;
export type ModelOptionValues = Readonly<Record<string, ModelOptionValue>>;

export function defaultChoiceLabel(option: HarnessModelOptionDescriptor): string {
	return typeof option.defaultValue === "string"
		? `Default (${option.defaultValue})`
		: "Harness default";
}

export function declaredOptionsFor(
	descriptor: HarnessCapabilityDescriptor | undefined,
	modelId: string,
): readonly HarnessModelOptionDescriptor[] {
	if (!(descriptor && modelId)) return [];
	return descriptor.models.find((model) => model.id === modelId)?.options ?? [];
}

export function displayedValue(
	option: HarnessModelOptionDescriptor,
	stored: ModelOptionValues,
): ModelOptionValue | undefined {
	return option.key in stored ? stored[option.key] : option.defaultValue;
}

// @lore: withOptionValue — value at harness default clears the key; no stored key = "track harness default"
export function withOptionValue(
	stored: ModelOptionValues,
	option: HarnessModelOptionDescriptor,
	value: ModelOptionValue | undefined,
): ModelOptionValues {
	const next: Record<string, ModelOptionValue> = { ...stored };
	const clears =
		value === undefined ||
		value === "" ||
		(!option.required && option.defaultValue !== undefined && value === option.defaultValue);
	if (clears) {
		delete next[option.key];
	} else {
		next[option.key] = value;
	}
	return next;
}

// @lore: reconcileForModel — undeclared keys dropped; unknown values kept (empty declaration can mean unreachable harness, not no options)
export function reconcileForModel(
	stored: ModelOptionValues,
	declared: readonly HarnessModelOptionDescriptor[],
): ModelOptionValues {
	const byKey = new Map(declared.map((option) => [option.key, option]));
	const next: Record<string, ModelOptionValue> = {};
	for (const [key, value] of Object.entries(stored)) {
		const option = byKey.get(key);
		if (!option) continue;
		if (option.control.kind === "select") {
			const offered = option.control.choices.some((choice) => choice.value === String(value));
			if (!offered) continue;
		}
		next[key] = value;
	}
	return next;
}
