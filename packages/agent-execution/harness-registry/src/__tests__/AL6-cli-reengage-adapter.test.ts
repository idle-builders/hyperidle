/**
 * AL6 CRIT-3 — CliHarnessAdapter.streamEvents process-reengage loop tests.
 *
 * These tests drive the PRODUCTION re-engage code in CliHarnessAdapter.streamEvents
 * (cli-harness-adapter.ts:513-599) using an injected spawnFn (deterministic, no binary).
 *
 * The decisive bar per the reviewer's finding:
 *   "drive the PRODUCTION CliHarnessAdapter.streamEvents re-engage path. Inject a fake
 *    spawn (an injectable spawnFn/seam on the adapter) that emits a step_finish/turn-end
 *    with NO return action, and assert the adapter: detects turn-end, checks shouldForceReturn
 *    against the registry, RE-spawns with the forcing message, increments the registry,
 *    bounded by AL6_MAX_FORCE_RETURNS, then settles not_returned."
 *
 * Tests FAIL if the re-engage loop is deleted from CliHarnessAdapter.streamEvents.
 *
 * @lore AL6 CRIT-3: The opencode re-engage loop lives in CliHarnessAdapter.streamEvents,
 * NOT in the test. The test injects a spawnFn that returns fake child processes to control
 * turn-end timing without spawning real binaries. The enforcement registry singleton is
 * used directly (same as production) — the session must be registered BEFORE streamEvents
 * is entered, just as session-provisioning.ts registers it before startSession.
 *
 * @lore AL6 CRIT-3 test-design: We pre-seed the enforcement registry with the session's
 * configSessionId (the real session UUID from SessionConfig.sessionId). The adapter reads
 * `enforcementRegistry.get(session.configSessionId)` inside streamEvents. Correct seeding
 * is the same requirement the production flow satisfies via enforcementRegistry.register()
 * at session-provisioning.ts:760.
 *
 * @lore AL6 CRIT-3 budget-termination: AL6_MAX_FORCE_RETURNS=2, so we need to provide
 * enough fake children to exhaust the budget OR set gate.returned=true to stop re-engaging.
 * Setting gate.returned=true after N re-engages mimics the agent finally returning.
 *
 * @lore AL6 v4-fix test-drives-real-config: This test uses CLI_TOOL_CONFIGS.opencode
 * (the REAL shipped config, args: ["--dir", "{{sandbox}}"]) NOT a fabricated config.
 * The previous fabricated config (args: ["run", "--format", "json"]) masked the production
 * bug where re-engage produced ["--dir", "", forceMsg] — broken invocation. Now any
 * regression in the re-engage args building will cause this test to fail with the real config.
 */

import type { ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import type { HarnessEvent, SessionConfig } from "@hyperidle/shared";
import { AL6_FORCE_RETURN_MESSAGE, AL6_MAX_FORCE_RETURNS } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLI_TOOL_CONFIGS } from "../adapter-pool.js";
import type { CliAdapterConfig } from "../cli-harness-adapter.js";
import { CliHarnessAdapter } from "../cli-harness-adapter.js";
import { enforcementRegistry } from "../return-enforcement-registry.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the REAL shipped opencode config from CLI_TOOL_CONFIGS.opencode.
 * args: ["--dir", "{{sandbox}}"] — NOT a fabricated ["run", "--format", "json"].
 * This is the discriminating config: if the re-engage invocation reverts to the
 * broken template-strip approach, the test fails because re-engage args will be
 * ["--dir", "", forceMsg] (no "run" subcommand, empty --dir, stray positional).
 *
 * @lore AL6 v4-fix: Using CLI_TOOL_CONFIGS.opencode ensures the test exercises the
 * production code path, not a fabricated config that hid the real bug.
 */
function makeProcessReEngageConfig(overrides: Partial<CliAdapterConfig> = {}): CliAdapterConfig {
	// Access the real shipped opencode config — Record<string, CliAdapterConfig> index signature
	// makes it technically `CliAdapterConfig | undefined`, but "opencode" is a known key.
	const opencodeConfig = CLI_TOOL_CONFIGS.opencode!;
	return {
		...opencodeConfig,
		// eventFormat override: the real config uses "text" (opencode streams text events);
		// the test uses "ndjson" to allow JSON-line parsing of fake child stdout.
		// This override does not affect the re-engage args path (the broken path under test).
		eventFormat: "ndjson",
		...overrides,
	};
}

function makeSessionConfig(
	sessionId: string,
	overrides: Partial<SessionConfig> = {},
): SessionConfig {
	return {
		sandboxPath: "/workspace/reengage-test",
		sessionId,
		systemPromptPath: "",
		assembledPrompt: "Do the task.",
		modelTier: "workhorse",
		tools: ["submit_review"],
		resolvedModel: {
			provider: "openrouter",
			model: "openrouter/~anthropic/claude-haiku-latest",
			apiKey: "sk-test-key",
			baseUrl: "https://openrouter.ai/api/v1",
		},
		...overrides,
	};
}

/**
 * Create a fake child process whose stdout/stderr/stdin are controllable.
 * @lore AL6 CRIT-3: pid must be non-undefined so the adapter's ENOENT guard
 * doesn't block. We set pid=99999.
 */
function makeFakeChild(): {
	proc: ChildProcess;
	emitExit: (code: number | null, signal?: string | null) => void;
} {
	const stdout = new EventEmitter() as NodeJS.ReadableStream & EventEmitter;
	const stderr = new EventEmitter() as NodeJS.ReadableStream & EventEmitter;
	const stdin = new EventEmitter() as NodeJS.WritableStream & EventEmitter;
	// Real ChildProcess.stdin is a Writable with .end(); the adapter closes stdin
	// after spawn (so codex exec doesn't block reading stdin). EventEmitter has no
	// .end(), so add a no-op to keep the fake faithful to a real child.
	(stdin as unknown as { end: () => void }).end = () => undefined;
	const proc = new EventEmitter() as ChildProcess;
	(proc as unknown as { stdout: unknown }).stdout = stdout;
	(proc as unknown as { stderr: unknown }).stderr = stderr;
	(proc as unknown as { stdin: unknown }).stdin = stdin;
	(proc as unknown as { pid: number }).pid = 99999;
	(proc as unknown as { kill: () => void }).kill = vi.fn();

	return {
		proc,
		emitExit: (code: number | null, signal: string | null = null) =>
			proc.emit("exit", code, signal),
	};
}

/**
 * Create a spawnFn that returns fake children from a pre-built list.
 * Each call returns the next child in the list.
 *
 * @lore AL6 CRIT-3 type-cast: vi.fn() doesn't match `typeof spawn` (heavily overloaded).
 * We cast via `unknown` to satisfy the CliAdapterDeps.spawnFn type without disabling
 * strict mode. The mock only implements the (binary, args, options) → ChildProcess call
 * shape that CliHarnessAdapter actually invokes at runtime.
 */
function makeFakeSpawnFn(children: ReturnType<typeof makeFakeChild>[]): {
	spawnFn: typeof spawn;
	spawnCalls: Array<{ binary: string; args: string[] }>;
} {
	let idx = 0;
	const spawnCalls: Array<{ binary: string; args: string[] }> = [];
	const spawnFnMock = vi.fn().mockImplementation((binary: string, args: string[]) => {
		spawnCalls.push({ binary, args: [...args] });
		const child = children[idx];
		idx++;
		// If we run out of children, return the last one (prevents undefined access).
		return child?.proc ?? children[children.length - 1]?.proc;
	});
	// Cast: vi.fn() doesn't satisfy the overloaded spawn signature, but the mock
	// fulfils the only call-shape CliHarnessAdapter uses: (binary, args, opts).
	const spawnFn = spawnFnMock as unknown as typeof spawn;
	return { spawnFn, spawnCalls };
}

// ── Registry lifecycle ────────────────────────────────────────────────────────

describe("AL6 CRIT-3 — CliHarnessAdapter.streamEvents process-reengage loop", () => {
	let testSessionId: string;

	beforeEach(() => {
		testSessionId = `al6-crit3-test-${Math.random().toString(36).slice(2, 10)}`;
	});

	afterEach(() => {
		// Always clean up registry entries to avoid cross-test pollution.
		enforcementRegistry.unregister(testSessionId);
	});

	it("re-spawns with forcing message when first turn ends without return action (registry-driven)", async () => {
		// Arrange: provide enough fake children to exhaust the budget (AL6_MAX_FORCE_RETURNS + 1 total).
		// After budget exhausted, the loop breaks. Last child exits and stream ends.
		const children = Array.from({ length: AL6_MAX_FORCE_RETURNS + 1 }, () => makeFakeChild());
		const { spawnFn, spawnCalls } = makeFakeSpawnFn(children);

		const adapter = new CliHarnessAdapter(makeProcessReEngageConfig(), { spawnFn });

		// Register the session in the enforcement registry BEFORE streamEvents.
		// Mirrors session-provisioning.ts:760.
		const gate = { returned: false };
		enforcementRegistry.register(testSessionId, { gate, forceCount: 0, exempt: false });

		const handle = await adapter.startSession(makeSessionConfig(testSessionId));

		// Collect all events from the stream.
		const events: HarnessEvent[] = [];
		const streamDone = (async () => {
			for await (const event of adapter.streamEvents(handle)) {
				events.push(event);
			}
		})();

		// First child exits without return action → triggers re-engage.
		const firstChild = children[0];
		firstChild?.emitExit(0, null);

		// Give the re-engage loop a tick to run.
		await new Promise<void>((resolve) => setImmediate(resolve));

		// After first re-engage: 2 spawn calls (initial + 1 re-engage).
		expect(spawnCalls.length).toBeGreaterThanOrEqual(2);

		// Re-engage args must be the CORRECT opencode headless invocation:
		//   ["run", forceMsg, "--format", "json", "--pure", "--model", <model>]
		// NOT the broken ["--dir", "", forceMsg] that the template-strip produced.
		const reEngageArgs = spawnCalls[1]?.args ?? [];
		// Must start with "run" subcommand — not "--dir" (the raw config arg).
		expect(reEngageArgs[0]).toBe("run");
		// Must carry the forcing message as the first positional after "run".
		expect(reEngageArgs).toContain(AL6_FORCE_RETURN_MESSAGE);
		// Must NOT contain empty strings (broken template-strip would leave "").
		expect(reEngageArgs).not.toContain("");
		// Must include --format json (JSON output flag for opencode).
		expect(reEngageArgs).toContain("--format");
		expect(reEngageArgs).toContain("json");

		// Registry forceCount must be >= 1 (real incrementForce fired).
		expect(enforcementRegistry.get(testSessionId)?.forceCount).toBeGreaterThanOrEqual(1);

		// Now exhaust remaining budget by exiting each remaining child.
		for (let i = 1; i < children.length; i++) {
			children[i]?.emitExit(0, null);
			await new Promise<void>((resolve) => setImmediate(resolve));
		}

		await streamDone;

		// Total spawns: 1 initial + AL6_MAX_FORCE_RETURNS re-engages = budget+1.
		expect(spawnCalls.length).toBeLessThanOrEqual(AL6_MAX_FORCE_RETURNS + 1);
	}, 15_000);

	it("does NOT re-spawn when return action was seen in first turn (gate.returned=true)", async () => {
		// If the gate.returned=true, shouldForceReturn returns null → no re-engage.
		const firstChild = makeFakeChild();
		const { spawnFn } = makeFakeSpawnFn([firstChild]);

		const adapter = new CliHarnessAdapter(makeProcessReEngageConfig(), { spawnFn });

		// gate.returned=true means agent already returned voluntarily.
		const gate = { returned: true };
		enforcementRegistry.register(testSessionId, { gate, forceCount: 0, exempt: false });

		const handle = await adapter.startSession(makeSessionConfig(testSessionId));

		const streamDone = (async () => {
			for await (const _event of adapter.streamEvents(handle)) {
				// drain
			}
		})();

		firstChild.emitExit(0, null);
		await streamDone;

		// Only one spawn — gate says returned, no re-engage.
		expect(spawnFn).toHaveBeenCalledTimes(1);
	}, 15_000);

	it("registry incrementForce is called on each re-engage — forceCount increases", async () => {
		// Verify the registry is the counter (not just a local variable).
		// On each re-engage, enforcementRegistry.incrementForce must be called.
		const children = Array.from({ length: AL6_MAX_FORCE_RETURNS + 1 }, () => makeFakeChild());
		const { spawnFn } = makeFakeSpawnFn(children);

		const adapter = new CliHarnessAdapter(makeProcessReEngageConfig(), { spawnFn });

		const gate = { returned: false };
		enforcementRegistry.register(testSessionId, { gate, forceCount: 0, exempt: false });

		const handle = await adapter.startSession(makeSessionConfig(testSessionId));

		const streamDone = (async () => {
			for await (const _event of adapter.streamEvents(handle)) {
				// drain
			}
		})();

		// Before first exit: forceCount = 0.
		expect(enforcementRegistry.get(testSessionId)?.forceCount).toBe(0);

		// First child exits → re-engage fires → forceCount++ in registry.
		children[0]?.emitExit(0, null);
		await new Promise<void>((resolve) => setImmediate(resolve));

		// After first re-engage: forceCount = 1 (real registry increment).
		expect(enforcementRegistry.get(testSessionId)?.forceCount).toBe(1);

		// Exhaust remaining budget.
		for (let i = 1; i < children.length; i++) {
			children[i]?.emitExit(0, null);
			await new Promise<void>((resolve) => setImmediate(resolve));
		}

		await streamDone;

		// Final forceCount must equal the number of re-engages (bounded by budget).
		const finalEntry = enforcementRegistry.get(testSessionId);
		expect(finalEntry?.forceCount).toBeGreaterThanOrEqual(1);
		expect(finalEntry?.forceCount).toBeLessThanOrEqual(AL6_MAX_FORCE_RETURNS);
	}, 15_000);

	it("re-engage args carry AL6_FORCE_RETURN_MESSAGE (not silent re-run or 'proceed')", async () => {
		// The re-engage args must include the specific forcing message, not a silent re-run.
		const children = Array.from({ length: AL6_MAX_FORCE_RETURNS + 1 }, () => makeFakeChild());
		const { spawnFn, spawnCalls } = makeFakeSpawnFn(children);

		const adapter = new CliHarnessAdapter(makeProcessReEngageConfig(), { spawnFn });

		const gate = { returned: false };
		enforcementRegistry.register(testSessionId, { gate, forceCount: 0, exempt: false });

		const handle = await adapter.startSession(makeSessionConfig(testSessionId));

		const streamDone = (async () => {
			for await (const _event of adapter.streamEvents(handle)) {
				// drain
			}
		})();

		children[0]?.emitExit(0, null);
		await new Promise<void>((resolve) => setImmediate(resolve));

		// The second spawn (first re-engage) must carry the forcing message.
		const reEngageArgs = spawnCalls[1]?.args ?? [];
		// Must start with "run" subcommand — the correct headless opencode invocation.
		expect(reEngageArgs[0]).toBe("run");
		expect(reEngageArgs).toContain(AL6_FORCE_RETURN_MESSAGE);
		// Not a silent/generic re-run — must not ONLY contain base args without message.
		expect(reEngageArgs.join(" ")).toContain("return");
		// Must NOT contain empty strings (broken template-strip artifact).
		expect(reEngageArgs).not.toContain("");

		// Exhaust remaining budget.
		for (let i = 1; i < children.length; i++) {
			children[i]?.emitExit(0, null);
			await new Promise<void>((resolve) => setImmediate(resolve));
		}

		await streamDone;
	}, 15_000);

	it("is bounded by AL6_MAX_FORCE_RETURNS — no re-spawn after budget exhausted", async () => {
		// After AL6_MAX_FORCE_RETURNS re-engages, the loop must stop.
		// Total spawns = 1 initial + AL6_MAX_FORCE_RETURNS re-engages.
		const children = Array.from({ length: AL6_MAX_FORCE_RETURNS + 1 }, () => makeFakeChild());
		const { spawnFn, spawnCalls } = makeFakeSpawnFn(children);

		const adapter = new CliHarnessAdapter(makeProcessReEngageConfig(), { spawnFn });

		const gate = { returned: false };
		enforcementRegistry.register(testSessionId, { gate, forceCount: 0, exempt: false });

		const handle = await adapter.startSession(makeSessionConfig(testSessionId));

		const streamDone = (async () => {
			for await (const _event of adapter.streamEvents(handle)) {
				// drain
			}
		})();

		// Exit each child sequentially.
		for (let i = 0; i < children.length; i++) {
			children[i]?.emitExit(0, null);
			await new Promise<void>((resolve) => setImmediate(resolve));
		}

		await streamDone;

		// Total spawns must be exactly initial + budget (not initial + budget + 1).
		expect(spawnCalls.length).toBe(AL6_MAX_FORCE_RETURNS + 1);
	}, 15_000);

	it("does not re-engage for non-process-reengage channels (settings-claude)", async () => {
		// A settings-claude channel adapter must NOT re-spawn on turn-end.
		const firstChild = makeFakeChild();
		const { spawnFn } = makeFakeSpawnFn([firstChild]);

		const adapter = new CliHarnessAdapter(
			makeProcessReEngageConfig({ returnEnforcementChannel: "settings-claude" }),
			{ spawnFn },
		);

		const gate = { returned: false };
		enforcementRegistry.register(testSessionId, { gate, forceCount: 0, exempt: false });

		const handle = await adapter.startSession(makeSessionConfig(testSessionId));

		const streamDone = (async () => {
			for await (const _event of adapter.streamEvents(handle)) {
				// drain
			}
		})();

		firstChild.emitExit(0, null);
		await streamDone;

		// Only one spawn — settings-claude never re-spawns.
		expect(spawnFn).toHaveBeenCalledTimes(1);
	}, 15_000);
});
