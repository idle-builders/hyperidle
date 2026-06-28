/**
 * AF10 — AC3: CLI harness cost capture (Z8-049/Z8-088).
 *
 * The `claude` CLI emits a terminal ndjson result line with `total_cost_usd`.
 * Before AF10, `buildResult` hardcodes `cost: { minor: 0 }` and the result
 * line is passed through as a plain `completion` event — the cost is silently
 * dropped.
 *
 * After AF10 (T7), `wireStdout`/`parseStdoutLine` recognises the terminal
 * result line (type === "result") and captures `total_cost_usd` into a
 * per-session `totalCostUsd` slot. Then `streamEvents` emits one synthetic
 * terminal `cost_update` event with `deltaCost = totalCostUsd` (the whole
 * session cost as a single delta — consistent with §1's delta contract), and
 * `buildResult` returns the real captured cost instead of 0.
 *
 * Fixtures (committed per §4.1):
 *   fixtures/cli-result-with-cost.ndjson   — result line with total_cost_usd: 0.0123
 *   fixtures/cli-result-without-cost.ndjson — result line without the field
 *
 * Field name used: `total_cost_usd` (matches `CliAdapterConfig.costField` default "total_cost_usd").
 * Configured via `CliAdapterConfig.costField` (default "total_cost_usd") per §4.1.
 */

import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import type { HarnessEvent, SessionConfig } from "@hyperidle/shared";
import { describe, expect, it, vi } from "vitest";
import type { CliAdapterConfig } from "../../harness/cli-harness-adapter.js";
import { CliHarnessAdapter } from "../../harness/cli-harness-adapter.js";

// ── Load fixtures ─────────────────────────────────────────────────────────────

const FIXTURES_DIR = path.join(import.meta.dirname ?? __dirname, "fixtures");

/**
 * The real ndjson terminal result line from the `claude` CLI (pinned fixture
 * per §4.1 — do not edit; this is the contract).
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
		sandboxPath: "/workspace/af10",
		sessionId: "af10-cli-session",
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

// ── Verify fixture correctness ─────────────────────────────────────────────────

describe("AF10 AC3 — fixtures are valid", () => {
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

// ── AC3 positive case: result line with total_cost_usd → cost_update event ────

describe("AF10 AC3 — CLI result line with total_cost_usd emits cost_update", () => {
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

		// FAILS until T7: currently the result line is passed through as a
		// completion event, no cost_update is emitted.
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

		// FAILS until T7: currently minor is 0
		// Expected: round(0.0123 * 100) = 1
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
			// @lore AF10: costField is the plan-required config option for version drift (§4.1)
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

		// FAILS until T7
		const costEvents = events.filter((e) => e.type === "cost_update");
		expect(costEvents).toHaveLength(1);
		const costEvent = costEvents[0] as { deltaCost: number };
		expect(costEvent.deltaCost).toBe(0.05);
	});
});

// ── AC3 negative case: result line without total_cost_usd → no cost_update ───

describe("AF10 AC3 — CLI result line WITHOUT total_cost_usd: no cost_update, zero cost", () => {
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
		// PASSES already (no cost_update emitted today); must continue to pass after T7
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
		// PASSES already; must continue to pass after T7
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
		// PASSES already; must remain passing after T7
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
		// PASSES already; must remain passing after T7
		expect(costEvents).toHaveLength(0);
	});
});
