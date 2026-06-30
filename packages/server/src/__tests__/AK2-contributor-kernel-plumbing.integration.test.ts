/**
 * AK2 — Contributor Strategy: Kernel→port plumbing assertions.
 *
 * AR5 TEST-COST REFACTOR: Tests #2 and #3 from AK2-contributor-scenario were
 * demoted here from the real-LLM × 4-harness matrix. Both assertions fire in
 * `admitSession` (phases 6-7 of session-provisioning.ts) BEFORE the harness
 * runs any LLM turn — they are deterministic Kernel plumbing, not agent behavior.
 * Using MockHarnessAdapter here is honest: the harness is NOT the thing under
 * test; the thing under test is the Kernel→Strategy-port handoff shape.
 *
 * This is a SERVICE-INTEGRATION test (real DB + real provisionSession, per
 * testing.md two-archetype rule). It does NOT use requireHarness, does NOT live
 * in EXPLICIT_HARNESS_INTEGRATION, and does NOT use runThroughHarness.
 *
 * Test #2 — "Kernel passes correct assembleContext request fields":
 *   Asserts on assembleContextCalls[0] fields (taskId/agentId/teamId/sandboxPath/sessionId).
 *
 * Test #3 — "Kernel calls beginLearningIngestion and disposes the handle":
 *   Asserts ingestionCalls.length===1 + disposeCallCount===1.
 *
 * AC4: Selecting the minimal Strategy requires no Kernel-code modification —
 *      only registering a different Strategy; the Kernel imports no specific Strategy.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { bets, type HyperIdleDb, tasks, teamMembers, teams, users } from "@hyperidle/db";
import type {
	ContextAssemblyOutcome,
	ContextAssemblyRequest,
	IngestionHandle,
	IngestionRequest,
	Strategy,
} from "@hyperidle/shared";
import { MockHarnessAdapter } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect } from "vitest";
import { AdapterPool } from "../harness/adapter-pool.js";
import { LocalSandboxAdapter } from "../harness/local-sandbox-adapter.js";
import { type ProvisionSessionDeps, provisionSession } from "../services/session-provisioning.js";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";
import { test } from "../test-fixtures.js";

// ---------------------------------------------------------------------------
// Same ContributorStrategy definition as AK2-contributor-scenario (in-test).
// Duplicated deliberately: this file must stand alone without importing from
// a harness-facing test file. The shape is intentionally minimal — only what
// the two assertions here need.
// ---------------------------------------------------------------------------

interface ContributorRecord {
	readonly sessionId: string;
	readonly sandboxPath: string;
	readonly taskId: string;
	readonly teamId: string;
	readonly disposeCallCount: number;
}

class ContributorStrategy implements Strategy<HyperIdleDb> {
	readonly assembleContextCalls: Array<ContextAssemblyRequest<HyperIdleDb>> = [];
	readonly ingestionCalls: Array<IngestionRequest<HyperIdleDb>> = [];
	disposeCallCount = 0;

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

	// AK6: scaffoldAgents stub — not under test here.
	async scaffoldAgents(
		_req: import("@hyperidle/shared").ScaffoldRequest<HyperIdleDb>,
	): Promise<readonly import("@hyperidle/shared").AgentScaffoldSpec[]> {
		return [];
	}

	// AK7: selectAgent stub — not under test here.
	async selectAgent(
		_req: import("@hyperidle/shared").SelectAgentRequest<HyperIdleDb>,
	): Promise<import("@hyperidle/shared").SelectAgentOutcome> {
		return { agentId: null };
	}

	// AK8: decomposeBet stub — not under test here.
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
		};
	}
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

const NOW = "2026-06-15T00:00:00.000Z";
const AGENT_ID = "ak2-plumbing-agent";
const TASK_ID = "ak2-plumbing-task";
const PRODUCT_ID = "ak2-plumbing-p1";

async function seedDomain(db: HyperIdleDb): Promise<void> {
	const memberId = "tm-ak2-plumbing";
	await db
		.insert(teams)
		.values({ id: PRODUCT_ID, name: "AK2 Plumbing Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: memberId, teamId: PRODUCT_ID, capacity: 5, activeBets: 0, formedAt: NOW });
	await db.insert(bets).values({
		id: "b-ak2-plumbing",
		teamId: PRODUCT_ID,
		description: "AK2 plumbing test bet",
		appetite: "small",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: AGENT_ID,
		name: "AK2 Plumbing Builder",
		role: "builder",
		status: "active",
		teamId: memberId,
		maxConcurrentSessions: 2,
		costActual: 0,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: TASK_ID,
		betId: "b-ak2-plumbing",
		teamId: PRODUCT_ID,
		title: "AK2 Plumbing Task",
		description: "Write a file named answer.txt in the current directory containing 'done'.",
		doneCondition: "answer.txt exists with content 'done'",
		state: "accepted",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

// ---------------------------------------------------------------------------
// Shared deps factory (MockHarnessAdapter — deterministic, not real LLM)
// @lore AR5: MockHarnessAdapter is honest here because the harness is NOT the
// thing under test. The assertions target assembleContextCalls/ingestionCalls
// which fire in admitSession (phases 6-7) BEFORE any harness turn. A real LLM
// × 4 lanes would pay ~8 sessions to prove plumbing that runs identically on
// every harness/model combination.
// ---------------------------------------------------------------------------

function buildDeps(
	db: HyperIdleDb,
	eventBus: import("@hyperidle/shared").EventBus,
): ProvisionSessionDeps {
	const adapter = new MockHarnessAdapter();
	const pool = new AdapterPool();
	pool.register("mock-local", adapter, {
		name: "mock-local",
		kind: "local",
		modelProviders: ["anthropic"],
		maxConcurrent: 1,
	});
	return {
		db,
		eventBus,
		adapterPool: pool,
		workspace: new LocalSandboxAdapter(),
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AK2 — Contributor Strategy: Kernel plumbing (service-integration, no real LLM)", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak2-kernel-plumbing-"));
	});

	afterEach(() => {
		clearActiveStrategy();
		if (fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	// Test #2 (demoted from AK2-contributor-scenario): assembleContext request fields.
	// Asserts on assembleContextCalls[0] fields (taskId/agentId/teamId/sandboxPath/sessionId).
	// These fields are set in admitSession (session-provisioning.ts:538-546) BEFORE the harness.
	test("Kernel passes correct assembleContext request fields to the contributor Strategy", async ({
		db,
		eventBus,
	}) => {
		await seedDomain(db);
		const contributorStrategy = new ContributorStrategy();
		setActiveStrategy(contributorStrategy);

		const deps = buildDeps(db, eventBus);
		await provisionSession(deps, {
			taskId: TASK_ID,
			agentId: AGENT_ID,
			productId: PRODUCT_ID,
			sandboxBasePath: tmpDir,
		});

		expect(contributorStrategy.assembleContextCalls).toHaveLength(1);
		const req = contributorStrategy.assembleContextCalls[0]!;
		expect(req.taskId).toBe(TASK_ID);
		expect(req.agentId).toBe(AGENT_ID);
		// assembleContext.teamId is params.productId (session-provisioning.ts line 545)
		expect(req.teamId).toBe(PRODUCT_ID);
		expect(typeof req.sandboxPath).toBe("string");
		expect(req.sandboxPath.length).toBeGreaterThan(0);
		expect(typeof req.sessionId).toBe("string");
		expect(req.sessionId.length).toBeGreaterThan(0);
	});

	// Test #3 (demoted from AK2-contributor-scenario): beginLearningIngestion + dispose.
	// Asserts ingestionCalls.length===1 + disposeCallCount===1.
	// beginLearningIngestion fires at session-provisioning.ts:555; dispose at teardown.
	// Both are independent of LLM output.
	test("Kernel calls beginLearningIngestion and disposes the handle on session end", async ({
		db,
		eventBus,
	}) => {
		await seedDomain(db);
		const contributorStrategy = new ContributorStrategy();
		setActiveStrategy(contributorStrategy);

		const deps = buildDeps(db, eventBus);
		await provisionSession(deps, {
			taskId: TASK_ID,
			agentId: AGENT_ID,
			productId: PRODUCT_ID,
			sandboxBasePath: tmpDir,
		});

		expect(contributorStrategy.ingestionCalls).toHaveLength(1);
		expect(contributorStrategy.disposeCallCount).toBe(1);
	});
});
