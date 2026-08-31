import { describe, expect, it } from "vitest";
import type {
	HarnessCapabilityDescriptor,
	HarnessModelOptionDescriptor,
} from "../harness-capability-descriptor.js";

function selectOption(
	overrides: Partial<HarnessModelOptionDescriptor> = {},
): HarnessModelOptionDescriptor {
	return {
		key: "reasoning_effort",
		label: "Reasoning effort",
		control: {
			kind: "select",
			choices: [
				{ value: "low", label: "Low" },
				{ value: "medium", label: "Medium" },
				{ value: "high", label: "High" },
			],
		},
		required: false,
		defaultValue: "medium",
		...overrides,
	};
}

describe("AM2 HarnessCapabilityDescriptor", () => {
	it("describes per-model options without backend-specific UI branching", () => {
		const descriptor: HarnessCapabilityDescriptor = {
			type: "fixture-harness",
			name: "Fixture Harness",
			kind: "local",
			authAction: {
				kind: "enter_api_key",
				label: "Enter API key",
				credentialNames: ["openrouter_api_key"],
			},
			discovery: { state: "ready" },
			acceptsApiKey: true,
			modelProviders: ["openrouter"],
			models: [
				{
					id: "model-a",
					label: "Model A",
					provider: "openrouter",
					contextWindow: 128_000,
					selectable: true,
					inheritedFromGateway: true,
					options: [selectOption()],
				},
				{
					id: "model-b",
					label: "Model B",
					provider: "openrouter",
					contextWindow: 64_000,
					selectable: true,
					inheritedFromGateway: true,
					options: [selectOption({ defaultValue: "high" })],
				},
			],
		};

		expect(descriptor.models).toHaveLength(2);
		for (const model of descriptor.models) {
			for (const option of model.options) {
				expect(option.key).toBeTruthy();
				expect(option.label).toBeTruthy();
				expect(["select", "boolean", "number", "text"]).toContain(option.control.kind);
				if (option.control.kind === "select") {
					expect(option.control.choices.length).toBeGreaterThan(0);
				}
			}
		}
	});
});
