/**
 * What the agent editor shows for the options its selected model declares, and
 * what a change to one of those controls stores.
 *
 * The rule the whole surface turns on: **a harness default is shown, never
 * stored.** A control sitting at its default contributes no key at all, so an
 * absent key means "whatever the harness does" rather than "unset". That is what
 * keeps an agent nobody has configured running exactly as it did before, and
 * what stops an agent being pinned to whatever the default happened to be the
 * day someone opened the editor.
 */

import type {
	HarnessCapabilityDescriptor,
	HarnessModelOptionDescriptor,
} from "@hyperidle/harness-capability";

export type ModelOptionValue = string | number | boolean;
export type ModelOptionValues = Readonly<Record<string, ModelOptionValue>>;

/** The leading choice of an optional select — the harness's own default. */
export function defaultChoiceLabel(option: HarnessModelOptionDescriptor): string {
	return typeof option.defaultValue === "string"
		? `Default (${option.defaultValue})`
		: "Harness default";
}

/**
 * The options the selected model declares, or none.
 *
 * Sourced purely from the descriptor — no harness-type branching. A harness that
 * declares nothing, a model that declares nothing, and a harness whose probe
 * failed all arrive here the same way and all produce an empty list, which the
 * editor renders as nothing at all.
 */
export function declaredOptionsFor(
	descriptor: HarnessCapabilityDescriptor | undefined,
	modelId: string,
): readonly HarnessModelOptionDescriptor[] {
	if (!(descriptor && modelId)) return [];
	return descriptor.models.find((model) => model.id === modelId)?.options ?? [];
}

/** The value a control should display: what is stored, else the harness default. */
export function displayedValue(
	option: HarnessModelOptionDescriptor,
	stored: ModelOptionValues,
): ModelOptionValue | undefined {
	return option.key in stored ? stored[option.key] : option.defaultValue;
}

/**
 * Apply one control's change to the stored set.
 *
 * A value equal to the harness's default clears the key rather than writing it,
 * so returning a control to where it started leaves no trace — the agent goes
 * back to tracking the harness.
 */
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

/**
 * The stored options that still make sense after a model or harness switch.
 *
 * Keys the new model does not declare are dropped, and so is a select value the
 * new model no longer offers. Everything else is kept — a value we cannot check
 * is left alone rather than discarded, because an empty declaration can equally
 * mean the harness could not be reached.
 */
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
