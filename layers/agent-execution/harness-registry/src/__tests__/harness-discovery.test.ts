import type { HarnessAdapter, HarnessCapabilities } from "@hyperidle/harness-protocol";
import { describe, expect, it } from "vitest";
import { AdapterPool } from "../adapter-pool.js";
import { discoverLocalHarnesses } from "../harness-discovery.js";

const CLAUDE_MODELS = `Current Claude models:

| Model | ID | Context | In $/1M | Out $/1M |
|---|---|---|---|---|
| **Fable 5** | \`claude-fable-5\` | 1M | $10 | $50 |
| **Haiku 4.5** | \`claude-haiku-4-5\` | 200K | $1 | $5 |
| Decimal | \`claude-decimal\` | 1.5M | $1 | $5 |
| Numeric | \`claude-numeric\` | 128000 | $1 | $5 |
`;

const OPENCODE_MODELS = `opencode/bad
{ bad json
opencode/good
{"id":"good","providerID":"openrouter","name":"Good","limit":{"context":200000}}`;

const response = (stdout = "", exitCode = 0, stderr = "") => ({ stdout, stderr, exitCode });

// @lore AU36: the inherited-reach probe behavior cases (claude suffix/
// precedence/duplicate/symlink/malformed, deadline ownership, late-settlement)
// moved with the probes into
// `layers/agent-orchestration/connections/src/__tests__/inherited-reach-probes.test.ts`.
// This file keeps the harness-family assertions only.
function discoveryRunner(overrides: Readonly<Record<string, ReturnType<typeof response>>> = {}) {
	const defaults: Readonly<Record<string, ReturnType<typeof response>>> = {
		"codex --version": response("codex-cli 1.2.3"),
		"codex login status": response("Logged in using ChatGPT"),
		"claude --version": response("2.0.0"),
		"claude auth status": response('{"loggedIn":true}'),
		"claude models": response(CLAUDE_MODELS),
		"opencode --version": response("1.0.0"),
		"opencode providers list": response("1 credentials"),
		"opencode models --verbose": response(OPENCODE_MODELS),
		"cursor-agent --version": response("", 1),
	};
	return async (args: readonly string[]) => {
		const key = args.join(" ");
		return overrides[key] ?? defaults[key] ?? response("", 1);
	};
}

describe("discoverLocalHarnesses cohesive discovery", () => {
	it("parses the captured Claude table, context forms, and MCP health end to end", async () => {
		const result = await discoverLocalHarnesses({ run: discoveryRunner(), env: {} });
		const claude = result["claude-code"];

		expect(claude.state).toBe("ready");
		expect(claude.models).toEqual([
			expect.objectContaining({ id: "claude-fable-5", label: "Fable 5", contextWindow: 1_000_000 }),
			expect.objectContaining({
				id: "claude-haiku-4-5",
				label: "Haiku 4.5",
				contextWindow: 200_000,
			}),
			expect.objectContaining({ id: "claude-decimal", contextWindow: 1_500_000 }),
			expect.objectContaining({ id: "claude-numeric", contextWindow: 128_000 }),
		]);
	});

	it("reports honest none for Codex and skips malformed OpenCode blocks", async () => {
		const result = await discoverLocalHarnesses({ run: discoveryRunner(), env: {} });
		expect(result.codex).toMatchObject({ state: "ready", version: "codex-cli 1.2.3" });
		expect(result.codex.models).toBeUndefined();
		expect(result.opencode.models).toEqual([
			expect.objectContaining({ id: "good", label: "Good", contextWindow: 200_000 }),
		]);
	});

	it("returns empty OpenCode models for empty and wholly malformed output", async () => {
		for (const stdout of ["", "opencode/bad\n{ definitely not json"]) {
			const result = await discoverLocalHarnesses({
				run: discoveryRunner({ "opencode models --verbose": response(stdout) }),
				env: {},
			});
			expect(result.opencode.models).toEqual([]);
		}
	});

	it("maps Claude auth failures and unparsable health without inventing readiness", async () => {
		const failed = await discoverLocalHarnesses({
			run: discoveryRunner({ "claude auth status": response("denied", 1, "denied") }),
			env: {},
		});
		expect(failed["claude-code"]).toMatchObject({
			state: "installed",
			reason: expect.stringContaining("failed"),
		});

		const malformed = await discoverLocalHarnesses({
			run: discoveryRunner({ "claude auth status": response("not-json") }),
			env: {},
		});
		expect(malformed["claude-code"]).toMatchObject({
			state: "installed",
			reason: expect.stringContaining("unparsable"),
		});
	});
});

const capabilities: HarnessCapabilities = {
	preCompactionTrigger: false,
	subAgents: false,
	mcpSupport: false,
	modelProviders: ["openrouter"],
	fileEditing: false,
	toolUse: false,
	discovery: { state: "ready" },
	returnEnforcement: "none",
};

const adapter = { getCapabilities: () => capabilities } as HarnessAdapter;

describe("AdapterPool capability catalog merge", () => {
	it("prefers discovered models for registered builtin and retains known missing families", () => {
		const pool = new AdapterPool({
			builtin: {
				state: "ready",
				models: [
					{
						id: "openrouter/discovered",
						label: "Discovered",
						provider: "openrouter",
						contextWindow: 128_000,
						selectable: true,
						inheritedFromGateway: true,
						options: [],
					},
				],
			},
			codex: { state: "missing" },
			"claude-code": { state: "missing" },
			opencode: { state: "missing" },
			"cursor-agent": { state: "missing" },
		});
		pool.register("builtin", adapter, {
			type: "builtin",
			name: "Builtin",
			kind: "local",
			modelProviders: ["openrouter"],
			maxConcurrent: 1,
		});

		const catalog = pool.describe();
		expect(
			catalog.find((entry) => entry.type === "builtin")?.models.map((model) => model.id),
		).toEqual(["openrouter/discovered"]);
		expect(catalog.find((entry) => entry.type === "codex")?.discovery.state).toBe("missing");
	});
});
