/**
 * Harness-agnostic invariant: a tool the agent invokes executes exactly once.
 *
 * Observation channels (one per harness family):
 *
 * BUILTIN — `tool_call_recorded` event bus:
 *   The builtin adapter executes tools in-process (no MCP bridge). Each tool call
 *   emits one `tool_call_recorded` event from the provisioner stream loop.
 *   Floor: count >= 1. Single-execution: each tool name appears at most once.
 *
 * CLI harnesses (claude / codex / opencode) — MCP bridge invocation count:
 *   CLI harnesses route every tool call through the MCP bridge via HTTP
 *   JSON-RPC (`POST /api/mcp/:token`, `method: "tools/call"`). The test wraps
 *   `McpBridgeRegistry.handleRequest` to clone each incoming request and count
 *   requests whose body contains `"tools/call"`. This count equals the number of
 *   times the agent actually invoked a tool through the bridge — regardless of
 *   whether the CLI adapter surfaces a `tool_call` stream event (some don't).
 *   Floor: bridge invocation count >= 1 (non-vacuous — proves real work happened).
 *   Single-execution: same count used to assert no duplicate invocations.
 *
 * Why the `tool_call_recorded` event bus is NOT the primary assertion for CLI:
 *   `tool_call_recorded` fires when the provisioner's stream loop sees a
 *   `tool_call` event from the adapter's stdout. Not all CLI adapters surface
 *   `tool_call` stream events for every MCP round-trip (opencode may surface
 *   zero). The bridge invocation count is the harness-agnostic ground truth.
 *
 * Task design: the agent is asked to call `submit_review` exactly once. The
 * instruction is minimal so a cheap model can satisfy it in one turn. The
 * done-condition confirms the tool was called.
 *
 * @lore single-tool-execution-invariant: the double-execution bug would manifest
 * as either (a) two `tool_call_recorded` events for one tool call on builtin, or
 * (b) two `tools/call` HTTP requests to the MCP bridge for one logical tool call
 * on CLI lanes. Both are caught by the respective count assertions.
 *
 * @lore mcp-bridge-invocation-count: `countingMcpBridgeRegistry` wraps the real
 * registry's `handleRequest`. It clones each incoming `Request` before forwarding
 * to the real handler (cloning is required — consuming the body on the original
 * would break the downstream transport). The clone reads the body asynchronously
 * to detect `"method":"tools/call"` in the JSON-RPC envelope. Clone-and-read is
 * safe here: the MCP transport reads the original (not the clone). The count
 * is accumulated per lane.
 *
 * @lore cli-lanes-bridge-floor: on CLI lanes, `bridge.mcpBridgeRegistry` is
 * wrapped with `countingMcpBridgeRegistry` before passing to `runThroughHarness`.
 * The counting wrapper delegates every method to the real registry unchanged —
 * only `handleRequest` adds the clone-and-count side effect. The `mcpBaseUrl`
 * and `close` are forwarded unmodified.
 *
 * @lore tool-call-recorded-builtin: builtin emits one `tool_call_recorded` per
 * in-process tool call event from the SDK stream. The provisioner's stream loop
 * emits this unconditionally. A double-execution bug on builtin would produce two
 * events for one tool call — caught by the count assertion.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	bets,
	type HyperIdleDb,
	knowledgeItems,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { clearDeduplicationCache } from "@hyperidle/fabric";
import type { ToolCallRecordedEvent } from "@hyperidle/shared";
import { minimalStrategy } from "@hyperidle/strategy-minimal";
import { afterEach, beforeEach, describe, expect } from "vitest";
import type { McpBridgeRegistry } from "../../mcp/mcp-bridge-registry.js";
import { clearActiveStrategy, setActiveStrategy } from "../../services/strategy-registry.js";
import { test } from "../../test-fixtures.js";
import {
	runThroughHarness,
	SUPPORTED_HARNESS_LANES,
	startMcpBridgeServer,
} from "./provision-real-session.js";
import { requireHarness } from "./require-harness.js";

const NOW = "2026-06-30T00:00:00.000Z";

// ────────────────────────────────────────────────────────────────────────────
// MCP bridge invocation counter
// ────────────────────────────────────────────────────────────────────────────

/**
 * Wrap a `McpBridgeRegistry` to count `tools/call` JSON-RPC requests.
 *
 * Every MCP tool invocation arrives as a POST with JSON-RPC body
 * `{"method":"tools/call",...}`. The wrapper clones the request before
 * forwarding so the downstream transport can still read the original body.
 *
 * @lore mcp-bridge-invocation-count: clone is required. `Request.clone()`
 * produces an independent copy with its own readable body stream; reading the
 * clone does not drain the original. The real transport handler reads the
 * original — unaffected by the clone read. Async body inspection is fire-and-
 * forget (we increment the count before the clone resolves) to avoid adding
 * latency on the critical path.
 */
function countingMcpBridgeRegistry(
	real: McpBridgeRegistry,
	counts: { toolsCalled: number },
): McpBridgeRegistry {
	return {
		get size(): number {
			return real.size;
		},
		register: (instance) => real.register(instance),
		lookup: (token) => real.lookup(token),
		unregister: (token) => real.unregister(token),
		handleRequest: async (token: string, request: Request): Promise<Response> => {
			// Clone before forwarding — the real transport must read the original.
			const clone = request.clone();
			// Async: peek at the body to detect tools/call. Do not await here —
			// the forwarding must not block on body inspection.
			clone
				.json()
				.then((body: unknown) => {
					if (
						body !== null &&
						typeof body === "object" &&
						(body as Record<string, unknown>).method === "tools/call"
					) {
						counts.toolsCalled += 1;
					}
				})
				.catch(() => {
					// Non-JSON body (e.g. SSE stream) — not a tools/call; ignore.
				});
			return real.handleRequest(token, request);
		},
	};
}

// ────────────────────────────────────────────────────────────────────────────
// Domain seeding
// ────────────────────────────────────────────────────────────────────────────

/**
 * Minimal domain rows for a single tool-call session.
 * Task is phrased so the agent calls `submit_review` once — the simplest
 * non-vacuous scenario for asserting single-execution.
 *
 * @lore single-tool-execution-seeding: task description says "call submit_review
 * once" without preamble so a cheap model can satisfy it in one turn. Longer,
 * multi-tool tasks raise cost and add assertion complexity without adding
 * invariant strength.
 *
 * @lore seeding-shared-rows: teams/bets/owner-user rows use `onConflictDoNothing`
 * because multiple lanes seed the same fixture IDs (p1, t1, b1, owner-1) within
 * the same vitest worker. Each agent and task use Date.now() suffixes to avoid
 * collision between concurrent test runs in the harness project (serial, but guard
 * added for safety).
 */
async function seedDomain(
	db: HyperIdleDb,
	opts: { taskId: string; agentId: string },
): Promise<void> {
	await db
		.insert(teams)
		.values({ id: "p1", name: "Tool execution team", phase: "build", createdAt: NOW })
		.onConflictDoNothing();
	await db
		.insert(teamMembers)
		.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: NOW })
		.onConflictDoNothing();
	await db
		.insert(bets)
		.values({
			id: "b1",
			teamId: "p1",
			description: "tool execution bet",
			appetite: "small",
			status: "active",
			doneCondition: "Agent submits a review.",
			createdAt: NOW,
		})
		.onConflictDoNothing();
	await db.insert(users).values({
		id: opts.agentId,
		name: "Tool execution agent",
		role: "builder",
		status: "active",
		teamId: "t1",
		maxConcurrentSessions: 1,
		costCap: null,
		createdAt: NOW,
	});
	await db
		.insert(users)
		.values({
			id: "owner-1",
			name: "Tool execution owner",
			role: "founder",
			status: "active",
			teamId: "t1",
			maxConcurrentSessions: 1,
			costCap: null,
			createdAt: NOW,
		})
		.onConflictDoNothing();
	await db.insert(tasks).values({
		id: opts.taskId,
		betId: "b1",
		teamId: "p1",
		title: "Submit a review",
		description:
			"Call submit_review with title='done' and reasoning=['task complete']. " +
			"Do this exactly once and do not call any other tool before it.",
		state: "accepted",
		doneCondition: "Agent submits a review.",
		createdAt: NOW,
		updatedAt: NOW,
	});
	// Knowledge item so the strategy layer has content to inject.
	await db
		.insert(knowledgeItems)
		.values({
			id: "ki-ste-1",
			title: "Tool execution test principle",
			body: "Each tool call must execute exactly once.",
			format: "markdown",
			status: "active",
			version: 1,
			updatedBy: "system",
			createdAt: NOW,
			updatedAt: NOW,
		})
		.onConflictDoNothing();
}

// ────────────────────────────────────────────────────────────────────────────
// Lane references (stable: provision-real-session.ts defines the order)
// ────────────────────────────────────────────────────────────────────────────

const BUILTIN_LANE = SUPPORTED_HARNESS_LANES.find((l) => l.harnessName === "builtin");
const CLAUDE_LANE = SUPPORTED_HARNESS_LANES.find((l) => l.harnessName === "claude");
const CODEX_LANE = SUPPORTED_HARNESS_LANES.find((l) => l.harnessName === "codex");
const OPENCODE_LANE = SUPPORTED_HARNESS_LANES.find((l) => l.harnessName === "opencode");
if (!(BUILTIN_LANE && CLAUDE_LANE && CODEX_LANE && OPENCODE_LANE)) {
	throw new Error("SUPPORTED_HARNESS_LANES is missing one or more expected lanes");
}

// ────────────────────────────────────────────────────────────────────────────
// Assertion helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Assert the single-execution invariant over a collected event list:
 * each tool name appears at most `maxPerTool` times (default 1).
 *
 * A double-execution bug would surface as the same tool name appearing twice.
 */
function assertSingleExecutionPerTool(
	events: readonly Pick<ToolCallRecordedEvent, "toolName">[],
	maxPerTool = 1,
): void {
	const countByToolName = new Map<string, number>();
	for (const evt of events) {
		countByToolName.set(evt.toolName, (countByToolName.get(evt.toolName) ?? 0) + 1);
	}
	for (const [toolName, count] of countByToolName) {
		expect(
			count,
			`tool "${toolName}" executed ${count} times (expected ≤ ${maxPerTool})`,
		).toBeLessThanOrEqual(maxPerTool);
	}
}

// ────────────────────────────────────────────────────────────────────────────
// Lane 1: builtin
// ────────────────────────────────────────────────────────────────────────────

describe(`${BUILTIN_LANE.describeTag} agent tool calls execute exactly once`, () => {
	requireHarness("builtin");

	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ste-builtin-"));
		clearDeduplicationCache();
		setActiveStrategy(minimalStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		if (fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	test("a tool the agent invokes is executed exactly once (no duplicate execution)", async ({
		db,
		eventBus,
	}) => {
		const agentId = `ste-builtin-agent-${Date.now()}`;
		const taskId = `ste-builtin-task-${Date.now()}`;

		await seedDomain(db, { taskId, agentId });

		// Builtin executes tools in-process — no MCP bridge. Each tool call emits
		// one `tool_call_recorded` event from the provisioner stream loop.
		// Double-execution would produce two events for the same tool name.
		//
		// @lore single-tool-execution-builtin: `interceptToolCalls = true` (no MCP
		// bridge), but the production guard at session-provisioning.ts:1101
		// `if (interceptToolCalls && selectedAdapter.meta.type !== "builtin")` is
		// false for the builtin adapter — `registry.invoke()` is NEVER called from
		// the provisioner loop. Tools execute once, internally, via the SDK.
		const toolCallRecordedEvents: Pick<ToolCallRecordedEvent, "toolName" | "timestamp">[] = [];
		eventBus.on("tool_call_recorded", (event) => {
			toolCallRecordedEvents.push({ toolName: event.toolName, timestamp: event.timestamp });
		});

		const { result } = await runThroughHarness(
			{
				...BUILTIN_LANE,
				prepFn: (ctx) => {
					const base = BUILTIN_LANE.prepFn(ctx);
					return { ...base, params: { ...base.params, taskId, agentId } };
				},
			},
			{ db, eventBus, tmpDir },
		);

		// Primary anti-stub proof: session must not crash.
		expect(result.outcome).not.toBe("crashed");

		// Single-execution invariant — builtin, observation channel: tool_call_recorded.
		//
		// Floor (non-vacuous): at least one tool call must be observed. If zero, the
		// agent called no tools — either the task prompt was ignored (model error) or
		// the event bus wiring is broken (infrastructure error). Both are failures.
		expect(
			toolCallRecordedEvents.length,
			"builtin: no tool_call_recorded events observed — agent called no tools",
		).toBeGreaterThanOrEqual(1);

		// No duplicate: each tool name must appear at most once for this single-turn task.
		assertSingleExecutionPerTool(toolCallRecordedEvents);

		process.stdout.write(
			`[single-tool-execution builtin] tool_call_recorded: ` +
				`${JSON.stringify(toolCallRecordedEvents.map((e) => e.toolName))} ` +
				`outcome=${result.outcome}\n`,
		);
	}, 120_000);
});

// ────────────────────────────────────────────────────────────────────────────
// Lane 2: claude CLI
// ────────────────────────────────────────────────────────────────────────────

describe(`${CLAUDE_LANE.describeTag} agent tool calls execute exactly once`, () => {
	requireHarness("claude");

	let tmpDir: string;
	let bridge: {
		mcpBridgeRegistry: McpBridgeRegistry;
		mcpBaseUrl: string;
		close: () => Promise<void>;
	} | null = null;

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ste-claude-"));
		clearDeduplicationCache();
		setActiveStrategy(minimalStrategy);
		bridge = await startMcpBridgeServer();
	});

	afterEach(async () => {
		clearActiveStrategy();
		if (bridge) {
			await bridge.close();
			bridge = null;
		}
		if (fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	test("a tool the agent invokes is executed exactly once (no duplicate execution)", async ({
		db,
		eventBus,
	}) => {
		if (!bridge) throw new Error("bridge not set up");

		const agentId = `ste-claude-agent-${Date.now()}`;
		const taskId = `ste-claude-task-${Date.now()}`;

		await seedDomain(db, { taskId, agentId });

		// CLI lanes — observation channel: MCP bridge invocation count.
		// The claude CLI routes tool calls via HTTP JSON-RPC to the MCP bridge.
		// We wrap the bridge registry to count `tools/call` requests regardless
		// of whether the CLI adapter surfaces `tool_call` stream events.
		const bridgeCounts = { toolsCalled: 0 };
		const countingRegistry = countingMcpBridgeRegistry(bridge.mcpBridgeRegistry, bridgeCounts);
		const countingBridge = { ...bridge, mcpBridgeRegistry: countingRegistry };

		const { result } = await runThroughHarness(
			{
				...CLAUDE_LANE,
				prepFn: (ctx) => {
					const base = CLAUDE_LANE.prepFn(ctx);
					return { ...base, params: { ...base.params, taskId, agentId } };
				},
			},
			{ db, eventBus, tmpDir, bridge: countingBridge },
		);

		// Primary anti-stub proof: session must not crash.
		expect(result.outcome).not.toBe("crashed");

		// Single-execution invariant — claude CLI, observation channel: MCP bridge count.
		//
		// Floor (non-vacuous): at least one tools/call request must have hit the bridge.
		// The task explicitly instructs the agent to call submit_review — if zero bridge
		// calls appear, the agent ran but did not invoke any tool, which means either the
		// task prompt was ignored or the MCP bridge wiring is broken. Both are failures.
		expect(
			bridgeCounts.toolsCalled,
			"claude: no tools/call requests observed on MCP bridge — agent invoked no tools",
		).toBeGreaterThanOrEqual(1);

		// No duplicate: the agent should call the tool exactly once.
		// A double-execution bug would send the same tools/call twice to the bridge.
		// For this single-turn task, exactly 1 bridge call is expected.
		expect(
			bridgeCounts.toolsCalled,
			`claude: ${bridgeCounts.toolsCalled} tools/call requests observed (expected 1 — double execution?)`,
		).toBeLessThanOrEqual(1);

		process.stdout.write(
			`[single-tool-execution claude] bridge.toolsCalled=${bridgeCounts.toolsCalled} ` +
				`outcome=${result.outcome}\n`,
		);
	}, 240_000);
});

// ────────────────────────────────────────────────────────────────────────────
// Lane 3: codex CLI
// ────────────────────────────────────────────────────────────────────────────

describe(`${CODEX_LANE.describeTag} agent tool calls execute exactly once`, () => {
	requireHarness("codex");

	let tmpDir: string;
	let bridge: {
		mcpBridgeRegistry: McpBridgeRegistry;
		mcpBaseUrl: string;
		close: () => Promise<void>;
	} | null = null;

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ste-codex-"));
		clearDeduplicationCache();
		setActiveStrategy(minimalStrategy);
		bridge = await startMcpBridgeServer();
	});

	afterEach(async () => {
		clearActiveStrategy();
		if (bridge) {
			await bridge.close();
			bridge = null;
		}
		if (fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	test("a tool the agent invokes is executed exactly once (no duplicate execution)", async ({
		db,
		eventBus,
	}) => {
		if (!bridge) throw new Error("bridge not set up");

		const agentId = `ste-codex-agent-${Date.now()}`;
		const taskId = `ste-codex-task-${Date.now()}`;

		await seedDomain(db, { taskId, agentId });

		// CLI lanes — observation channel: MCP bridge invocation count.
		// Codex routes tool calls via HTTP JSON-RPC to the MCP bridge.
		// Codex does not reliably call the MCP return tool → outcome is "not_returned".
		// The bridge invocation count proves the agent actually invoked tools.
		//
		// @lore codex-cost-zero: codex emits `turn.completed` not a `result` event
		// with `total_cost_usd`. The adapter's cost extraction never fires → totalCostCents
		// is always 0. Do not assert cost > 0 for codex.
		const bridgeCounts = { toolsCalled: 0 };
		const countingRegistry = countingMcpBridgeRegistry(bridge.mcpBridgeRegistry, bridgeCounts);
		const countingBridge = { ...bridge, mcpBridgeRegistry: countingRegistry };

		const { result } = await runThroughHarness(
			{
				...CODEX_LANE,
				prepFn: (ctx) => {
					const base = CODEX_LANE.prepFn(ctx);
					return { ...base, params: { ...base.params, taskId, agentId } };
				},
			},
			{ db, eventBus, tmpDir, bridge: countingBridge },
		);

		// Honest floor: codex does real work but does NOT call the MCP return tool
		// → outcome is "not_returned". "crashed" is FAIL.
		expect(["completed", "not_returned"]).toContain(result.outcome);

		// Single-execution invariant — codex CLI, observation channel: MCP bridge count.
		//
		// Floor (non-vacuous): at least one tools/call request must have hit the bridge.
		expect(
			bridgeCounts.toolsCalled,
			"codex: no tools/call requests observed on MCP bridge — agent invoked no tools",
		).toBeGreaterThanOrEqual(1);

		// No duplicate: the agent should call the tool exactly once.
		expect(
			bridgeCounts.toolsCalled,
			`codex: ${bridgeCounts.toolsCalled} tools/call requests observed (expected 1 — double execution?)`,
		).toBeLessThanOrEqual(1);

		process.stdout.write(
			`[single-tool-execution codex] bridge.toolsCalled=${bridgeCounts.toolsCalled} ` +
				`outcome=${result.outcome}\n`,
		);
	}, 240_000);
});

// ────────────────────────────────────────────────────────────────────────────
// Lane 4: opencode CLI
// ────────────────────────────────────────────────────────────────────────────

describe(`${OPENCODE_LANE.describeTag} agent tool calls execute exactly once`, () => {
	requireHarness("opencode");

	let tmpDir: string;
	let bridge: {
		mcpBridgeRegistry: McpBridgeRegistry;
		mcpBaseUrl: string;
		close: () => Promise<void>;
	} | null = null;

	let xdgDataHomeBefore: string | undefined;
	let xdgConfigHomeBefore: string | undefined;

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ste-opencode-"));
		clearDeduplicationCache();
		setActiveStrategy(minimalStrategy);
		bridge = await startMcpBridgeServer();
		// Isolate opencode's SQLite DB per-test to prevent write-lock hangs.
		// @lore opencode-xdg-isolation: without per-test XDG_DATA_HOME, concurrent
		// opencode processes share ~/.local/share/opencode/opencode.db and the second
		// hangs on the SQLite write-lock. The lane's prepFn calls provisionOpencodeHome
		// which sets up credentials in the per-test data dir.
		xdgDataHomeBefore = process.env.XDG_DATA_HOME;
		process.env.XDG_DATA_HOME = path.join(tmpDir, ".opencode-data");

		// Isolate opencode's config directory per-test to prevent stale global MCP entries.
		// @lore AR3 opencode-config-isolation: ~/.config/opencode/opencode.jsonc may contain
		// a stale `hyperidle` MCP entry from a previous session. Without XDG_CONFIG_HOME
		// isolation, opencode loads this global config BEFORE the per-sandbox opencode.json,
		// and the stale entry overrides the live bridge URL → tools/call never hits the bridge.
		// provisionOpencodeHome creates <sandbox>/.opencode-config/opencode/ (empty dir) so
		// opencode starts with a clean config that only sees the per-sandbox opencode.json.
		xdgConfigHomeBefore = process.env.XDG_CONFIG_HOME;
		process.env.XDG_CONFIG_HOME = path.join(tmpDir, ".opencode-config");
	});

	afterEach(async () => {
		clearActiveStrategy();
		if (xdgDataHomeBefore !== undefined) {
			process.env.XDG_DATA_HOME = xdgDataHomeBefore;
		} else {
			delete process.env.XDG_DATA_HOME;
		}
		if (xdgConfigHomeBefore !== undefined) {
			process.env.XDG_CONFIG_HOME = xdgConfigHomeBefore;
		} else {
			delete process.env.XDG_CONFIG_HOME;
		}
		if (bridge) {
			await bridge.close();
			bridge = null;
		}
		if (fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	test("a tool the agent invokes is executed exactly once (no duplicate execution)", async ({
		db,
		eventBus,
	}) => {
		if (!bridge) throw new Error("bridge not set up");

		const agentId = `ste-opencode-agent-${Date.now()}`;
		const taskId = `ste-opencode-task-${Date.now()}`;

		await seedDomain(db, { taskId, agentId });

		// CLI lanes — observation channel: MCP bridge invocation count.
		// Opencode routes tool calls via HTTP JSON-RPC to the MCP bridge.
		// Opencode does not reliably call the MCP return tool → outcome is "not_returned".
		// Opencode surfaces zero `tool_call` stream events in normal operation — the
		// bridge invocation count is the ONLY reliable proof that tools ran.
		//
		// @lore opencode-zero-stream-events: opencode does not emit `tool_call` JSON
		// lines to stdout for MCP calls, so `tool_call_recorded` event count is always
		// 0 on the opencode lane. The bridge invocation count bypasses this gap.
		const bridgeCounts = { toolsCalled: 0 };
		const countingRegistry = countingMcpBridgeRegistry(bridge.mcpBridgeRegistry, bridgeCounts);
		const countingBridge = { ...bridge, mcpBridgeRegistry: countingRegistry };

		const { result } = await runThroughHarness(
			{
				...OPENCODE_LANE,
				prepFn: (ctx) => {
					const base = OPENCODE_LANE.prepFn(ctx);
					return { ...base, params: { ...base.params, taskId, agentId } };
				},
			},
			{ db, eventBus, tmpDir, bridge: countingBridge },
		);

		// Honest floor: opencode does real work but does NOT reliably call the MCP
		// return tool → outcome is typically "not_returned". "crashed" is FAIL.
		// Opencode has no cost field → totalCostCents stays 0.
		expect(["completed", "not_returned"]).toContain(result.outcome);

		// Single-execution invariant — opencode CLI, observation channel: MCP bridge count.
		//
		// Floor (non-vacuous): at least one tools/call request must have hit the bridge.
		// This is the load-bearing non-vacuous assertion for opencode: without it,
		// the non-crash outcome alone cannot distinguish "agent ran and called tools"
		// from "agent ran but produced only text, no tool call at all".
		expect(
			bridgeCounts.toolsCalled,
			"opencode: no tools/call requests observed on MCP bridge — agent invoked no tools",
		).toBeGreaterThanOrEqual(1);

		// No duplicate: the agent should call the tool exactly once.
		expect(
			bridgeCounts.toolsCalled,
			`opencode: ${bridgeCounts.toolsCalled} tools/call requests observed (expected 1 — double execution?)`,
		).toBeLessThanOrEqual(1);

		process.stdout.write(
			`[single-tool-execution opencode] bridge.toolsCalled=${bridgeCounts.toolsCalled} ` +
				`outcome=${result.outcome}\n`,
		);
	}, 240_000);
});
