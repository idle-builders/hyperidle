/**
 * CLI harness native metrics capture.
 *
 * The `claude` CLI emits a terminal ndjson result line with `total_cost_usd`.
 * Codex emits token usage on `turn.completed`. OpenCode emits tokens and cost
 * on `step_finish.part`. The adapter normalizes those native fields into
 * `token_usage`, `cost_update`, and `SessionResult.metrics`.
 *
 * Fixtures:
 *   fixtures/cli-result-with-cost.ndjson    — result line with total_cost_usd: 0.0123
 *   fixtures/cli-result-without-cost.ndjson — result line without the field
 *
 * Field name used: `total_cost_usd` (matches `CliAdapterConfig.costField` default "total_cost_usd").
 * Configurable via `CliAdapterConfig.costField` for CLI version drift.
 */

import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import type { HarnessEvent, SessionConfig } from "@hyperidle/shared";
import { describe, expect, it, vi } from "vitest";
import type { CliAdapterConfig } from "../cli-harness-adapter.js";
import { CliHarnessAdapter } from "../cli-harness-adapter.js";

// ── Load fixtures ─────────────────────────────────────────────────────────────

const FIXTURES_DIR = path.join(import.meta.dirname ?? __dirname, "fixtures");

/**
 * The real ndjson terminal result line from the `claude` CLI (pinned fixture
 * to lock the native metric contract).
 * Contains: total_cost_usd: 0.0123 → 1 minor unit (round(0.0123 * 100) = 1)
 */
const CLI_RESULT_WITH_COST = readFileSync(
	path.join(FIXTURES_DIR, "cli-result-with-cost.ndjson"),
	"utf-8",
).trim();

/**
 * Result line WITHOUT total_cost_usd — the missing-field fallback case.
 * Adapter must NOT emit a cost_update; aggregate delta must remain 0.
 */
const CLI_RESULT_WITHOUT_COST = readFileSync(
	path.join(FIXTURES_DIR, "cli-result-without-cost.ndjson"),
	"utf-8",
).trim();

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<CliAdapterConfig> = {}): CliAdapterConfig {
	return {
		binary: "fake-cli",
		args: [],
		envMap: {},
		eventFormat: "ndjson",
		envAllowlist: [],
		...overrides,
	};
}

function makeSessionConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
	return {
		sandboxPath: "/workspace/cli-native-metrics",
		sessionId: "cli-native-metrics-session",
		systemPromptPath: "",
		assembledPrompt: "Do the task.",
		modelTier: "workhorse",
		tools: [],
		resolvedModel: {
			provider: "anthropic",
			model: "claude-3-5-sonnet-20241022",
			apiKey: "sk-test",
			baseUrl: "https://api.anthropic.com",
		},
		mcpConnectionInfo: undefined,
		...overrides,
	};
}

function makeFakeChild(): {
	proc: ChildProcess;
	emitStdout: (line: string) => void;
	emitExit: (code: number | null, signal: string | null) => void;
} {
	const stdout = new EventEmitter() as NodeJS.ReadableStream & EventEmitter;
	const stderr = new EventEmitter() as NodeJS.ReadableStream & EventEmitter;
	const proc = new EventEmitter() as ChildProcess;
	(proc as unknown as { stdout: unknown }).stdout = stdout;
	(proc as unknown as { stderr: unknown }).stderr = stderr;
	(proc as unknown as { pid: number }).pid = 99999;
	proc.kill = vi.fn() as unknown as typeof proc.kill;

	return {
		proc,
		emitStdout: (line: string) => stdout.emit("data", Buffer.from(`${line}\n`)),
		emitExit: (code: number | null, signal: string | null) => proc.emit("exit", code, signal),
	};
}

// ── Verify fixture correctness ────────────────────────────────────────────────

describe("CLI native metrics fixtures", () => {
	it("cli-result-with-cost.ndjson is valid JSON with total_cost_usd", () => {
		const parsed = JSON.parse(CLI_RESULT_WITH_COST) as Record<string, unknown>;
		expect(parsed.type).toBe("result");
		expect(typeof parsed.total_cost_usd).toBe("number");
		expect(parsed.total_cost_usd).toBe(0.0123);
	});

	it("cli-result-without-cost.ndjson is valid JSON without total_cost_usd", () => {
		const parsed = JSON.parse(CLI_RESULT_WITHOUT_COST) as Record<string, unknown>;
		expect(parsed.type).toBe("result");
		expect(parsed.total_cost_usd).toBeUndefined();
	});

	it("0.0123 USD rounds to 1 minor cent unit (round(0.0123 * 100) = 1)", () => {
		expect(Math.round(0.0123 * 100)).toBe(1);
	});
});

// ── result line with total_cost_usd → cost_update event ───────────────────────

describe("CLI result line with total_cost_usd emits cost_update", () => {
	it("streamEvents yields a cost_update with deltaCost = total_cost_usd when result line is present", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(makeConfig({ eventFormat: "ndjson" }), {
			spawnFn: spawnSpy,
		});
		const handle = await adapter.startSession(makeSessionConfig());

		const events: HarnessEvent[] = [];
		const streamPromise = (async () => {
			for await (const event of adapter.streamEvents(handle)) {
				events.push(event);
			}
		})();

		// Emit the terminal result line (with cost field) then exit
		fakeChild.emitStdout(CLI_RESULT_WITH_COST);
		fakeChild.emitExit(0, null);

		await streamPromise;

		const costEvents = events.filter((e) => e.type === "cost_update");
		expect(costEvents).toHaveLength(1);
		const costEvent = costEvents[0] as {
			type: string;
			deltaCost: number;
			totalCost: number;
			currency: string;
		};
		expect(costEvent.deltaCost).toBe(0.0123);
		expect(costEvent.totalCost).toBe(0.0123);
		expect(costEvent.currency).toBe("USD");
	});

	it("buildResult (via stopSession) returns captured minor cost not 0", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(makeConfig({ eventFormat: "ndjson" }), {
			spawnFn: spawnSpy,
		});
		const handle = await adapter.startSession(makeSessionConfig());

		// Drain streamEvents to let the adapter process the result line
		const streamPromise = (async () => {
			for await (const _event of adapter.streamEvents(handle)) {
				// drain
			}
		})();

		fakeChild.emitStdout(CLI_RESULT_WITH_COST);
		fakeChild.emitExit(0, null);
		await streamPromise;

		const result = await adapter.stopSession(handle);

		expect(result.cost.minor).toBe(1);
		expect(result.cost.currency).toBe("USD");
	});

	it("custom costField config reads the cost from an alternate field name", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		// Config with non-default costField
		const config = makeConfig({
			eventFormat: "ndjson",
			// Alternate field names keep CLI version drift localized to config.
			costField: "custom_cost_usd",
		});
		const adapter = new CliHarnessAdapter(config, { spawnFn: spawnSpy });
		const handle = await adapter.startSession(makeSessionConfig());

		const events: HarnessEvent[] = [];
		const streamPromise = (async () => {
			for await (const event of adapter.streamEvents(handle)) {
				events.push(event);
			}
		})();

		// Emit a result line with custom field
		const customResultLine = JSON.stringify({
			type: "result",
			subtype: "success",
			custom_cost_usd: 0.05,
			is_error: false,
		});
		fakeChild.emitStdout(customResultLine);
		fakeChild.emitExit(0, null);
		await streamPromise;

		const costEvents = events.filter((e) => e.type === "cost_update");
		expect(costEvents).toHaveLength(1);
		const costEvent = costEvents[0] as { deltaCost: number };
		expect(costEvent.deltaCost).toBe(0.05);
	});
});

describe("CLI native metrics capture — tokens, turns, duration", () => {
	it("captures Claude result usage, turns, duration, and cost into events and SessionResult", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(
			makeConfig({ eventFormat: "ndjson", eventDialect: "claude-stream-json" }),
			{ spawnFn: spawnSpy },
		);
		const handle = await adapter.startSession(makeSessionConfig());

		const events: HarnessEvent[] = [];
		const streamPromise = (async () => {
			for await (const event of adapter.streamEvents(handle)) {
				events.push(event);
			}
		})();

		fakeChild.emitStdout(
			JSON.stringify({
				type: "result",
				subtype: "success",
				duration_ms: 1559,
				duration_api_ms: 1535,
				num_turns: 1,
				total_cost_usd: 0.01144955,
				usage: {
					input_tokens: 10,
					output_tokens: 49,
					cache_read_input_tokens: 17283,
					cache_creation_input_tokens: 7573,
				},
			}),
		);
		fakeChild.emitExit(0, null);
		await streamPromise;

		const tokenEvent = events.find((event) => event.type === "token_usage");
		expect(tokenEvent).toMatchObject({
			type: "token_usage",
			inputTokens: 10,
			outputTokens: 49,
			cachedInputTokens: 17283,
			cacheCreationInputTokens: 7573,
		});

		const result = await adapter.stopSession(handle);
		expect(result.cost.minor).toBe(1);
		expect(result.tokenUsage.byTier.workhorse).toMatchObject({
			prompt: 10,
			completion: 49,
			cachedPrompt: 17283,
		});
		expect(result.metrics).toMatchObject({
			modelTurns: 1,
			processStarts: 1,
			inputTokens: 10,
			outputTokens: 49,
			cachedInputTokens: 17283,
			cacheCreationInputTokens: 7573,
			durationMs: 1559,
			apiDurationMs: 1535,
			nativeCostUsd: 0.01144955,
		});
	});

	it("captures Codex turn.completed usage and turn count", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(makeConfig({ eventFormat: "ndjson" }), {
			spawnFn: spawnSpy,
		});
		const handle = await adapter.startSession(makeSessionConfig());

		const events: HarnessEvent[] = [];
		const streamPromise = (async () => {
			for await (const event of adapter.streamEvents(handle)) {
				events.push(event);
			}
		})();

		fakeChild.emitStdout(JSON.stringify({ type: "thread.started" }));
		fakeChild.emitStdout(JSON.stringify({ type: "turn.started" }));
		fakeChild.emitStdout(
			JSON.stringify({
				type: "turn.completed",
				usage: {
					input_tokens: 13171,
					cached_input_tokens: 9600,
					output_tokens: 5,
					reasoning_output_tokens: 0,
				},
			}),
		);
		fakeChild.emitExit(0, null);
		await streamPromise;

		expect(events.find((event) => event.type === "token_usage")).toMatchObject({
			type: "token_usage",
			inputTokens: 13171,
			outputTokens: 5,
			cachedInputTokens: 9600,
			reasoningOutputTokens: 0,
		});

		const result = await adapter.stopSession(handle);
		expect(result.tokenUsage.byTier.workhorse).toMatchObject({
			prompt: 13171,
			completion: 5,
			cachedPrompt: 9600,
		});
		expect(result.metrics).toMatchObject({
			modelTurns: 1,
			inputTokens: 13171,
			cachedInputTokens: 9600,
			outputTokens: 5,
			reasoningOutputTokens: 0,
		});
	});

	it("captures OpenCode step_finish tokens, reasoning, cache, cost, and step count", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(makeConfig({ eventFormat: "ndjson" }), {
			spawnFn: spawnSpy,
		});
		const handle = await adapter.startSession(makeSessionConfig());

		const events: HarnessEvent[] = [];
		const streamPromise = (async () => {
			for await (const event of adapter.streamEvents(handle)) {
				events.push(event);
			}
		})();

		fakeChild.emitStdout(JSON.stringify({ type: "step_start", sessionID: "ses_1" }));
		fakeChild.emitStdout(JSON.stringify({ type: "text", part: { type: "text", text: "PING" } }));
		fakeChild.emitStdout(
			JSON.stringify({
				type: "step_finish",
				part: {
					type: "step-finish",
					reason: "stop",
					tokens: {
						total: 7274,
						input: 7134,
						output: 0,
						reasoning: 89,
						cache: { read: 64, write: 0 },
					},
					cost: 0.00046428,
				},
			}),
		);
		fakeChild.emitExit(0, null);
		await streamPromise;

		expect(events.find((event) => event.type === "token_usage")).toMatchObject({
			type: "token_usage",
			inputTokens: 7134,
			outputTokens: 0,
			cachedInputTokens: 64,
			reasoningOutputTokens: 89,
		});
		expect(events.find((event) => event.type === "cost_update")).toMatchObject({
			type: "cost_update",
			deltaCost: 0.00046428,
			totalCost: 0.00046428,
		});

		const result = await adapter.stopSession(handle);
		expect(result.cost.minor).toBe(0);
		expect(result.tokenUsage.byTier.workhorse).toMatchObject({
			prompt: 7134,
			completion: 0,
			cachedPrompt: 64,
		});
		expect(result.metrics).toMatchObject({
			modelTurns: 1,
			inputTokens: 7134,
			outputTokens: 0,
			cachedInputTokens: 64,
			reasoningOutputTokens: 89,
			nativeCostUsd: 0.00046428,
		});
	});
});

// ── result line without total_cost_usd → no cost_update ──────────────────────

describe("CLI result line without total_cost_usd reports zero cost", () => {
	it("streamEvents does NOT yield a cost_update when result line has no cost field", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(makeConfig({ eventFormat: "ndjson" }), {
			spawnFn: spawnSpy,
		});
		const handle = await adapter.startSession(makeSessionConfig());

		const events: HarnessEvent[] = [];
		const streamPromise = (async () => {
			for await (const event of adapter.streamEvents(handle)) {
				events.push(event);
			}
		})();

		fakeChild.emitStdout(CLI_RESULT_WITHOUT_COST);
		fakeChild.emitExit(0, null);
		await streamPromise;

		// Must NOT emit cost_update — this is the "CLI that reports nothing stays at zero" constraint
		const costEvents = events.filter((e) => e.type === "cost_update");
		expect(costEvents).toHaveLength(0);
	});

	it("buildResult returns minor=0 when result line has no cost field", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(makeConfig({ eventFormat: "ndjson" }), {
			spawnFn: spawnSpy,
		});
		const handle = await adapter.startSession(makeSessionConfig());

		const streamPromise = (async () => {
			for await (const _e of adapter.streamEvents(handle)) {
				// drain
			}
		})();

		fakeChild.emitStdout(CLI_RESULT_WITHOUT_COST);
		fakeChild.emitExit(0, null);
		await streamPromise;

		const result = await adapter.stopSession(handle);

		// Must stay at 0 — no cost observable, no cost recorded (honest absent, not dropped)
		expect(result.cost.minor).toBe(0);
	});

	it("non-numeric total_cost_usd value is treated as missing (no cost_update)", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(makeConfig({ eventFormat: "ndjson" }), {
			spawnFn: spawnSpy,
		});
		const handle = await adapter.startSession(makeSessionConfig());

		const events: HarnessEvent[] = [];
		const streamPromise = (async () => {
			for await (const event of adapter.streamEvents(handle)) {
				events.push(event);
			}
		})();

		// Non-numeric cost field — must be rejected (not treated as 0 cost)
		const malformedLine = JSON.stringify({
			type: "result",
			subtype: "success",
			total_cost_usd: "not-a-number",
			is_error: false,
		});
		fakeChild.emitStdout(malformedLine);
		fakeChild.emitExit(0, null);
		await streamPromise;

		const costEvents = events.filter((e) => e.type === "cost_update");
		// Non-numeric values must be ignored — no cost_update
		expect(costEvents).toHaveLength(0);
	});

	it("negative total_cost_usd is treated as missing (no cost_update)", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(makeConfig({ eventFormat: "ndjson" }), {
			spawnFn: spawnSpy,
		});
		const handle = await adapter.startSession(makeSessionConfig());

		const events: HarnessEvent[] = [];
		const streamPromise = (async () => {
			for await (const event of adapter.streamEvents(handle)) {
				events.push(event);
			}
		})();

		const negativeCosteResult = JSON.stringify({
			type: "result",
			subtype: "success",
			total_cost_usd: -0.05,
			is_error: false,
		});
		fakeChild.emitStdout(negativeCosteResult);
		fakeChild.emitExit(0, null);
		await streamPromise;

		const costEvents = events.filter((e) => e.type === "cost_update");
		// Negative is not a finite non-negative number — must be rejected
		expect(costEvents).toHaveLength(0);
	});
});
