/**
 * The rule these pin: a harness default is SHOWN but never STORED.
 *
 * Getting this backwards is not a cosmetic bug — it would pin every agent to
 * whatever the default was the day someone opened the editor, and quietly send
 * an explicit value where nothing was sent before.
 */

import type {
	HarnessCapabilityDescriptor,
	HarnessModelOptionDescriptor,
} from "@hyperidle/harness-capability";
import { describe, expect, test } from "vitest";
import {
	declaredOptionsFor,
	displayedValue,
	reconcileForModel,
	withOptionValue,
} from "../agent-model-options.js";

const EFFORT: HarnessModelOptionDescriptor = {
	key: "effort",
	label: "Effort",
	control: {
		kind: "select",
		choices: [
			{ value: "low", label: "low" },
			{ value: "medium", label: "medium" },
			{ value: "high", label: "high" },
		],
	},
	required: false,
	defaultValue: "medium",
};

const REQUIRED_MODE: HarnessModelOptionDescriptor = {
	key: "mode",
	label: "Mode",
	control: { kind: "select", choices: [{ value: "build", label: "build" }] },
	required: true,
	defaultValue: "build",
};

function descriptorWith(
	modelId: string,
	options: readonly HarnessModelOptionDescriptor[],
): HarnessCapabilityDescriptor {
	return {
		type: "claude-code",
		name: "Claude Code",
		kind: "local",
		authAction: { kind: "none", label: "" },
		discovery: { state: "ready" },
		models: [{ id: modelId, label: modelId, selectable: true, options }],
		modelProviders: [],
	};
}

describe("what the editor shows", () => {
	test("a model that declares nothing produces nothing to render", () => {
		expect(declaredOptionsFor(descriptorWith("m1", []), "m1")).toEqual([]);
		// No model selected, and a harness we have no descriptor for.
		expect(declaredOptionsFor(descriptorWith("m1", [EFFORT]), "")).toEqual([]);
		expect(declaredOptionsFor(undefined, "m1")).toEqual([]);
	});

	test("an untouched control shows the harness's default", () => {
		expect(displayedValue(EFFORT, {})).toBe("medium");
		expect(displayedValue(EFFORT, { effort: "high" })).toBe("high");
	});
});

describe("what the editor stores", () => {
	test("moving a control away from its default stores it", () => {
		expect(withOptionValue({}, EFFORT, "high")).toEqual({ effort: "high" });
	});

	test("a control sitting at the harness default stores nothing", () => {
		// The agent keeps tracking the harness rather than freezing today's default.
		expect(withOptionValue({}, EFFORT, "medium")).toEqual({});
	});

	test("moving a control back to its default clears the key", () => {
		expect(withOptionValue({ effort: "high" }, EFFORT, "medium")).toEqual({});
	});

	test("choosing the empty leading choice clears the key", () => {
		expect(withOptionValue({ effort: "high" }, EFFORT, "")).toEqual({});
	});

	test("a required option stores its value even at the default", () => {
		expect(withOptionValue({}, REQUIRED_MODE, "build")).toEqual({ mode: "build" });
	});

	test("one control's change leaves the others alone", () => {
		expect(withOptionValue({ mode: "build" }, EFFORT, "low")).toEqual({
			mode: "build",
			effort: "low",
		});
	});
});

describe("switching model or harness", () => {
	test("a key the new model does not declare is dropped", () => {
		expect(reconcileForModel({ effort: "high", variant: "max" }, [EFFORT])).toEqual({
			effort: "high",
		});
	});

	test("a value the new model no longer offers is dropped", () => {
		expect(reconcileForModel({ effort: "xhigh" }, [EFFORT])).toEqual({});
	});

	test("switching to a model that declares nothing leaves nothing", () => {
		expect(reconcileForModel({ effort: "high" }, [])).toEqual({});
	});

	test("a value we cannot check is kept rather than discarded", () => {
		// A free-text option has no choice list to check against, and an absent
		// list can equally mean the harness could not be reached.
		const freeText: HarnessModelOptionDescriptor = {
			key: "note",
			label: "Note",
			control: { kind: "text" },
			required: false,
		};
		expect(reconcileForModel({ note: "anything" }, [freeText])).toEqual({ note: "anything" });
	});
});
