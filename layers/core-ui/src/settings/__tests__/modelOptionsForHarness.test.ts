/**
 * modelOptionsForHarness: builds the model dropdown options from a harness's
 * own descriptor.models — never from the global MODEL_CATALOG. Some harnesses
 * (opencode) list models with no `provider` field at all.
 */

import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import { describe, expect, it } from "vitest";
import { modelOptionsForHarness } from "../model-options-for-harness.js";

const MULTI_PROVIDER_DESCRIPTOR: HarnessCapabilityDescriptor = {
	type: "cursor-agent",
	name: "Cursor Agent",
	kind: "local",
	models: [
		{
			id: "deepseek/deepseek-v4-flash",
			label: "DeepSeek V4 Flash",
			provider: "openrouter",
			contextWindow: 128000,
			selectable: true,
			options: [],
		},
		{
			id: "claude-haiku-4-5",
			label: "Claude Haiku 4.5",
			provider: "anthropic",
			contextWindow: 200000,
			selectable: true,
			options: [],
		},
		{
			// opencode-style entry: no provider field
			id: "opencode/big-pickle",
			label: "Big Pickle",
			contextWindow: 200000,
			selectable: true,
			options: [],
		},
	],
	modelProviders: ["anthropic", "openrouter"],
	discovery: { state: "ready" },
	authAction: {
		kind: "native_cli_login",
		label: "Log in to Cursor",
		command: ["cursor-agent", "login"],
	},
};

const NO_MODELS_DESCRIPTOR: HarnessCapabilityDescriptor = {
	type: "codex",
	name: "Codex",
	kind: "local",
	models: [],
	modelProviders: [],
	discovery: { state: "ready" },
	authAction: { kind: "native_cli_login", label: "Log in to Codex", command: ["codex", "login"] },
};

describe("modelOptionsForHarness", () => {
	it("returns exactly the descriptor's own models as options, with labels, plus a default first", () => {
		const result = modelOptionsForHarness(MULTI_PROVIDER_DESCRIPTOR);
		expect(result.hasModels).toBe(true);
		expect(result.options[0]?.value).toBe("");
		expect(result.options[0]?.label).toMatch(/default/i);
		const rest = result.options.filter((o) => o.value !== "");
		expect(rest).toHaveLength(3);
		expect(rest.map((o) => o.value)).toEqual(
			expect.arrayContaining([
				"deepseek/deepseek-v4-flash",
				"claude-haiku-4-5",
				"opencode/big-pickle",
			]),
		);
		expect(rest.find((o) => o.value === "deepseek/deepseek-v4-flash")?.label).toBe(
			"DeepSeek V4 Flash",
		);
	});

	it("empty models → hasModels:false, no selectable options besides the default", () => {
		const result = modelOptionsForHarness(NO_MODELS_DESCRIPTOR);
		expect(result.hasModels).toBe(false);
		expect(result.options.filter((o) => o.value !== "")).toHaveLength(0);
	});
});
