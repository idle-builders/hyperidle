/**
 * AV2 — Harness discovery unit tests (RED phase)
 *
 * AC-2 (discovery):
 *  - builtin probe: stubbed /models payload → yields those model ids as descriptor.models
 *  - builtin probe: no key → models: [] (never fabricated, never MODEL_CATALOG)
 *  - claude parser: real-captured fixture → expected descriptors
 *  - opencode parser: real-captured fixture → expected descriptors
 *  - codex: models: [] always
 *  - describeRegisteredHarness: discovered models from discoveries[type].models merged in
 */

import type { HarnessCapabilities, HarnessModelDescriptor } from "@hyperidle/shared";
import { describe, expect, it } from "vitest";
import type { AdapterMeta } from "../adapter-pool.js";
import { describeRegisteredHarness } from "../harness-capability-descriptors.js";
import { parseClaudeModelsOutput, parseOpencodeModelsOutput } from "../harness-discovery.js";

// ---------------------------------------------------------------------------
// Real-captured claude models output (captured 2026-07-06 from /opt/homebrew/bin/claude models)
// ---------------------------------------------------------------------------

const CLAUDE_MODELS_FIXTURE = `Current Claude models:

| Model | ID | Context | In $/1M | Out $/1M |
|---|---|---|---|---|
| **Fable 5** | \`claude-fable-5\` | 1M | $10 | $50 |
| **Opus 4.8** | \`claude-opus-4-8\` | 1M | $5 | $25 |
| Opus 4.7 | \`claude-opus-4-7\` | 1M | $5 | $25 |
| Opus 4.6 | \`claude-opus-4-6\` | 1M | $5 | $25 |
| **Sonnet 4.6** | \`claude-sonnet-4-6\` | 1M | $3 | $15 |
| **Haiku 4.5** | \`claude-haiku-4-5\` | 200K | $1 | $5 |

**Picking:**
- **Fable 5** — most capable, tier above Opus. Highest cost.
`;

// ---------------------------------------------------------------------------
// Real-captured opencode models --verbose output (captured 2026-07-06)
// ---------------------------------------------------------------------------

const OPENCODE_MODELS_FIXTURE = `opencode/big-pickle
{
  "id": "big-pickle",
  "providerID": "opencode",
  "name": "Big Pickle",
  "family": "big-pickle",
  "api": {
    "id": "big-pickle",
    "url": "https://opencode.ai/zen/v1",
    "npm": "@ai-sdk/openai-compatible"
  },
  "status": "active",
  "headers": {},
  "options": {},
  "cost": {
    "input": 0,
    "output": 0,
    "cache": {
      "read": 0,
      "write": 0
    }
  },
  "limit": {
    "context": 200000,
    "input": 160000,
    "output": 32000
  },
  "capabilities": {
    "temperature": true,
    "reasoning": true,
    "attachment": false,
    "toolcall": true
  },
  "release_date": "2025-10-17",
  "variants": {}
}
opencode/deepseek-v4-flash-free
{
  "id": "deepseek-v4-flash-free",
  "providerID": "opencode",
  "name": "DeepSeek V4 Flash Free",
  "family": "deepseek-flash-free",
  "api": {
    "id": "deepseek-v4-flash-free",
    "url": "https://opencode.ai/zen/v1",
    "npm": "@ai-sdk/openai-compatible"
  },
  "status": "active",
  "headers": {},
  "options": {},
  "cost": {
    "input": 0,
    "output": 0
  },
  "limit": {
    "context": 200000
  },
  "capabilities": {
    "temperature": true
  },
  "release_date": "2025-01-01",
  "variants": {}
}
`;

// ---------------------------------------------------------------------------
// parseClaudeModelsOutput
// ---------------------------------------------------------------------------

describe("parseClaudeModelsOutput", () => {
	it("parses the real-captured claude models Markdown table", () => {
		const models = parseClaudeModelsOutput(CLAUDE_MODELS_FIXTURE);
		expect(models.length).toBeGreaterThan(0);

		const ids = models.map((m) => m.id);
		expect(ids).toContain("claude-fable-5");
		expect(ids).toContain("claude-opus-4-8");
		expect(ids).toContain("claude-sonnet-4-6");
		expect(ids).toContain("claude-haiku-4-5");
	});

	it("strips backticks from the ID column", () => {
		const models = parseClaudeModelsOutput(CLAUDE_MODELS_FIXTURE);
		for (const m of models) {
			expect(m.id).not.toContain("`");
		}
	});

	it("strips bold markers from the Model column to form labels", () => {
		const models = parseClaudeModelsOutput(CLAUDE_MODELS_FIXTURE);
		const fable = models.find((m) => m.id === "claude-fable-5");
		expect(fable).toBeDefined();
		expect(fable!.label).not.toContain("**");
	});

	it("parses context window correctly (1M → 1000000, 200K → 200000)", () => {
		const models = parseClaudeModelsOutput(CLAUDE_MODELS_FIXTURE);
		const opus = models.find((m) => m.id === "claude-opus-4-8");
		const haiku = models.find((m) => m.id === "claude-haiku-4-5");
		expect(opus?.contextWindow).toBe(1_000_000);
		expect(haiku?.contextWindow).toBe(200_000);
	});

	it("returns [] on empty or non-table input (no crash)", () => {
		expect(parseClaudeModelsOutput("")).toEqual([]);
		expect(parseClaudeModelsOutput("no table here")).toEqual([]);
	});

	it("sets selectable:true for each returned model", () => {
		const models = parseClaudeModelsOutput(CLAUDE_MODELS_FIXTURE);
		for (const m of models) {
			expect(m.selectable).toBe(true);
		}
	});
});

// ---------------------------------------------------------------------------
// parseOpencodeModelsOutput
// ---------------------------------------------------------------------------

describe("parseOpencodeModelsOutput", () => {
	it("parses the real-captured opencode models --verbose output", () => {
		const models = parseOpencodeModelsOutput(OPENCODE_MODELS_FIXTURE);
		expect(models.length).toBeGreaterThan(0);
	});

	it("extracts id from the JSON body", () => {
		const models = parseOpencodeModelsOutput(OPENCODE_MODELS_FIXTURE);
		const ids = models.map((m) => m.id);
		expect(ids).toContain("big-pickle");
		expect(ids).toContain("deepseek-v4-flash-free");
	});

	it("extracts name as label", () => {
		const models = parseOpencodeModelsOutput(OPENCODE_MODELS_FIXTURE);
		const bigPickle = models.find((m) => m.id === "big-pickle");
		expect(bigPickle?.label).toBe("Big Pickle");
	});

	it("extracts context window from limit.context", () => {
		const models = parseOpencodeModelsOutput(OPENCODE_MODELS_FIXTURE);
		const bigPickle = models.find((m) => m.id === "big-pickle");
		expect(bigPickle?.contextWindow).toBe(200000);
	});

	it("returns [] on empty input", () => {
		expect(parseOpencodeModelsOutput("")).toEqual([]);
	});

	it("skips malformed JSON blocks gracefully", () => {
		const broken = `opencode/bad\n{ bad json\nopencode/good\n{"id":"good","name":"Good","limit":{"context":1000}}`;
		const models = parseOpencodeModelsOutput(broken);
		// 'good' should be parsed; 'bad' silently skipped
		const ids = models.map((m) => m.id);
		expect(ids).toContain("good");
	});
});

// ---------------------------------------------------------------------------
// describeRegisteredHarness: discoveries[type].models merged into descriptor
// ---------------------------------------------------------------------------

describe("describeRegisteredHarness: discoveries[type].models merged for CLI harnesses", () => {
	const BASE_META: AdapterMeta = {
		type: "opencode",
		name: "OpenCode",
		kind: "local",
		modelProviders: [],
		maxConcurrent: 1,
	};

	const BASE_CAPS: HarnessCapabilities = {
		accessMode: "provider-subscription-cli",
		preCompactionTrigger: false,
		subAgents: false,
		mcpSupport: false,
		modelProviders: [],
		fileEditing: false,
		toolUse: false,
		discovery: { state: "ready" },
		returnEnforcement: "none",
	};

	// @lore AV2: provider omitted here since "opencode" is not a valid ModelProvider.
	// The parser maps providerID → ModelProvider; unknown providers are omitted.
	const DISCOVERED_MODELS: readonly HarnessModelDescriptor[] = [
		{
			id: "opencode/big-pickle",
			label: "Big Pickle",
			contextWindow: 200000,
			selectable: true,
			inheritedFromGateway: false,
			options: [],
		},
		{
			id: "deepseek-v4-flash-free",
			label: "DeepSeek V4 Flash Free",
			contextWindow: 200000,
			selectable: true,
			inheritedFromGateway: false,
			options: [],
		},
	];

	it("uses discoveries[type].models when provided (overrides empty cliModels)", () => {
		const descriptor = describeRegisteredHarness(BASE_META, BASE_CAPS, {
			opencode: {
				state: "ready",
				models: DISCOVERED_MODELS,
			},
		});

		const ids = descriptor.models.map((m) => m.id);
		expect(ids).toContain("opencode/big-pickle");
		expect(ids).toContain("deepseek-v4-flash-free");
	});

	it("falls back to empty when no discoveries and no descriptorModels", () => {
		const descriptor = describeRegisteredHarness(BASE_META, BASE_CAPS, {});
		expect(descriptor.models).toHaveLength(0);
	});

	it("builtin: uses discoveries[builtin].models when provided", () => {
		const builtinMeta: AdapterMeta = {
			type: "builtin",
			name: "Built-in",
			kind: "local",
			modelProviders: ["anthropic", "openrouter"],
			maxConcurrent: 10,
		};

		const builtinCaps: HarnessCapabilities = {
			...BASE_CAPS,
			accessMode: "api-gateway",
			modelProviders: ["anthropic", "openrouter"],
		};

		const discoveredBuiltinModels: readonly HarnessModelDescriptor[] = [
			{
				id: "openrouter/deepseek/deepseek-v4-flash",
				label: "DeepSeek V4",
				provider: "openrouter",
				contextWindow: 128000,
				selectable: true,
				inheritedFromGateway: true,
				options: [],
			},
		];

		const descriptor = describeRegisteredHarness(builtinMeta, builtinCaps, {
			builtin: { state: "ready", models: discoveredBuiltinModels },
		});

		const ids = descriptor.models.map((m) => m.id);
		expect(ids).toContain("openrouter/deepseek/deepseek-v4-flash");
	});
});
