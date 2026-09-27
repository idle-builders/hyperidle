import type { HarnessAdapter, HarnessCapabilities } from "@hyperidle/harness-protocol";
import { describe, expect, it } from "vitest";
import { AdapterPool } from "../adapter-pool.js";
import { discoverLocalHarnesses } from "../harness-discovery.js";
import {
	CLAUDE_MODEL_COMMAND_CAPTURE,
	CLAUDE_MODEL_COMMAND_NO_LIST_CAPTURE,
} from "./__fixtures__/claude-model-command.js";
import { CODEX_MODELS_CACHE_CAPTURE } from "./__fixtures__/codex-models-cache.js";
import { CURSOR_LIST_MODELS_CAPTURE } from "./__fixtures__/cursor-list-models.js";

const OPENCODE_MODELS = `opencode/bad
{ bad json
opencode/good
{"id":"good","providerID":"openrouter","name":"Good","limit":{"context":200000}}`;

const response = (stdout = "", exitCode = 0, stderr = "") => ({ stdout, stderr, exitCode });

// @lore this file keeps only the harness-family assertions — inherited-reach probes live in agent-orchestration/connections.
function discoveryRunner(overrides: Readonly<Record<string, ReturnType<typeof response>>> = {}) {
	const defaults: Readonly<Record<string, ReturnType<typeof response>>> = {
		"codex --version": response("codex-cli 1.2.3"),
		"codex login status": response("Logged in using ChatGPT"),
		"claude --version": response("2.0.0"),
		"claude auth status": response('{"loggedIn":true}'),
		"claude -p /model --output-format json": response(CLAUDE_MODEL_COMMAND_CAPTURE),
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

/**
 * Codex's models come from its own cache file on disk. A unit test must never
 * read the real one — the result would depend on whose machine it ran on — so
 * every hermetic call here says there is no cache. The real file is exercised by
 * the captured fixture below and by the real-harness lane.
 */
const noCodexCache = async (): Promise<string | null> => null;

/**
 * A real capture of `~/.codex/models_cache.json`, trimmed to the fields this
 * parser reads. Captured, never hand-written — a hand-written fixture would only
 * prove the parser agrees with our idea of the format.
 */
const CODEX_CACHE_FIXTURE = CODEX_MODELS_CACHE_CAPTURE;

describe("discoverLocalHarnesses cohesive discovery", () => {
	it("offers the model names claude itself says it accepts", async () => {
		const result = await discoverLocalHarnesses({
			run: discoveryRunner(),
			env: {},
			readCodexModelCache: noCodexCache,
		});
		const claude = result["claude-code"];

		expect(claude.state).toBe("ready");
		// Exactly the names from the captured `/model` answer, in its order. Every
		// one is a string `--model` accepts, which is the only property that makes a
		// model offerable at all.
		expect(claude.models?.map((model) => model.id)).toEqual([
			"sonnet",
			"opus",
			"haiku",
			"fable",
			"best",
			"sonnet[1m]",
			"opus[1m]",
			"fable[1m]",
			"opusplan",
		]);
	});

	it("does not offer claude's `default`, because that is the absence of a choice", async () => {
		const result = await discoverLocalHarnesses({
			run: discoveryRunner(),
			env: {},
			readCodexModelCache: noCodexCache,
		});
		// `/model` lists `default` alongside the real names. Offering it would put
		// "no model" in a model dropdown that already has an empty option, and it
		// can never satisfy "the model you picked is the model that ran".
		expect(result["claude-code"].models?.map((model) => model.id)).not.toContain("default");
	});

	it("reports no claude models when its own answer names none", async () => {
		const result = await discoverLocalHarnesses({
			run: discoveryRunner({
				"claude -p /model --output-format json": response(CLAUDE_MODEL_COMMAND_NO_LIST_CAPTURE),
			}),
			env: {},
			readCodexModelCache: noCodexCache,
		});
		// Silence, not a guess: the same rule codex's cache reader follows.
		expect(result["claude-code"]).toMatchObject({ state: "ready" });
		expect(result["claude-code"].models).toEqual([]);
	});

	it("never sends a bare prompt to claude to find out what it can run", async () => {
		const invoked: string[] = [];
		await discoverLocalHarnesses({
			run: async (args) => {
				invoked.push(args.join(" "));
				const key = args.join(" ");
				return (
					{
						"claude --version": response("2.0.0"),
						"claude auth status": response('{"loggedIn":true}'),
						"claude -p /model --output-format json": response(CLAUDE_MODEL_COMMAND_CAPTURE),
					}[key] ?? response("", 1)
				);
			},
			env: {},
			readCodexModelCache: noCodexCache,
		});
		// `claude models` is not a subcommand — the binary answers it with a model
		// turn. Every claude invocation discovery makes must be a flagged command,
		// never a bare word the CLI will treat as something to think about.
		expect(invoked).not.toContain("claude models");
		for (const call of invoked.filter((c) => c.startsWith("claude "))) {
			expect(call).toMatch(/claude (--version|auth status|-p \/model --output-format json)$/);
		}
	});

	it("offers the models cursor-agent lists for the signed-in account", async () => {
		const result = await discoverLocalHarnesses({
			run: discoveryRunner({
				"cursor-agent --version": response("2025.1.1"),
				"cursor-agent status": response("Logged in as someone@example.com"),
				"cursor-agent --list-models": response(CURSOR_LIST_MODELS_CAPTURE),
			}),
			env: {},
			readCodexModelCache: noCodexCache,
		});
		const cursor = result["cursor-agent"];

		expect(cursor.state).toBe("ready");
		expect(cursor.models?.map((model) => model.id)).toContain("composer-2.5");
		expect(cursor.models?.map((model) => model.id)).toContain("gemini-3-flash");
		expect(cursor.models?.length).toBe(18);
	});

	it("strips cursor's moving `(current)` and `(default)` markers from labels", async () => {
		const result = await discoverLocalHarnesses({
			run: discoveryRunner({
				"cursor-agent --version": response("2025.1.1"),
				"cursor-agent status": response("Logged in as someone@example.com"),
				"cursor-agent --list-models": response(CURSOR_LIST_MODELS_CAPTURE),
			}),
			env: {},
			readCodexModelCache: noCodexCache,
		});
		// The suffix marks whichever model the last run selected, so it moves
		// between probes. Keeping it makes a label change under the reader.
		const marked = result["cursor-agent"].models?.find((model) => model.id === "gpt-5.2");
		expect(marked?.label).toBe("GPT-5.2");
		for (const model of result["cursor-agent"].models ?? []) {
			expect(model.label).not.toMatch(/\((current|default)\)/);
		}
	});

	it("does not offer cursor's `auto`, because it hands the choice back to the harness", async () => {
		const result = await discoverLocalHarnesses({
			run: discoveryRunner({
				"cursor-agent --version": response("2025.1.1"),
				"cursor-agent status": response("Logged in as someone@example.com"),
				"cursor-agent --list-models": response(CURSOR_LIST_MODELS_CAPTURE),
			}),
			env: {},
			readCodexModelCache: noCodexCache,
		});
		expect(result["cursor-agent"].models?.map((model) => model.id)).not.toContain("auto");
	});

	it("reports no cursor models when its listing fails, without disturbing readiness", async () => {
		const result = await discoverLocalHarnesses({
			run: discoveryRunner({
				"cursor-agent --version": response("2025.1.1"),
				"cursor-agent status": response("Logged in as someone@example.com"),
				"cursor-agent --list-models": response("", 1, "boom"),
			}),
			env: {},
			readCodexModelCache: noCodexCache,
		});
		expect(result["cursor-agent"]).toMatchObject({ state: "ready" });
		expect(result["cursor-agent"].models).toEqual([]);
	});

	it("reports no Codex models when its cache is absent, and skips malformed OpenCode blocks", async () => {
		const result = await discoverLocalHarnesses({
			run: discoveryRunner(),
			env: {},
			readCodexModelCache: noCodexCache,
		});
		expect(result.codex).toMatchObject({ state: "ready", version: "codex-cli 1.2.3" });
		// No cache to read means no models — codex behaves exactly as it did before
		// it could offer any, rather than falling back to a guessed list.
		expect(result.codex.models).toEqual([]);
		expect(result.opencode.models).toEqual([
			expect.objectContaining({ id: "good", label: "Good", contextWindow: 200_000 }),
		]);
	});

	it("returns empty OpenCode models for empty and wholly malformed output", async () => {
		for (const stdout of ["", "opencode/bad\n{ definitely not json"]) {
			const result = await discoverLocalHarnesses({
				run: discoveryRunner({ "opencode models --verbose": response(stdout) }),
				env: {},
				readCodexModelCache: noCodexCache,
			});
			expect(result.opencode.models).toEqual([]);
		}
	});

	it("maps Claude auth failures and unparsable health without inventing readiness", async () => {
		const failed = await discoverLocalHarnesses({
			run: discoveryRunner({ "claude auth status": response("denied", 1, "denied") }),
			env: {},
			readCodexModelCache: noCodexCache,
		});
		expect(failed["claude-code"]).toMatchObject({
			state: "installed",
			reason: expect.stringContaining("failed"),
		});

		const malformed = await discoverLocalHarnesses({
			run: discoveryRunner({ "claude auth status": response("not-json") }),
			env: {},
			readCodexModelCache: noCodexCache,
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
	it("prefers discovered models for a registered harness and retains known missing families", () => {
		const pool = new AdapterPool({
			opencode: {
				state: "ready",
				models: [
					{
						id: "openrouter/discovered",
						label: "Discovered",
						provider: "openrouter",
						contextWindow: 128_000,
						selectable: true,
						options: [],
					},
				],
			},
			codex: { state: "missing" },
			"claude-code": { state: "missing" },
			"cursor-agent": { state: "missing" },
		});
		pool.register("opencode", adapter, {
			type: "opencode",
			name: "OpenCode",
			kind: "local",
			modelProviders: ["openrouter"],
			maxConcurrent: 1,
		});

		const catalog = pool.describe();
		expect(
			catalog.find((entry) => entry.type === "opencode")?.models.map((model) => model.id),
		).toEqual(["openrouter/discovered"]);
		expect(catalog.find((entry) => entry.type === "codex")?.discovery.state).toBe("missing");
	});
});

describe("what each harness declares its models can be configured with", () => {
	it("codex reads its models, and each one's own reasoning levels, from its cache", async () => {
		const result = await discoverLocalHarnesses({
			run: discoveryRunner(),
			env: {},
			readCodexModelCache: async () => CODEX_CACHE_FIXTURE,
		});

		const models = result.codex.models ?? [];
		expect(models.length).toBeGreaterThan(0);

		// The levels genuinely differ per model — which is why a single hardcoded
		// list would be wrong in both directions.
		const bySlug = new Map(models.map((m) => [m.id, m]));
		const sol = bySlug.get("gpt-5.6-sol");
		const four = bySlug.get("gpt-5.4");
		const effortsOf = (m: (typeof models)[number] | undefined): string[] => {
			const control = m?.options[0]?.control;
			return control?.kind === "select" ? control.choices.map((c) => c.value) : [];
		};
		expect(effortsOf(sol)).toContain("ultra");
		expect(effortsOf(four)).not.toContain("ultra");
		expect(effortsOf(four).length).toBeLessThan(effortsOf(sol).length);

		// The model's own default is offered as the option's default.
		expect(four?.options[0]?.defaultValue).toBe("medium");
	});

	it("codex offers only the models its own file marks selectable", async () => {
		const result = await discoverLocalHarnesses({
			run: discoveryRunner(),
			env: {},
			readCodexModelCache: async () => CODEX_CACHE_FIXTURE,
		});

		const ids = (result.codex.models ?? []).map((m) => m.id);
		// Present in the file, but not API-supported, so not offered.
		expect(ids).not.toContain("gpt-5.3-codex-spark");
	});

	it("a cache that is missing, unreadable or nonsense means no models at all", async () => {
		for (const raw of [null, "not json", "{}", '{"models":"nope"}', '{"models":[]}']) {
			const result = await discoverLocalHarnesses({
				run: discoveryRunner(),
				env: {},
				readCodexModelCache: async () => raw,
			});
			// Never a guessed list — silence is the only failure mode.
			expect(result.codex.models).toEqual([]);
		}
	});

	it("claude declares its effort levels on every model it discovers", async () => {
		const result = await discoverLocalHarnesses({
			run: discoveryRunner(),
			env: {},
			readCodexModelCache: noCodexCache,
		});

		for (const model of result["claude-code"].models ?? []) {
			const control = model.options[0]?.control;
			expect(model.options[0]?.key).toBe("effort");
			expect(control?.kind === "select" ? control.choices.map((c) => c.value) : []).toEqual([
				"low",
				"medium",
				"high",
				"xhigh",
				"max",
			]);
		}
	});

	it("opencode declares a model's variants, and nothing for a model with none", async () => {
		const withVariants = JSON.stringify({
			id: "has-variants",
			name: "Has Variants",
			providerID: "anthropic",
			limit: { context: 200_000 },
			variants: { low: { reasoningEffort: "low" }, high: { reasoningEffort: "high" } },
		});
		const withoutVariants = JSON.stringify({
			id: "plain",
			name: "Plain",
			providerID: "anthropic",
			limit: { context: 200_000 },
			variants: {},
		});

		const result = await discoverLocalHarnesses({
			run: discoveryRunner({
				// Real shape: a "provider/id" header line before each JSON blob.
				"opencode models --verbose": response(
					`anthropic/has-variants\n${withVariants}\nanthropic/plain\n${withoutVariants}`,
				),
			}),
			env: {},
			readCodexModelCache: noCodexCache,
		});

		const models = result.opencode.models ?? [];
		const declared = models.find((m) => m.id === "has-variants");
		const plain = models.find((m) => m.id === "plain");
		const control = declared?.options[0]?.control;
		expect(declared?.options[0]?.key).toBe("variant");
		expect(control?.kind === "select" ? control.choices.map((c) => c.value) : []).toEqual([
			"low",
			"high",
		]);
		// A model with no variants declares nothing, so the editor shows nothing.
		expect(plain?.options).toEqual([]);
	});
});
