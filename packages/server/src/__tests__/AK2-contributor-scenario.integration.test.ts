/**
 * AK2 — Contributor Strategy: register and run with zero Kernel changes.
 * AR5 CONVERSION: replaced EchoHarnessAdapter with real 4-lane matrix via
 * `runThroughHarness`. The thing under test is "a real session runs to
 * completion under a custom ContributorStrategy" — the harness IS the
 * integration point, so `runThroughHarness` is the correct entry point here.
 *
 * AC4: Selecting the minimal Strategy requires no Kernel-code modification —
 *      only registering a different Strategy; the Kernel imports no specific
 *      Strategy.
 *
 * Scenario 3 (from the WP validation scenarios):
 *   Given a contributor implements the port in a new module and registers it,
 *   then it runs with zero changes to Kernel code.
 *
 * This test defines a tiny in-test Strategy (NOT @hyperidle/strategy-minimal,
 * NOT @hyperidle/fabric) that implements Strategy<HyperIdleDb> from scratch.
 * It registers via setActiveStrategy and dispatches a session via the real
 * harness binary. The test proves:
 * - The Strategy Port seam is open — any conforming object can run.
 * - ZERO changes to Kernel code are needed (the test only registers + dispatches).
 * - The contributor's Strategy can observe what it received from the Kernel.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { bets, type HyperIdleDb, sessions, tasks, teamMembers, teams, users } from "@hyperidle/db";
import type {
	ContextAssemblyOutcome,
	ContextAssemblyRequest,
	IngestionHandle,
	IngestionRequest,
	Strategy,
} from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect } from "vitest";
import {
	runThroughHarness,
	SUPPORTED_HARNESS_LANES,
	startMcpBridgeServer,
} from "../harness/__tests__/provision-real-session.js";
import { requireHarness } from "../harness/__tests__/require-harness.js";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";
import { test } from "../test-fixtures.js";

// ---------------------------------------------------------------------------
// Contributor's custom Strategy — implemented entirely in-test.
// This is the proof of the open seam: a third party writes this module and
// calls setActiveStrategy(contributorStrategy) — zero Kernel code changes.
// ---------------------------------------------------------------------------

interface ContributorRecord {
	readonly sessionId: string;
	readonly sandboxPath: string;
	readonly taskId: string;
	readonly teamId: string;
	readonly disposeCallCount: number;
	/**
	 * Path to the custom context file captured DURING assembleContext (before the
	 * sandbox is deleted by endSession). The Kernel deletes the sandbox at session
	 * end, so post-session disk assertions would fail. We capture the path and content
	 * in-memory during assembly and assert on those instead.
	 *
	 * @lore AK2: sandbox is deleted by endSession; capture disk state during assembly.
	 */
	readonly capturedContextPath: string;
	readonly capturedContextContent: string;
}

class ContributorStrategy implements Strategy<HyperIdleDb> {
	/** Captured requests for assertion — the contributor can observe the Kernel's handoff. */
	readonly assembleContextCalls: Array<ContextAssemblyRequest<HyperIdleDb>> = [];
	readonly ingestionCalls: Array<IngestionRequest<HyperIdleDb>> = [];
	disposeCallCount = 0;
	private _capturedContextPath = "";
	private _capturedContextContent = "";

	async assembleContext(req: ContextAssemblyRequest<HyperIdleDb>): Promise<ContextAssemblyOutcome> {
		this.assembleContextCalls.push(req);
		// Minimal scaffold so the Kernel's post-admission invariants hold.
		fs.mkdirSync(path.join(req.sandboxPath, "context"), { recursive: true });
		fs.mkdirSync(path.join(req.sandboxPath, "knowledge"), { recursive: true });
		fs.mkdirSync(path.join(req.sandboxPath, "work"), { recursive: true });
		fs.mkdirSync(path.join(req.sandboxPath, ".fabric"), { recursive: true });
		fs.writeFileSync(
			path.join(req.sandboxPath, ".fabric", "manifest.json"),
			JSON.stringify({
				session_id: req.sessionId,
				assembled_at: new Date().toISOString(),
				items: [],
			}),
		);
		// Contributor writes a custom context file — proof it can do ANYTHING it wants.
		const contextFilePath = path.join(req.sandboxPath, "context", "contributor-context.md");
		const contextContent = `# Contributor Context\nCustom knowledge for session ${req.sessionId}.`;
		fs.writeFileSync(contextFilePath, contextContent);
		// Capture path + content in-memory: the Kernel deletes the sandbox at session end,
		// so post-session disk assertions would fail. Tests assert on these in-memory values.
		this._capturedContextPath = contextFilePath;
		this._capturedContextContent = contextContent;
		return { itemCount: 1, durationMs: 0 };
	}

	beginLearningIngestion(req: IngestionRequest<HyperIdleDb>): IngestionHandle {
		this.ingestionCalls.push(req);
		const strategy = this;
		return {
			dispose(): void {
				strategy.disposeCallCount++;
			},
		};
	}

	// AK6: scaffoldAgents stub — ContributorStrategy test is not about agent creation.
	async scaffoldAgents(
		_req: import("@hyperidle/shared").ScaffoldRequest<HyperIdleDb>,
	): Promise<readonly import("@hyperidle/shared").AgentScaffoldSpec[]> {
		return [];
	}

	// AK7: selectAgent stub — ContributorStrategy test is not about agent selection.
	async selectAgent(
		_req: import("@hyperidle/shared").SelectAgentRequest<HyperIdleDb>,
	): Promise<import("@hyperidle/shared").SelectAgentOutcome> {
		return { agentId: null };
	}

	// AK8: decomposeBet stub — ContributorStrategy test is not about decomposition.
	async decomposeBet(
		_req: import("@hyperidle/shared").DecomposeBetRequest<HyperIdleDb>,
	): Promise<import("@hyperidle/shared").DecompositionPlan> {
		return { decomposerAgentId: null, tasks: [] };
	}

	toRecord(): ContributorRecord {
		const call = this.assembleContextCalls[0];
		return {
			sessionId: call?.sessionId ?? "",
			sandboxPath: call?.sandboxPath ?? "",
			taskId: call?.taskId ?? "",
			teamId: call?.teamId ?? "",
			disposeCallCount: this.disposeCallCount,
			capturedContextPath: this._capturedContextPath,
			capturedContextContent: this._capturedContextContent,
		};
	}
}

// ---------------------------------------------------------------------------
// Lane references (index-stable: builtin=0, claude=1, codex=2, opencode=3)
// ---------------------------------------------------------------------------
const BUILTIN_LANE = SUPPORTED_HARNESS_LANES[0]!;
const CLAUDE_LANE = SUPPORTED_HARNESS_LANES[1]!;
const CODEX_LANE = SUPPORTED_HARNESS_LANES[2]!;
const OPENCODE_LANE = SUPPORTED_HARNESS_LANES[3]!;

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

const NOW = "2026-06-15T00:00:00.000Z";

/**
 * Seed a minimal domain using the agentId, taskId, and productId generated by
 * the lane's `prepFn`. Called inside `onBeforeSession` so the ACTUAL generated
 * IDs are known before `admitSession` looks them up.
 *
 * @lore AR5: `prepFn` generates agentId/taskId via `Date.now()` and uses a fixed
 * `productId: "p1"`. `fabric/session-context.ts` looks up `teams.id = productId`,
 * so the seeded team must use `productId` as its ID (not a hardcoded string).
 */
async function seedDomain(
	db: HyperIdleDb,
	agentId: string,
	taskId: string,
	productId: string,
): Promise<void> {
	const memberId = "tm-ak2c";
	await db
		.insert(teams)
		.values({ id: productId, name: "AK2C Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: memberId, teamId: productId, capacity: 5, activeBets: 0, formedAt: NOW });
	await db.insert(bets).values({
		id: "b-ak2c",
		teamId: productId,
		description: "AK2 contributor test bet",
		appetite: "small",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: agentId,
		name: "AK2C Builder",
		role: "builder",
		status: "active",
		teamId: memberId,
		maxConcurrentSessions: 2,
		costActual: 0,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: taskId,
		betId: "b-ak2c",
		teamId: productId,
		title: "AK2 Contributor Task",
		state: "accepted",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

// ---------------------------------------------------------------------------
// Shared lane describe body factory (reduces duplication across 4 lanes)
// ---------------------------------------------------------------------------

function makeLaneDescribe(lane: (typeof SUPPORTED_HARNESS_LANES)[number]): void {
	let tmpDir: string;
	let bridge: Awaited<ReturnType<typeof startMcpBridgeServer>> | undefined;

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `ak2-contributor-${lane.harnessName}-`));
		if (lane.harnessName !== "builtin") {
			bridge = await startMcpBridgeServer();
		}
	});

	afterEach(async () => {
		clearActiveStrategy();
		if (bridge) {
			await bridge.close();
			bridge = undefined;
		}
		if (fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	// AC4 / Scenario 3: contributor registers their Strategy and it runs to completion.
	test("contributor Strategy runs session to completion without modifying Kernel code", async ({
		db,
		eventBus,
	}) => {
		const contributorStrategy = new ContributorStrategy();
		setActiveStrategy(contributorStrategy);

		const { result } = await runThroughHarness(lane, {
			db,
			eventBus,
			tmpDir,
			bridge,
			// @lore AR5: seed AFTER prepFn generates agentId/taskId/productId so we use
			// the ACTUAL IDs. productId is always "p1" from SUPPORTED_HARNESS_LANES but
			// we read it dynamically in case lane config changes.
			onBeforeSession: async (params) => {
				await seedDomain(db, params.agentId, params.taskId, params.productId);
			},
		});

		// AR2 lore: builtin+claude fire MCP return tool → "completed";
		// codex+opencode do real work but may not return → "not_returned".
		expect(["completed", "not_returned"]).toContain(result.outcome);
		const [session] = await db.select().from(sessions).where(eq(sessions.id, result.sessionId));
		expect(session?.state).toBe("done");
	});

	// AC4 / Scenario 3: the Kernel passed the correct request fields to the contributor.
	test("Kernel passes correct assembleContext request fields to the contributor Strategy", async ({
		db,
		eventBus,
	}) => {
		const contributorStrategy = new ContributorStrategy();
		setActiveStrategy(contributorStrategy);

		// Capture the generated params so we can assert on the ACTUAL agentId/taskId
		// and productId that the lane will use (not fixed constants that would never match).
		let capturedAgentId = "";
		let capturedTaskId = "";
		let capturedProductId = "";

		await runThroughHarness(lane, {
			db,
			eventBus,
			tmpDir,
			bridge,
			onBeforeSession: async (params) => {
				capturedAgentId = params.agentId;
				capturedTaskId = params.taskId;
				capturedProductId = params.productId;
				await seedDomain(db, params.agentId, params.taskId, params.productId);
			},
		});

		expect(contributorStrategy.assembleContextCalls).toHaveLength(1);
		const req = contributorStrategy.assembleContextCalls[0]!;
		expect(req.taskId).toBe(capturedTaskId);
		expect(req.agentId).toBe(capturedAgentId);
		// assembleContext.teamId is params.productId (session-provisioning.ts line 545)
		expect(req.teamId).toBe(capturedProductId);
		expect(typeof req.sandboxPath).toBe("string");
		expect(req.sandboxPath.length).toBeGreaterThan(0);
		expect(typeof req.sessionId).toBe("string");
		expect(req.sessionId.length).toBeGreaterThan(0);
	});

	// AC4 / Scenario 3: the Kernel called beginLearningIngestion and disposed the handle.
	test("Kernel calls beginLearningIngestion and disposes the handle on session end", async ({
		db,
		eventBus,
	}) => {
		const contributorStrategy = new ContributorStrategy();
		setActiveStrategy(contributorStrategy);

		await runThroughHarness(lane, {
			db,
			eventBus,
			tmpDir,
			bridge,
			onBeforeSession: async (params) => {
				await seedDomain(db, params.agentId, params.taskId, params.productId);
			},
		});

		expect(contributorStrategy.ingestionCalls).toHaveLength(1);
		expect(contributorStrategy.disposeCallCount).toBe(1);
	});

	// AC4 / Scenario 3: the contributor's custom context file is in the sandbox.
	// @lore AK2: sandbox deleted by endSession; use in-memory capture for disk assertions.
	test("contributor Strategy's custom context assembly appears in the sandbox", async ({
		db,
		eventBus,
	}) => {
		const contributorStrategy = new ContributorStrategy();
		setActiveStrategy(contributorStrategy);

		await runThroughHarness(lane, {
			db,
			eventBus,
			tmpDir,
			bridge,
			onBeforeSession: async (params) => {
				await seedDomain(db, params.agentId, params.taskId, params.productId);
			},
		});

		const record = contributorStrategy.toRecord();
		expect(record.capturedContextPath).toContain("contributor-context.md");
		expect(record.capturedContextContent).toContain("Custom knowledge for session");
	});
}

// ---------------------------------------------------------------------------
// Tests — 4-lane harness matrix (AR5 conversion)
// Explicit per-lane describe blocks so the honest-harness-guard coverage check
// finds literal requireHarness("...") call expressions in the source.
// ---------------------------------------------------------------------------

describe(`${BUILTIN_LANE.describeTag} AK2 — Contributor Strategy`, () => {
	requireHarness("builtin");
	makeLaneDescribe(BUILTIN_LANE);
});

describe(`${CLAUDE_LANE.describeTag} AK2 — Contributor Strategy`, () => {
	requireHarness("claude");
	makeLaneDescribe(CLAUDE_LANE);
});

describe(`${CODEX_LANE.describeTag} AK2 — Contributor Strategy`, () => {
	requireHarness("codex");
	makeLaneDescribe(CODEX_LANE);
});

describe(`${OPENCODE_LANE.describeTag} AK2 — Contributor Strategy`, () => {
	requireHarness("opencode");
	makeLaneDescribe(OPENCODE_LANE);
});
