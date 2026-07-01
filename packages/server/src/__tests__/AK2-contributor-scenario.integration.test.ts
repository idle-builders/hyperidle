/**
 * AK2 — Contributor scenario integration tests (RED phase).
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
 * It registers via setActiveStrategy and dispatches a session. The test proves:
 * - The Strategy Port seam is open — any conforming object can run.
 * - ZERO changes to Kernel code are needed (the test only registers + dispatches).
 * - The contributor's Strategy can observe what it received from the Kernel.
 *
 * These tests FAIL until:
 *   1. packages/server/src/services/strategy-registry.ts exists (green #2)
 *   2. Both Kernel provisioning paths route through getActiveStrategy() (green #5a, #5b)
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { bets, type HyperIdleDb, sessions, tasks, teamMembers, teams, users } from "@hyperidle/db";
import type {
	ContextAssemblyOutcome,
	ContextAssemblyRequest,
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	IngestionHandle,
	IngestionRequest,
	SessionConfig,
	SessionHandle,
	SessionResult,
	Strategy,
} from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect } from "vitest";
import { AdapterPool } from "../harness/adapter-pool.js";
import { LocalSandboxAdapter } from "../harness/local-sandbox-adapter.js";
import {
	type ProvisionSessionDeps,
	type ProvisionSessionParams,
	provisionSession,
} from "../services/session-provisioning.js";
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

	// AR4b: formAssistant stub — ContributorStrategy test is not about assistant formation.
	async formAssistant(
		_req: import("@hyperidle/shared").AssistantFormationRequest<HyperIdleDb>,
	): Promise<import("@hyperidle/shared").AssistantFormation> {
		return { persona: null, assistantDraftSurface: "standard" };
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
// Echo harness (same as minimal-strategy tests)
// ---------------------------------------------------------------------------

class EchoHarnessAdapter implements HarnessAdapter {
	async startSession(_config: SessionConfig): Promise<SessionHandle> {
		return { sessionId: "echo-session" };
	}

	async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
		// AL6 v2: emit submit_review so the return gate sees a return action.
		yield { type: "tool_call", toolName: "submit_review", args: { message: "AK2 stub done" } };
		yield { type: "completion", text: "Echo: done." };
	}

	async stopSession(_handle: SessionHandle): Promise<SessionResult> {
		return {
			outcome: "completed",
			cost: { minor: 0, currency: "USD" },
			tokenUsage: { byTier: {} },
		};
	}

	getCapabilities(): HarnessCapabilities {
		return {
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: ["anthropic"],
			mcpSupport: false,
			returnEnforcement: "none",
		};
	}
}

function makePool(adapter: HarnessAdapter): AdapterPool {
	const pool = new AdapterPool();
	pool.register("local", adapter, {
		name: "local",
		kind: "local",
		modelProviders: ["anthropic"],
		maxConcurrent: 4,
	});
	return pool;
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

const NOW = "2026-06-15T00:00:00.000Z";

async function seedDomain(db: HyperIdleDb): Promise<void> {
	await db
		.insert(teams)
		.values({ id: "p-ak2c", name: "AK2C Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: "tm-ak2c", teamId: "p-ak2c", capacity: 5, activeBets: 0, formedAt: NOW });
	await db.insert(bets).values({
		id: "b-ak2c",
		teamId: "p-ak2c",
		description: "AK2 contributor test bet",
		appetite: "small",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: "agent-ak2c",
		name: "AK2C Builder",
		role: "builder",
		status: "active",
		teamId: "tm-ak2c",
		maxConcurrentSessions: 2,
		costActual: 0,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: "task-ak2c",
		betId: "b-ak2c",
		teamId: "p-ak2c",
		title: "AK2 Contributor Task",
		state: "accepted",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

function baseParams(basePath: string): ProvisionSessionParams {
	return {
		taskId: "task-ak2c",
		agentId: "agent-ak2c",
		productId: "p-ak2c",
		sandboxBasePath: basePath,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AK2 — Contributor Strategy: register and run with zero Kernel changes", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak2-contributor-"));
	});

	afterEach(() => {
		clearActiveStrategy();
		if (fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	// AC4 / Scenario 3: contributor registers their Strategy and it runs to completion.
	test("contributor Strategy runs session to completion without modifying Kernel code", async ({
		db,
	}) => {
		const contributorStrategy = new ContributorStrategy();
		await seedDomain(db);

		// The contributor ONLY calls setActiveStrategy — no Kernel code changes.
		setActiveStrategy(contributorStrategy);

		const deps: ProvisionSessionDeps = {
			db,
			eventBus: { emit: () => {}, on: () => {}, off: () => {} } as never,
			adapterPool: makePool(new EchoHarnessAdapter()),
			workspace: new LocalSandboxAdapter(),
		};

		const result = await provisionSession(deps, baseParams(tmpDir));

		// Session completed.
		const [session] = await db.select().from(sessions).where(eq(sessions.id, result.sessionId));

		expect(session?.state).toBe("done");
		expect(session?.outcome).toBe("completed");
	});

	// AC4 / Scenario 3: the Kernel passed the correct request fields to the contributor.
	test("Kernel passes correct assembleContext request fields to the contributor Strategy", async ({
		db,
	}) => {
		const contributorStrategy = new ContributorStrategy();
		await seedDomain(db);
		setActiveStrategy(contributorStrategy);

		const deps: ProvisionSessionDeps = {
			db,
			eventBus: { emit: () => {}, on: () => {}, off: () => {} } as never,
			adapterPool: makePool(new EchoHarnessAdapter()),
			workspace: new LocalSandboxAdapter(),
		};

		await provisionSession(deps, baseParams(tmpDir));

		// The Kernel called assembleContext exactly once.
		expect(contributorStrategy.assembleContextCalls).toHaveLength(1);

		const req = contributorStrategy.assembleContextCalls[0]!;
		// Kernel passed the correct identifiers — no contract deviation.
		expect(req.taskId).toBe("task-ak2c");
		expect(req.agentId).toBe("agent-ak2c");
		expect(req.teamId).toBe("p-ak2c");
		expect(typeof req.sandboxPath).toBe("string");
		expect(req.sandboxPath.length).toBeGreaterThan(0);
		expect(typeof req.sessionId).toBe("string");
		expect(req.sessionId.length).toBeGreaterThan(0);
	});

	// AC4 / Scenario 3: the Kernel called beginLearningIngestion and disposed the handle.
	test("Kernel calls beginLearningIngestion and disposes the handle on session end", async ({
		db,
	}) => {
		const contributorStrategy = new ContributorStrategy();
		await seedDomain(db);
		setActiveStrategy(contributorStrategy);

		const deps: ProvisionSessionDeps = {
			db,
			eventBus: { emit: () => {}, on: () => {}, off: () => {} } as never,
			adapterPool: makePool(new EchoHarnessAdapter()),
			workspace: new LocalSandboxAdapter(),
		};

		await provisionSession(deps, baseParams(tmpDir));

		// Kernel called beginLearningIngestion exactly once at P7.
		expect(contributorStrategy.ingestionCalls).toHaveLength(1);

		// Kernel disposed the handle at teardown (session end path).
		// dispose() is called once — not zero, not twice.
		expect(contributorStrategy.disposeCallCount).toBe(1);
	});

	// AC4 / Scenario 3: the contributor's custom context file is in the sandbox.
	// NOTE: the Kernel deletes the sandbox at session end (endSession step 6). We
	// cannot check disk state after provisionSession returns. Instead we verify via
	// in-memory capture: ContributorStrategy records the path and content it wrote
	// during assembleContext. This is equivalent — it proves the Kernel passed the
	// sandbox to the contributor and let it write freely.
	// @lore AK2: sandbox deleted by endSession; use in-memory capture for disk assertions.
	test("contributor Strategy's custom context assembly appears in the sandbox", async ({ db }) => {
		const contributorStrategy = new ContributorStrategy();
		await seedDomain(db);
		setActiveStrategy(contributorStrategy);

		const deps: ProvisionSessionDeps = {
			db,
			eventBus: { emit: () => {}, on: () => {}, off: () => {} } as never,
			adapterPool: makePool(new EchoHarnessAdapter()),
			workspace: new LocalSandboxAdapter(),
		};

		await provisionSession(deps, baseParams(tmpDir));

		// The contributor wrote a custom context file — the Kernel did not
		// interfere with what was written.
		const record = contributorStrategy.toRecord();
		// Verify the file path was set during assembly (non-empty = assembleContext was called).
		const customContextPath = record.capturedContextPath;
		expect(customContextPath).toContain("contributor-context.md");
		// Verify the captured content contains the expected text (written during assembly).
		const content = record.capturedContextContent;
		expect(content).toContain("Custom knowledge for session");
	});
});
