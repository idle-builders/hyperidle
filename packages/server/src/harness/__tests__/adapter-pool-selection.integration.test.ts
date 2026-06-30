/**
 * @harness-matrix: covers all SUPPORTED_HARNESSES via SUPPORTED_HARNESS_LANES loop
 *
 * Adapter pool selection and session provisioning through the pool.
 *
 * Split into two sections:
 *
 * 1. MATRIX (harness-tagged) — real `provisionSession()` through the pool-selected
 *    adapter, across ALL FOUR supported harnesses. Equal coverage enforced by the
 *    honest-harness-guard and the attestation per-harness executed floor.
 *
 * 2. LOGIC (untagged) — pure pool-selection math (capacity, modelProviders filter,
 *    min-load pick) that needs no real agent. These run as fast service tests
 *    with no LLM cost.
 *
 * @lore adapter-pool-selection: The capacity test (fills pool slot via pool.select())
 * never calls the harness — provisionSession throws NoEligibleHarnessError before
 * startSession. Keeping it untagged prevents it from being counted against the
 * per-harness agentic floor (which only gates tests that actually run an agent).
 *
 * @lore adapter-pool-matrix: provisionSession selects from the pool and releases the
 * slot when the session completes. The per-harness lane from SUPPORTED_HARNESS_LANES
 * carries the right adapter, model, and per-harness prep (codex git-init, opencode
 * XDG isolation, claude MCP bridge). Seeding happens AFTER prepFn so the DB rows
 * match the dynamic taskId/agentId the lane generates.
 *
 * @lore pool-slot-release: After provisionSession resolves, pool.list()[0].currentLoad
 * must be 0 regardless of outcome (completed/not_returned). The release happens in the
 * pool.release() call inside session-lifecycle.ts's finally block.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import { bets, sessions, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { clearDeduplicationCache } from "@hyperidle/fabric";
import { minimalStrategy } from "@hyperidle/strategy-minimal";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect } from "vitest";
import type { ProvisionSessionDeps } from "../../services/session-provisioning.js";
import { provisionSession } from "../../services/session-provisioning.js";
import { clearActiveStrategy, setActiveStrategy } from "../../services/strategy-registry.js";
import { test } from "../../test-fixtures.js";
import type { AdapterMeta } from "../adapter-pool.js";
import { AdapterPool } from "../adapter-pool.js";
import { LocalSandboxAdapter } from "../local-sandbox-adapter.js";
import {
	createSandboxCapture,
	lockedHarnessAdapter,
	SUPPORTED_HARNESS_LANES,
	startMcpBridgeServer,
} from "./provision-real-session.js";
import { requireHarness } from "./require-harness.js";

const NOW = "2026-05-29T00:00:00.000Z";

// ── Shared domain seed ────────────────────────────────────────────────────────

/**
 * Seed the team/bet scaffold. The caller provides taskId and agentId so the
 * DB rows match the dynamic IDs generated inside each lane's prepFn.
 *
 * @lore pool-seed-after-prep: prepFn generates taskId/agentId via Date.now().
 * We call prepFn first, extract the params, then seed so there is no FK gap
 * between what provisionSession looks up and what is in the DB.
 */
async function seedPoolDomain(db: HyperIdleDb, agentId: string, taskId: string): Promise<void> {
	// productId from SUPPORTED_HARNESS_LANES is "p1" — teamId must match.
	// buildSessionContextData looks up teams.id === productId; seed "p1" so it finds the row.
	const teamId = "p1";
	const tmId = "pool-tm-1";
	const betId = "pool-bet-1";

	await db
		.insert(teams)
		.values({ id: teamId, name: "Pool Team", phase: "build", createdAt: NOW })
		.onConflictDoNothing();
	await db
		.insert(teamMembers)
		.values({ id: tmId, teamId, capacity: 5, activeBets: 0, formedAt: NOW })
		.onConflictDoNothing();
	await db
		.insert(bets)
		.values({
			id: betId,
			teamId,
			description: "Pool selection bet",
			appetite: "small",
			status: "active",
			doneCondition: "Submit a review via submit_review with title='Pool done'.",
			createdAt: NOW,
		})
		.onConflictDoNothing();
	await db.insert(users).values({
		id: agentId,
		name: "Pool Agent",
		role: "builder",
		status: "active",
		teamId: tmId,
		maxConcurrentSessions: 3,
		costCap: null,
		costActual: 0,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		title: "Pool task",
		description: "Call submit_review with title='Pool done' and reasoning=['done'].",
		doneCondition: "Submit a review via submit_review with title='Pool done'.",
		state: "accepted",
		ownerAgentId: agentId,
		createdAt: NOW,
		updatedAt: NOW,
	});
}

// ── SECTION 1: MATRIX — real provisionSession through the pool ────────────────
//
// Four explicit describe blocks — literal requireHarness("<name>") per lane so
// the honest-harness-guard AR7 coverage check sees all four harnesses.
// Shared test body factored into runPoolMatrixLane() to avoid logic duplication.
// Lane is looked up by name from SUPPORTED_HARNESS_LANES via laneFor().
// ─────────────────────────────────────────────────────────────────────────────

/** Look up a lane from SUPPORTED_HARNESS_LANES by harness name. */
function laneFor(name: string): import("./provision-real-session.js").HarnessLane {
	const found = SUPPORTED_HARNESS_LANES.find((l) => l.harnessName === name);
	if (!found) throw new Error(`laneFor: no lane for "${name}" in SUPPORTED_HARNESS_LANES`);
	return found;
}

async function runPoolMatrixLane(
	lane: import("./provision-real-session.js").HarnessLane,
	db: Parameters<typeof provisionSession>[0]["db"],
	eventBus: Parameters<typeof provisionSession>[0]["eventBus"],
	tmpDir: string,
	bridge: Awaited<ReturnType<typeof startMcpBridgeServer>> | undefined,
): Promise<void> {
	// Step 1: call prepFn to learn the taskId/agentId the lane will use.
	const ctx = { db, eventBus, tmpDir, bridge };
	const { pool, params, capturePaths } = lane.prepFn(ctx);

	// Step 2: seed the DB with the IDs the lane chose.
	await seedPoolDomain(db, params.agentId, params.taskId);

	// Slot must start at zero.
	expect(pool.list()[0]?.currentLoad).toBe(0);

	// Step 3: build the capture seam + deps and run provisionSession.
	const cap = createSandboxCapture(capturePaths ? { paths: capturePaths } : undefined);
	const deps: ProvisionSessionDeps = {
		db,
		eventBus,
		adapterPool: pool,
		workspace: new LocalSandboxAdapter(),
		...(bridge
			? {
					mcpBridgeRegistry: bridge.mcpBridgeRegistry,
					mcpBaseUrl: bridge.mcpBaseUrl,
				}
			: {}),
		onBeforeTeardown: cap.onBeforeTeardown,
	};

	const result = await provisionSession(deps, params);

	// Step 4: harness-agnostic assertions.
	expect(result.outcome).not.toBe("crashed");
	// The pool must release the slot after completion (slot back to 0).
	expect(pool.list()[0]?.currentLoad).toBe(0);
	// The session row must reach state "done" in the DB.
	const [session] = await db.select().from(sessions).where(eq(sessions.id, result.sessionId));
	expect(session?.state).toBe("done");
}

describe("[harness:builtin] pool provisions a real session through the selected adapter", () => {
	requireHarness("builtin");
	let tmpDir: string;
	let bridge: Awaited<ReturnType<typeof startMcpBridgeServer>> | undefined;
	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pool-matrix-"));
		clearDeduplicationCache();
		setActiveStrategy(minimalStrategy);
		bridge = await startMcpBridgeServer();
	});
	afterEach(async () => {
		clearActiveStrategy();
		await bridge?.close();
		bridge = undefined;
		if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
	});
	test("pool selects the adapter, runs a real session, and releases the slot on completion", async ({
		db,
		eventBus,
	}) => {
		await runPoolMatrixLane(laneFor("builtin"), db, eventBus, tmpDir, bridge);
	}, 120_000);
});

describe("[harness:claude] pool provisions a real session through the selected adapter", () => {
	requireHarness("claude");
	let tmpDir: string;
	let bridge: Awaited<ReturnType<typeof startMcpBridgeServer>> | undefined;
	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pool-matrix-"));
		clearDeduplicationCache();
		setActiveStrategy(minimalStrategy);
		bridge = await startMcpBridgeServer();
	});
	afterEach(async () => {
		clearActiveStrategy();
		await bridge?.close();
		bridge = undefined;
		if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
	});
	test("pool selects the adapter, runs a real session, and releases the slot on completion", async ({
		db,
		eventBus,
	}) => {
		await runPoolMatrixLane(laneFor("claude"), db, eventBus, tmpDir, bridge);
	}, 120_000);
});

describe("[harness:codex] pool provisions a real session through the selected adapter", () => {
	requireHarness("codex");
	let tmpDir: string;
	let bridge: Awaited<ReturnType<typeof startMcpBridgeServer>> | undefined;
	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pool-matrix-"));
		clearDeduplicationCache();
		setActiveStrategy(minimalStrategy);
		bridge = await startMcpBridgeServer();
	});
	afterEach(async () => {
		clearActiveStrategy();
		await bridge?.close();
		bridge = undefined;
		if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
	});
	test("pool selects the adapter, runs a real session, and releases the slot on completion", async ({
		db,
		eventBus,
	}) => {
		await runPoolMatrixLane(laneFor("codex"), db, eventBus, tmpDir, bridge);
	}, 120_000);
});

describe("[harness:opencode] pool provisions a real session through the selected adapter", () => {
	requireHarness("opencode");
	let tmpDir: string;
	let bridge: Awaited<ReturnType<typeof startMcpBridgeServer>> | undefined;
	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pool-matrix-"));
		clearDeduplicationCache();
		setActiveStrategy(minimalStrategy);
		bridge = await startMcpBridgeServer();
	});
	afterEach(async () => {
		clearActiveStrategy();
		await bridge?.close();
		bridge = undefined;
		if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
	});
	test("pool selects the adapter, runs a real session, and releases the slot on completion", async ({
		db,
		eventBus,
	}) => {
		await runPoolMatrixLane(laneFor("opencode"), db, eventBus, tmpDir, bridge);
	}, 120_000);
});

// ── SECTION 2: LOGIC — pure pool-selection math (untagged, no real agent) ────
//
// These tests exercise AdapterPool mechanics (capacity math, modelProviders
// filter, min-load selection) that need no real harness. They run as fast
// service-integration tests.
// ─────────────────────────────────────────────────────────────────────────────

const LOCAL_META: AdapterMeta = {
	name: "local",
	kind: "local",
	type: "builtin",
	modelProviders: ["anthropic", "openrouter", "openai-compatible"],
	maxConcurrent: 4,
};

// @lore AR7-seam: use lockedHarnessAdapter("builtin").adapter (HarnessAdapter interface)
// rather than importing BuiltinHarnessAdapter directly (banned by honest-harness-guard).
function makeBuiltinAdapter(): import("@hyperidle/shared").HarnessAdapter {
	return lockedHarnessAdapter("builtin").adapter;
}

describe("pool capacity: all adapters at capacity → provisioning throws before starting the agent", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pool-cap-"));
		setActiveStrategy(minimalStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	test("provisionSession throws when no adapter slot is available, and the task row stays unchanged", async ({
		db,
		eventBus,
	}) => {
		// Seed a minimal domain for provisionSession to look up.
		await db
			.insert(teams)
			.values({ id: "cap-team", name: "Cap Team", phase: "build", createdAt: NOW })
			.onConflictDoNothing();
		await db
			.insert(teamMembers)
			.values({ id: "cap-tm", teamId: "cap-team", capacity: 5, activeBets: 0, formedAt: NOW })
			.onConflictDoNothing();
		await db.insert(users).values({
			id: "cap-agent",
			name: "Cap Agent",
			role: "builder",
			status: "active",
			teamId: "cap-tm",
			maxConcurrentSessions: 3,
			costCap: null,
			costActual: 0,
			createdAt: NOW,
		});
		await db
			.insert(bets)
			.values({
				id: "cap-bet",
				teamId: "cap-team",
				description: "Cap bet",
				appetite: "small",
				status: "active",
				createdAt: NOW,
			})
			.onConflictDoNothing();
		await db.insert(tasks).values({
			id: "cap-task",
			betId: "cap-bet",
			teamId: "cap-team",
			title: "Cap task",
			description: "capacity test task",
			state: "accepted",
			ownerAgentId: "cap-agent",
			createdAt: NOW,
			updatedAt: NOW,
		});

		// Register with maxConcurrent: 1 and pre-fill the only slot.
		// The real adapter is registered but NEVER started — the pool throws
		// NoEligibleHarnessError before provisionSession reaches startSession.
		// No LLM call, no cost.
		const pool = new AdapterPool();
		pool.register("local", makeBuiltinAdapter(), { ...LOCAL_META, maxConcurrent: 1 });
		pool.select(); // fill the only slot

		const deps: ProvisionSessionDeps = {
			db,
			eventBus,
			adapterPool: pool,
			workspace: new LocalSandboxAdapter(),
		};

		await expect(
			provisionSession(deps, {
				taskId: "cap-task",
				agentId: "cap-agent",
				productId: "cap-team",
				sandboxBasePath: tmpDir,
				resolvedModel: {
					provider: "openai-compatible",
					model: "deepseek/deepseek-v4-pro",
					apiKey: process.env.OPENROUTER_API_KEY ?? "not-needed-pool-throws-first",
					baseUrl: "https://openrouter.ai/api",
				},
			}),
		).rejects.toThrow();

		// The task must remain in its original state — no state transition occurred.
		const [task] = await db.select().from(tasks).where(eq(tasks.id, "cap-task"));
		expect(task?.state).toBe("accepted");
	});
});

describe("pool registration: createLocalAdapterPool registers at least claude-code and builtin adapters", () => {
	requireHarness("claude"); // hard-fail: claude-code adapter is only registered when the claude binary is on PATH
	test("pool has at least two local adapters and includes both claude-code and builtin types", async () => {
		const { createLocalAdapterPool } = await import("../adapter-pool.js");

		const pool = await createLocalAdapterPool();
		const entries = pool.list();

		expect(entries.length).toBeGreaterThanOrEqual(2);
		expect(entries.every((e) => e.kind === "local")).toBe(true);
		expect(entries.some((e) => e.type === "claude-code")).toBe(true);
		expect(entries.some((e) => e.type === "builtin")).toBe(true);
	});
});
