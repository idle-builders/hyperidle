/**
 * AV2 — modelOptionsForHarness unit tests (RED phase)
 *
 * AC-2: Helper reads descriptor.models (never MODEL_CATALOG)
 *  - discovered list → those ids as options
 *  - empty models → no options, hasModels:false
 *  - NEVER returns MODEL_CATALOG
 */

import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import { describe, expect, it } from "vitest";
import { modelOptionsForHarness } from "../model-options-for-harness.js";

// ---------------------------------------------------------------------------
// Fixtures — realistic HarnessCapabilityDescriptor shapes
// ---------------------------------------------------------------------------

const BUILTIN_DESCRIPTOR: HarnessCapabilityDescriptor = {
	type: "builtin",
	name: "Built-in",
	kind: "local",
	models: [
		{
			id: "deepseek/deepseek-v4-flash",
			label: "DeepSeek V4 Flash",
			provider: "openrouter",
			contextWindow: 128000,
			selectable: true,
			inheritedFromGateway: true,
			options: [],
		},
		{
			id: "claude-haiku-4-5",
			label: "Claude Haiku 4.5",
			provider: "anthropic",
			contextWindow: 200000,
			selectable: true,
			inheritedFromGateway: true,
			options: [],
		},
		{
			id: "openai/gpt-4o",
			label: "GPT-4o",
			provider: "openai-compatible",
			contextWindow: 128000,
			selectable: true,
			inheritedFromGateway: true,
			options: [],
		},
	],
	modelProviders: ["anthropic", "openrouter", "openai-compatible"],
	accessMode: "api-gateway",
	discovery: { state: "ready" },
	authAction: { kind: "enter_api_key", label: "Enter API key" },
	runtime: {
		preCompactionTrigger: false,
		subAgents: false,
		mcpSupport: false,
		modelProviders: [],
		fileEditing: true,
		toolUse: true,
	},
};

const CODEX_DESCRIPTOR: HarnessCapabilityDescriptor = {
	type: "codex",
	name: "Codex",
	kind: "local",
	models: [],
	modelProviders: [],
	accessMode: "provider-subscription-cli",
	discovery: { state: "ready" },
	authAction: { kind: "native_cli_login", label: "Log in to Codex", command: ["codex", "login"] },
	runtime: {
		preCompactionTrigger: false,
		subAgents: false,
		mcpSupport: false,
		modelProviders: [],
		fileEditing: false,
		toolUse: false,
	},
};

const OPENCODE_DESCRIPTOR: HarnessCapabilityDescriptor = {
	type: "opencode",
	name: "OpenCode",
	kind: "local",
	models: [
		// openrouter is a valid ModelProvider; "opencode" is not, so we omit provider there
		{
			id: "openrouter/z-ai/glm-4.7-flash",
			label: "GLM-4.7 Flash",
			provider: "openrouter",
			contextWindow: 128000,
			selectable: true,
			inheritedFromGateway: false,
			options: [],
		},
		{
			id: "opencode/big-pickle",
			label: "Big Pickle",
			contextWindow: 200000,
			selectable: true,
			inheritedFromGateway: false,
			options: [],
		},
	],
	modelProviders: [],
	accessMode: "provider-subscription-cli",
	discovery: { state: "ready" },
	authAction: {
		kind: "native_cli_login",
		label: "Log in to OpenCode",
		command: ["opencode", "providers", "login"],
	},
	runtime: {
		preCompactionTrigger: false,
		subAgents: false,
		mcpSupport: false,
		modelProviders: [],
		fileEditing: false,
		toolUse: false,
	},
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("modelOptionsForHarness", () => {
	it("returns discovered model ids as options for builtin", () => {
		const result = modelOptionsForHarness(BUILTIN_DESCRIPTOR);
		expect(result.hasModels).toBe(true);
		const ids = result.options.map((o) => o.value);
		expect(ids).toContain("deepseek/deepseek-v4-flash");
		expect(ids).toContain("claude-haiku-4-5");
		expect(ids).toContain("openai/gpt-4o");
	});

	it("includes a system default (empty string) option first", () => {
		const result = modelOptionsForHarness(BUILTIN_DESCRIPTOR);
		expect(result.options[0]?.value).toBe("");
		expect(result.options[0]?.label).toMatch(/default/i);
	});

	it("empty models → hasModels:false, no selectable options (except default)", () => {
		const result = modelOptionsForHarness(CODEX_DESCRIPTOR);
		expect(result.hasModels).toBe(false);
		// Only the default option or empty array
		expect(result.options.filter((o) => o.value !== "")).toHaveLength(0);
	});

	it("opencode discovered models are returned", () => {
		const result = modelOptionsForHarness(OPENCODE_DESCRIPTOR);
		expect(result.hasModels).toBe(true);
		const ids = result.options.map((o) => o.value);
		expect(ids).toContain("openrouter/z-ai/glm-4.7-flash");
		expect(ids).toContain("opencode/big-pickle");
	});

	it("does NOT import or reference MODEL_CATALOG (verified by test contract)", () => {
		// The helper's contract: options are derived ONLY from descriptor.models
		// A descriptor with 2 models → exactly 2 + 1 default options
		const result = modelOptionsForHarness(BUILTIN_DESCRIPTOR);
		// Builtin descriptor has 3 models; if MODEL_CATALOG were used it would have many more
		expect(result.options.filter((o) => o.value !== "")).toHaveLength(3);
	});

	it("labels use the descriptor model's label field", () => {
		const result = modelOptionsForHarness(BUILTIN_DESCRIPTOR);
		const flashOption = result.options.find((o) => o.value === "deepseek/deepseek-v4-flash");
		expect(flashOption?.label).toBe("DeepSeek V4 Flash");
	});
});
