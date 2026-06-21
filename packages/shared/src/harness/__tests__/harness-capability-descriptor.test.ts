import { describe, expect, it } from "vitest";
import type {
	HarnessCapabilityDescriptor,
	HarnessModelOptionDescriptor,
} from "../harness-capability-descriptor.js";
import { HARNESS_OPTION_CONTROL_KINDS } from "../harness-capability-descriptor.js";

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
		scope: "launch",
		defaultValue: "medium",
		...overrides,
	};
}

describe("AM2 HarnessCapabilityDescriptor", () => {
	it("uses the closed generic option control vocabulary", () => {
		expect(HARNESS_OPTION_CONTROL_KINDS).toEqual(["select", "boolean", "number", "text"]);
	});

	it("describes per-model options without backend-specific UI branching", () => {
		const descriptor: HarnessCapabilityDescriptor = {
			type: "fixture-harness",
			name: "Fixture Harness",
			kind: "local",
			accessMode: "api-gateway",
			authAction: {
				kind: "enter_api_key",
				label: "Enter API key",
				credentialNames: ["openrouter_api_key"],
			},
			discovery: { state: "ready" },
			modelProviders: ["openrouter"],
			runtime: {
				preCompactionTrigger: true,
				subAgents: false,
				mcpSupport: false,
				modelProviders: ["openrouter"],
				fileEditing: true,
				toolUse: true,
			},
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
				expect(HARNESS_OPTION_CONTROL_KINDS).toContain(option.control.kind);
				if (option.control.kind === "select") {
					expect(option.control.choices.length).toBeGreaterThan(0);
				}
			}
		}
	});
});
