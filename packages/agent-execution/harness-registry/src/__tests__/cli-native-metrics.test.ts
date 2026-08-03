/**
 * CLI harness native metrics capture.
 *
 * Codex emits token usage on `turn.completed`. OpenCode emits tokens on
 * `step_finish.part`. Claude emits token usage + turn/duration metrics on its
 * terminal ndjson `result` line. The adapter normalizes those native fields
 * into `token_usage` events and `SessionResult.metrics`.
 *
 * @lore AU21 (harness-telemetry narrowing): This file used to also assert on
 * a `cost_update` event / `total_cost_usd` capture / `SessionResult.cost` /
 * `CliAdapterConfig.costField`. Founder ruling narrowed harness telemetry to
 * token usage only — "very few harness can actually report cost" (confirmed
 * by investigation: codex reports no cost at all; the builtin adapter only
 * ESTIMATED cost from a hardcoded rate table, never a harness self-report;
 * only claude/opencode natively reported a $ figure). All $-cost assertions
 * are removed — no replacement.
 */

import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import type { HarnessEvent, SessionConfig } from "@hyperidle/shared";
import { describe, expect, it, vi } from "vitest";
import type { CliAdapterConfig } from "../cli-harness-adapter.js";
import { CliHarnessAdapter } from "../cli-harness-adapter.js";

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

describe("CLI native metrics capture — tokens, turns, duration", () => {
	it("captures Claude result usage, turns, and duration into events and SessionResult", async () => {
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

		// No $-cost event of any kind is ever emitted by this adapter.
		expect(events.some((event) => (event.type as string) === "cost_update")).toBe(false);

		const tokenEvent = events.find((event) => event.type === "token_usage");
		expect(tokenEvent).toMatchObject({
			type: "token_usage",
			inputTokens: 10,
			outputTokens: 49,
			cachedInputTokens: 17283,
			cacheCreationInputTokens: 7573,
		});

		const result = await adapter.stopSession(handle);
		expect(result).not.toHaveProperty("cost");
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
		});
		expect(result.metrics).not.toHaveProperty("nativeCostUsd");
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

		// Codex reports no cost at all — confirming the founder's stated rationale.
		expect(events.some((event) => (event.type as string) === "cost_update")).toBe(false);

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

	it("captures OpenCode step_finish tokens, reasoning, cache, and step count", async () => {
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

		// OpenCode DOES report a native cost field (part.cost) — but the adapter
		// never surfaces it: no cost_update event, no cost on SessionResult.
		expect(events.some((event) => (event.type as string) === "cost_update")).toBe(false);

		expect(events.find((event) => event.type === "token_usage")).toMatchObject({
			type: "token_usage",
			inputTokens: 7134,
			outputTokens: 0,
			cachedInputTokens: 64,
			reasoningOutputTokens: 89,
		});

		const result = await adapter.stopSession(handle);
		expect(result).not.toHaveProperty("cost");
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
		});
		expect(result.metrics).not.toHaveProperty("nativeCostUsd");
	});
});
