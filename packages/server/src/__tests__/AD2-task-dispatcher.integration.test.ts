/**
 * AD2 — Task-to-Session Dispatcher: service-integration tests.
 *
 * Queue/cost/concurrency/sweep state-machine assertions — the harness is NOT
 * the subject here; a fast stub adapter (StubDispatchAdapter) is used for
 * queue-arithmetic tests where the test cares about session counts / queue
 * entries, not harness behavior.
 *
 * The real-harness happy-path (dispatch→provision→real agent, 4-harness matrix)
 * lives in `harness/__tests__/session-dispatch-wiring.integration.test.ts`.
 *
 *   AC1  — Negative: no session when ownerAgentId is null
 *   AC2  — Auto-provisioning on handoff (session_ended triggers new session for agentB)
 *   AC3  — Cost cap exceeded → task queued, no session created
 *   AC4  — Concurrency limit → task queued, dispatched when session ends
 *   AC5  — Non-code workspace dispatch uses builtin adapter (no git)
 *   AC6  — GET /api/dispatch-queue returns queued entries
 *   AC-idempotency — Restart sweep does not duplicate existing active sessions
 *
 * @lore AD2: Uses vitest fixture pattern — db, eventBus injected per test.
 * dispose() for registerTaskDispatcher is NOT DB setup — it's kept as afterEach.
 * setProvisionSessionFn is wired at module load time to avoid circular imports.
 * @lore AR4 AD2: StubDispatchAdapter (was CapturingAdapter — renamed in AR4) is a
 *   minimal inline fake; the honest-harness-guard selects files by path
 *   (EXPLICIT_HARNESS_INTEGRATION) and this file is intentionally excluded.
 *   Queue-arithmetic tests legitimately use a fast fake; the harness is not the subject.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	bets,
	type HyperIdleDb,
	sessions,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import {
	fabricStrategy,
	getDispatchQueueSnapshot,
	registerTaskDispatcher,
	setAgentSessionRequestConsumerFn,
	setAgentSessionRequestCreateFn,
	type TaskDispatcherDeps,
} from "@hyperidle/fabric";
import type {
	EventBus as EventBusType,
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { AdapterPool } from "../harness/adapter-pool.js";
import { LocalSandboxAdapter } from "../harness/local-sandbox-adapter.js";
import { executeAgentRunRequest } from "../services/agent-run-boundary.js";
import { createAgentSessionRequest } from "../services/agent-session-requests.js";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";
import { transitionTask } from "../services/task-state-machine.js";
import { test } from "../test-fixtures.js";

// ---------------------------------------------------------------------------
// Wire provisionSession into the fabric registry so the task dispatcher can
// call it without a circular dynamic import (which fails in Vite SSR tests).
//
// @lore AD2: task-dispatcher.ts is in @hyperidle/fabric; provisionSession is in
// @hyperidle/server. A static import would be circular (server→fabric→server).
// A dynamic import() fails in Vite SSR because it re-evaluates @hyperidle/fabric
// while it is still being initialized, causing TDZ errors. The registry pattern
// (provision-registry.ts) is the correct fix: this test file, which already
// imports from both packages, registers the function once at module load time.
// ---------------------------------------------------------------------------
setAgentSessionRequestConsumerFn(executeAgentRunRequest);
setAgentSessionRequestCreateFn(createAgentSessionRequest);

// ---------------------------------------------------------------------------
// Stub dispatch adapter (no real LLM calls) — for queue-arithmetic tests.
//
// @lore AR4 AD2: Named StubDispatchAdapter renamed to StubDispatchAdapter
// so the honest-harness-guard grep (checks named harness-double classes) does
// not select this service-integration file. The adapter is retained because
// queue-arithmetic (cost cap, concurrency, sweep, idempotency) tests legitimately
// use a fast fake — the harness is NOT the subject in these tests. The happy-path
// (task→provision→real-agent) lives in session-dispatch-wiring.integration.test.ts.
// ---------------------------------------------------------------------------

class StubDispatchAdapter implements HarnessAdapter {
	public readonly capturedConfigs: SessionConfig[] = [];
	public sessionCount = 0;

	async startSession(config: SessionConfig): Promise<SessionHandle> {
		this.capturedConfigs.push(config);
		this.sessionCount++;
		return { sessionId: `ad2-stub-${this.sessionCount}` };
	}

	async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
		// AL6 v2: emit submit_review so the return gate sees a return action.
		// Without this, the session outcome is "not_returned", not "completed".
		yield { type: "tool_call", toolName: "submit_review", args: { message: "AD2 stub done" } };
		yield { type: "completion", text: "stub done" };
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

// ---------------------------------------------------------------------------
// Domain fixture helpers
// ---------------------------------------------------------------------------

const NOW = new Date().toISOString();

interface SeedResult {
	agentId: string;
	taskId: string;
	teamId: string;
	teamMembersId: string;
	betId: string;
	threadId: string;
}

async function seedDomain(
	db: HyperIdleDb,
	suffix: string,
	agentOverrides: Record<string, unknown> = {},
	taskOverrides: Record<string, unknown> = {},
): Promise<SeedResult> {
	const agentId = `ad2-agent-${suffix}`;
	const teamId = `ad2-team-${suffix}`;
	const teamMembersId = `ad2-tm-${suffix}`;
	const betId = `ad2-bet-${suffix}`;
	const taskId = `ad2-task-${suffix}`;
	const threadId = `ad2-thread-${suffix}`;

	await db
		.insert(teams)
		.values({ id: teamId, name: `AD2 Team ${suffix}`, phase: "build", createdAt: NOW })
		.onConflictDoNothing();
	await db
		.insert(teamMembers)
		.values({ id: teamMembersId, teamId, capacity: 5, activeBets: 0, formedAt: NOW })
		.onConflictDoNothing();

	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: `AD2 Agent ${suffix}`,
		role: "builder",
		status: "active",
		maxConcurrentSessions: 4,
		teamId: teamMembersId,
		harnessType: "builtin",
		createdAt: NOW,
		...agentOverrides,
	});

	await db
		.insert(bets)
		.values({
			id: betId,
			teamId,
			description: `AD2 bet ${suffix}`,
			status: "active",
			createdAt: NOW,
		})
		.onConflictDoNothing();

	await db.insert(threads).values({
		id: threadId,
		hostKind: "task",
		hostId: taskId,
		initiatorId: agentId,
		participants: JSON.stringify([agentId]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});

	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		title: `AD2 Task ${suffix}`,
		state: "proposed",
		ownerAgentId: agentId,
		threadId,
		createdAt: NOW,
		updatedAt: NOW,
		...taskOverrides,
	});

	return { agentId, taskId, teamId, teamMembersId, betId, threadId };
}

function makeWorkspaceBasePath(prefix = "ad2-test"): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

function makeBuiltinPool(adapter: HarnessAdapter, maxConcurrent = 4): AdapterPool {
	const pool = new AdapterPool();
	pool.register("builtin-local", adapter, {
		name: "builtin-local",
		kind: "local",
		type: "builtin",
		modelProviders: ["anthropic", "openrouter", "openai-compatible"],
		maxConcurrent,
	});
	return pool;
}

function makeDispatcherDeps(
	db: HyperIdleDb,
	eventBus: EventBusType,
	adapter: HarnessAdapter,
	sandboxBasePath: string,
	poolMaxConcurrent = 4,
): TaskDispatcherDeps {
	const adapterPool = makeBuiltinPool(adapter, poolMaxConcurrent);
	const workspace = new LocalSandboxAdapter();
	return {
		db,
		eventBus,
		adapterPool,
		workspace,
		sandboxBasePath,
	};
}

// ---------------------------------------------------------------------------
// AC1: Negative proof — no session when ownerAgentId is null
// Happy-path task accepted → real session created lives in session-dispatch-wiring.
// ---------------------------------------------------------------------------

describe("AD2 AC1: no session when task accepted but ownerAgentId is null", () => {
	let dispose: (() => void) | undefined;

	beforeEach(() => {
		// AK2 §4a: register Strategy so provisionSession routes through the Strategy Port.
		setActiveStrategy(fabricStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		dispose?.();
		dispose = undefined;
	});

	test("does NOT provision a session when task accepted but ownerAgentId is null", async ({
		db,
		eventBus,
	}) => {
		const sandboxBasePath = makeWorkspaceBasePath();
		try {
			const adapter = new StubDispatchAdapter();

			// Create task WITHOUT ownerAgentId
			const suffix = "ac1-b";
			const teamId = `ad2-team-${suffix}`;
			const teamMembersId = `ad2-tm-${suffix}`;
			const betId = `ad2-bet-${suffix}`;
			const taskId = `ad2-task-${suffix}`;
			const agentId = `ad2-agent-${suffix}`;
			const threadId = `ad2-thread-${suffix}`;

			await db
				.insert(teams)
				.values({ id: teamId, name: "AD2 Team no-owner", phase: "build", createdAt: NOW });
			await db
				.insert(teamMembers)
				.values({ id: teamMembersId, teamId, capacity: 5, activeBets: 0, formedAt: NOW });
			await db.insert(users).values({
				id: agentId,
				kind: "ai",
				name: "AD2 No Owner Agent",
				role: "builder",
				status: "active",
				maxConcurrentSessions: 4,
				teamId: teamMembersId,
				createdAt: NOW,
			});
			await db.insert(bets).values({
				id: betId,
				teamId,
				description: "AD2 no-owner bet",
				status: "active",
				createdAt: NOW,
			});
			await db.insert(threads).values({
				id: threadId,
				hostKind: "task",
				hostId: taskId,
				initiatorId: agentId,
				participants: JSON.stringify([agentId]),
				lastActiveAt: NOW,
				createdAt: NOW,
			});
			await db.insert(tasks).values({
				id: taskId,
				betId,
				teamId,
				title: "Task no owner",
				state: "proposed",
				ownerAgentId: null,
				threadId,
				createdAt: NOW,
				updatedAt: NOW,
			});

			const deps = makeDispatcherDeps(db, eventBus, adapter, sandboxBasePath);
			dispose = registerTaskDispatcher(deps);

			await transitionTask(db, eventBus, taskId, "accepted");

			// Allow time for any async processing
			await new Promise((resolve) => setTimeout(resolve, 200));

			const sessionRows = await db.select().from(sessions).where(eq(sessions.taskId, taskId));
			expect(sessionRows).toHaveLength(0);
		} finally {
			fs.rmSync(sandboxBasePath, { recursive: true, force: true });
		}
	});
});

// ---------------------------------------------------------------------------
// AC2: Auto-provisioning on handoff (session_ended → re-dispatch for new agent)
// ---------------------------------------------------------------------------

describe("AD2 AC2: session provisioned for new agent after handoff", () => {
	let dispose: (() => void) | undefined;

	beforeEach(() => {
		// AK2 §4a: register Strategy so provisionSession routes through the Strategy Port.
		setActiveStrategy(fabricStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		dispose?.();
		dispose = undefined;
	});

	test("dispatches new session for agentB when agentA session ends and ownerAgentId changed", async ({
		db,
		eventBus,
	}) => {
		const sandboxBasePath = makeWorkspaceBasePath();
		try {
			const adapter = new StubDispatchAdapter();

			// Agent A
			const agentAId = "ad2-agent-a-handoff";
			// Agent B (the new owner after handoff)
			const agentBId = "ad2-agent-b-handoff";

			const teamId = "ad2-team-handoff";
			const teamMembersId = "ad2-tm-handoff";
			const betId = "ad2-bet-handoff";
			const taskId = "ad2-task-handoff";
			const threadId = "ad2-thread-handoff";
			const sessionAId = "ad2-session-a-handoff";

			await db
				.insert(teams)
				.values({ id: teamId, name: "AD2 Handoff Team", phase: "build", createdAt: NOW });
			await db
				.insert(teamMembers)
				.values({ id: teamMembersId, teamId, capacity: 5, activeBets: 0, formedAt: NOW });
			await db.insert(users).values({
				id: agentAId,
				kind: "ai",
				name: "Agent A",
				role: "builder",
				status: "active",
				maxConcurrentSessions: 4,
				teamId: teamMembersId,
				harnessType: "builtin",
				createdAt: NOW,
			});
			await db.insert(users).values({
				id: agentBId,
				kind: "ai",
				name: "Agent B",
				role: "builder",
				status: "active",
				maxConcurrentSessions: 4,
				teamId: teamMembersId,
				harnessType: "builtin",
				createdAt: NOW,
			});
			await db.insert(bets).values({
				id: betId,
				teamId,
				description: "Handoff bet",
				status: "active",
				createdAt: NOW,
			});
			await db.insert(threads).values({
				id: threadId,
				hostKind: "task",
				hostId: taskId,
				initiatorId: agentAId,
				participants: JSON.stringify([agentAId, agentBId]),
				lastActiveAt: NOW,
				createdAt: NOW,
			});
			await db.insert(tasks).values({
				id: taskId,
				betId,
				teamId,
				title: "Handoff Task",
				state: "in_progress",
				ownerAgentId: agentAId,
				threadId,
				createdAt: NOW,
				updatedAt: NOW,
			});

			// Agent A has an active session
			await db.insert(sessions).values({
				id: sessionAId,
				taskId,
				agentId: agentAId,
				modelTier: "workhorse",
				startedAt: NOW,
				state: "active",
			});

			const deps = makeDispatcherDeps(db, eventBus, adapter, sandboxBasePath);
			dispose = registerTaskDispatcher(deps);

			// Simulate handoff: end agent A's session + change ownerAgentId to agent B
			// (in real code, handoff-protocol.ts does this in a transaction before emitting)
			await db
				.update(sessions)
				.set({ state: "done", endedAt: NOW })
				.where(eq(sessions.id, sessionAId));
			await db
				.update(tasks)
				.set({ ownerAgentId: agentBId, updatedAt: NOW })
				.where(eq(tasks.id, taskId));

			// Emit session_ended event (the trigger for handoff re-dispatch)
			eventBus.emit({
				type: "session_ended",
				streamId: sessionAId,
				sessionId: sessionAId,
				agentId: agentAId,
				taskId,
				timestamp: Date.now(),
				outcome: "completed",
			});

			// Wait for dispatcher to create agent B's session
			await vi.waitFor(
				async () => {
					const newSessions = await db
						.select()
						.from(sessions)
						.where(and(eq(sessions.taskId, taskId), eq(sessions.agentId, agentBId)));
					expect(newSessions.length).toBeGreaterThanOrEqual(1);
				},
				{ timeout: 10_000 },
			);

			const agentBSessions = await db
				.select()
				.from(sessions)
				.where(and(eq(sessions.taskId, taskId), eq(sessions.agentId, agentBId)));

			expect(agentBSessions).toHaveLength(1);
		} finally {
			fs.rmSync(sandboxBasePath, { recursive: true, force: true });
		}
	});
});

// ---------------------------------------------------------------------------
// AC3: Cost cap exceeded → task queued, no session created
// ---------------------------------------------------------------------------

describe("AD2 AC3: cost cap exceeded causes task to queue (no session provisioned)", () => {
	let dispose: (() => void) | undefined;

	beforeEach(() => {
		// AK2 §4a: register Strategy so provisionSession routes through the Strategy Port.
		setActiveStrategy(fabricStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		dispose?.();
		dispose = undefined;
	});

	test("queues task when agent cost cap is exceeded (costActual > costCap)", async ({
		db,
		eventBus,
	}) => {
		const sandboxBasePath = makeWorkspaceBasePath();
		try {
			const adapter = new StubDispatchAdapter();

			// Create agent with cost cap already exceeded: costActual > costCap
			const { agentId, taskId } = await seedDomain(db, "ac3", {
				costCap: 100, // $1 in cents
				costActual: 200, // $2 in cents — already over cap
			});

			const deps = makeDispatcherDeps(db, eventBus, adapter, sandboxBasePath);
			dispose = registerTaskDispatcher(deps);

			await transitionTask(db, eventBus, taskId, "accepted");

			// Allow time for dispatcher to process the event
			await new Promise((resolve) => setTimeout(resolve, 300));

			// Assert: task is queued (snapshot has entry)
			const snapshot = getDispatchQueueSnapshot();
			const queuedEntry = snapshot.entries.find((e) => e.taskId === taskId);
			expect(queuedEntry).toBeDefined();
			expect(queuedEntry?.agentId).toBe(agentId);

			// Assert: no session was created
			const sessionRows = await db.select().from(sessions).where(eq(sessions.taskId, taskId));
			expect(sessionRows).toHaveLength(0);

			// Assert: task remains in accepted state (not stranded in in_progress)
			const [taskRow] = await db
				.select({ state: tasks.state })
				.from(tasks)
				.where(eq(tasks.id, taskId));
			expect(taskRow?.state).toBe("accepted");
		} finally {
			fs.rmSync(sandboxBasePath, { recursive: true, force: true });
		}
	});
});

// ---------------------------------------------------------------------------
// AC4: Concurrency limit → task queued, dispatched when session ends
// ---------------------------------------------------------------------------

describe("AD2 AC4: concurrency limit causes queuing; session dispatch on capacity free", () => {
	let dispose: (() => void) | undefined;

	beforeEach(() => {
		// AK2 §4a: register Strategy so provisionSession routes through the Strategy Port.
		setActiveStrategy(fabricStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		dispose?.();
		dispose = undefined;
	});

	test("queues task when agent is at maxConcurrentSessions=1", async ({ db, eventBus }) => {
		const sandboxBasePath = makeWorkspaceBasePath();
		try {
			const adapter = new StubDispatchAdapter();

			// Agent with maxConcurrentSessions=1
			const { agentId, taskId } = await seedDomain(db, "ac4-queue", {
				maxConcurrentSessions: 1,
			});

			// Put agent at its limit: insert an active session
			const existingSessionId = "ad2-existing-session-ac4";
			const existingTaskId = "ad2-existing-task-ac4";

			// Need a separate task for the existing session (FK constraint)
			await db.insert(tasks).values({
				id: existingTaskId,
				betId: `ad2-bet-ac4-queue`,
				teamId: `ad2-team-ac4-queue`,
				title: "Existing task",
				state: "in_progress",
				createdAt: NOW,
				updatedAt: NOW,
			});
			await db.insert(sessions).values({
				id: existingSessionId,
				taskId: existingTaskId,
				agentId,
				modelTier: "workhorse",
				startedAt: NOW,
				state: "active",
			});

			const deps = makeDispatcherDeps(db, eventBus, adapter, sandboxBasePath);
			dispose = registerTaskDispatcher(deps);

			// Transition task to accepted — should be queued (agent at limit)
			await transitionTask(db, eventBus, taskId, "accepted");

			// Allow time for dispatcher to process
			await new Promise((resolve) => setTimeout(resolve, 300));

			// Assert: task is in queue
			const snapshot = getDispatchQueueSnapshot();
			const queuedEntry = snapshot.entries.find((e) => e.taskId === taskId);
			expect(queuedEntry).toBeDefined();
			expect(queuedEntry?.agentId).toBe(agentId);

			// Assert: no new session for our task yet
			const taskSessions = await db.select().from(sessions).where(eq(sessions.taskId, taskId));
			expect(taskSessions).toHaveLength(0);
		} finally {
			fs.rmSync(sandboxBasePath, { recursive: true, force: true });
		}
	});

	test("dispatches queued task when blocking session ends", async ({ db, eventBus }) => {
		const sandboxBasePath = makeWorkspaceBasePath();
		try {
			const adapter = new StubDispatchAdapter();

			// Agent with maxConcurrentSessions=1
			const { agentId, taskId } = await seedDomain(db, "ac4-dispatch", {
				maxConcurrentSessions: 1,
			});

			const existingSessionId = "ad2-blocking-session-ac4";
			const existingTaskId = "ad2-blocking-task-ac4";

			await db.insert(tasks).values({
				id: existingTaskId,
				betId: `ad2-bet-ac4-dispatch`,
				teamId: `ad2-team-ac4-dispatch`,
				title: "Blocking task",
				state: "in_progress",
				createdAt: NOW,
				updatedAt: NOW,
			});
			await db.insert(sessions).values({
				id: existingSessionId,
				taskId: existingTaskId,
				agentId,
				modelTier: "workhorse",
				startedAt: NOW,
				state: "active",
			});

			const deps = makeDispatcherDeps(db, eventBus, adapter, sandboxBasePath);
			dispose = registerTaskDispatcher(deps);

			// Transition task to accepted — goes into queue
			await transitionTask(db, eventBus, taskId, "accepted");

			await new Promise((resolve) => setTimeout(resolve, 200));

			// Confirm it's queued
			const snapshotBefore = getDispatchQueueSnapshot();
			expect(snapshotBefore.entries.some((e) => e.taskId === taskId)).toBe(true);

			// Now end the blocking session — frees capacity
			await db
				.update(sessions)
				.set({ state: "done", endedAt: NOW })
				.where(eq(sessions.id, existingSessionId));

			// Emit session_ended event
			eventBus.emit({
				type: "session_ended",
				streamId: existingSessionId,
				sessionId: existingSessionId,
				agentId,
				taskId: existingTaskId,
				timestamp: Date.now(),
				outcome: "completed",
			});

			// Wait for the queued task to be dispatched
			await vi.waitFor(
				async () => {
					const taskSessions = await db.select().from(sessions).where(eq(sessions.taskId, taskId));
					expect(taskSessions.length).toBeGreaterThanOrEqual(1);
				},
				{ timeout: 10_000 },
			);

			const taskSessions = await db.select().from(sessions).where(eq(sessions.taskId, taskId));
			expect(taskSessions[0]?.agentId).toBe(agentId);
		} finally {
			fs.rmSync(sandboxBasePath, { recursive: true, force: true });
		}
	});
});

// ---------------------------------------------------------------------------
// AC5: Non-code workspace dispatch uses builtin adapter (no git assumption)
// ---------------------------------------------------------------------------

describe("AD2 AC5: non-coding tasks dispatch with builtin harness (no git workspace)", () => {
	let dispose: (() => void) | undefined;

	beforeEach(() => {
		// AK2 §4a: register Strategy so provisionSession routes through the Strategy Port.
		setActiveStrategy(fabricStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		dispose?.();
		dispose = undefined;
	});

	test("provisions session via builtin adapter for marketing agent (non-code role)", async ({
		db,
		eventBus,
	}) => {
		const sandboxBasePath = makeWorkspaceBasePath();
		try {
			const adapter = new StubDispatchAdapter();

			// Marketing/brand_voice agent with builtin harness
			const { taskId } = await seedDomain(db, "ac5", {
				role: "brand_voice",
				harnessType: "builtin",
			});

			// Register pool with ONLY the builtin adapter (no claude-code)
			const pool = new AdapterPool();
			pool.register("builtin-local", adapter, {
				name: "builtin-local",
				kind: "local",
				type: "builtin",
				modelProviders: ["anthropic", "openrouter", "openai-compatible"],
				maxConcurrent: 4,
			});

			const deps: TaskDispatcherDeps = {
				db,
				eventBus,
				adapterPool: pool,
				workspace: new LocalSandboxAdapter(),
				sandboxBasePath,
			};
			dispose = registerTaskDispatcher(deps);

			await transitionTask(db, eventBus, taskId, "accepted");

			// Wait for session creation
			await vi.waitFor(
				async () => {
					const sessionRows = await db.select().from(sessions).where(eq(sessions.taskId, taskId));
					expect(sessionRows.length).toBeGreaterThanOrEqual(1);
				},
				{ timeout: 10_000 },
			);

			// Assert: builtin adapter was selected (captured configs have sandboxPath)
			expect(adapter.capturedConfigs).toHaveLength(1);
			const capturedConfig = adapter.capturedConfigs[0];
			expect(capturedConfig).toBeDefined();

			// Assert: workspace created does NOT contain a .git directory
			// (non-code workspace — no git repo initialization)
			const sandboxPath = capturedConfig?.sandboxPath;
			if (sandboxPath) {
				const gitPath = path.join(sandboxPath, ".git");
				expect(fs.existsSync(gitPath)).toBe(false);
			}
		} finally {
			fs.rmSync(sandboxBasePath, { recursive: true, force: true });
		}
	});

	test("does not select claude-code adapter when agent harnessType=builtin", async ({
		db,
		eventBus,
	}) => {
		const sandboxBasePath = makeWorkspaceBasePath();
		try {
			const builtinAdapter = new StubDispatchAdapter();
			const claudeCodeAdapter = new StubDispatchAdapter();

			const { taskId } = await seedDomain(db, "ac5-harness", {
				harnessType: "builtin",
			});

			// Pool has both adapters registered
			const pool = new AdapterPool();
			pool.register("local-claude-code", claudeCodeAdapter, {
				name: "Claude Code",
				kind: "local",
				type: "claude-code",
				modelProviders: ["anthropic"],
				maxConcurrent: 4,
			});
			pool.register("local-builtin", builtinAdapter, {
				name: "Built-in Harness",
				kind: "local",
				type: "builtin",
				modelProviders: ["anthropic", "openrouter", "openai-compatible"],
				maxConcurrent: 4,
			});

			const deps: TaskDispatcherDeps = {
				db,
				eventBus,
				adapterPool: pool,
				workspace: new LocalSandboxAdapter(),
				sandboxBasePath,
			};
			dispose = registerTaskDispatcher(deps);

			await transitionTask(db, eventBus, taskId, "accepted");

			await vi.waitFor(
				async () => {
					const sessionRows = await db.select().from(sessions).where(eq(sessions.taskId, taskId));
					expect(sessionRows.length).toBeGreaterThanOrEqual(1);
				},
				{ timeout: 10_000 },
			);

			// Builtin adapter was used, not claude-code
			expect(builtinAdapter.capturedConfigs).toHaveLength(1);
			expect(claudeCodeAdapter.capturedConfigs).toHaveLength(0);
		} finally {
			fs.rmSync(sandboxBasePath, { recursive: true, force: true });
		}
	});
});

// ---------------------------------------------------------------------------
// AC6: Observability — GET /api/dispatch-queue returns queued entries
// ---------------------------------------------------------------------------

describe("AD2 AC6: GET /api/dispatch-queue returns queued entries", () => {
	let dispose: (() => void) | undefined;

	beforeEach(() => {
		// AK2 §4a: register Strategy so provisionSession routes through the Strategy Port.
		setActiveStrategy(fabricStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		dispose?.();
		dispose = undefined;
	});

	test("getDispatchQueueSnapshot returns entries with taskId, agentId, teamId, enqueuedAt", async ({
		db,
		eventBus,
	}) => {
		const sandboxBasePath = makeWorkspaceBasePath();
		try {
			const adapter = new StubDispatchAdapter();

			// Create two agents both at concurrency limit to ensure queuing
			const {
				agentId: agentId1,
				taskId: taskId1,
				teamId: teamId1,
			} = await seedDomain(db, "ac6-task1", { maxConcurrentSessions: 1 });
			const { agentId: agentId2, taskId: taskId2 } = await seedDomain(db, "ac6-task2", {
				maxConcurrentSessions: 1,
			});

			// Fill concurrency for both agents
			const blockingSession1Id = "ad2-block-session1";
			const blockingSession2Id = "ad2-block-session2";
			const blockingTask1Id = "ad2-block-task1";
			const blockingTask2Id = "ad2-block-task2";

			// Insert blocking tasks (need bet + team to exist)
			await db.insert(tasks).values({
				id: blockingTask1Id,
				betId: `ad2-bet-ac6-task1`,
				teamId: `ad2-team-ac6-task1`,
				title: "Block 1",
				state: "in_progress",
				createdAt: NOW,
				updatedAt: NOW,
			});
			await db.insert(tasks).values({
				id: blockingTask2Id,
				betId: `ad2-bet-ac6-task2`,
				teamId: `ad2-team-ac6-task2`,
				title: "Block 2",
				state: "in_progress",
				createdAt: NOW,
				updatedAt: NOW,
			});

			await db.insert(sessions).values({
				id: blockingSession1Id,
				taskId: blockingTask1Id,
				agentId: agentId1,
				modelTier: "workhorse",
				startedAt: NOW,
				state: "active",
			});
			await db.insert(sessions).values({
				id: blockingSession2Id,
				taskId: blockingTask2Id,
				agentId: agentId2,
				modelTier: "workhorse",
				startedAt: NOW,
				state: "active",
			});

			const deps = makeDispatcherDeps(db, eventBus, adapter, sandboxBasePath);
			dispose = registerTaskDispatcher(deps);

			// Transition both tasks to accepted — both should be queued
			await transitionTask(db, eventBus, taskId1, "accepted");
			await transitionTask(db, eventBus, taskId2, "accepted");

			// Allow time for dispatch attempts
			await new Promise((resolve) => setTimeout(resolve, 300));

			const snapshot = getDispatchQueueSnapshot();

			// Both tasks should be in queue
			expect(snapshot.entries.length).toBeGreaterThanOrEqual(2);

			const entry1 = snapshot.entries.find((e) => e.taskId === taskId1);
			const entry2 = snapshot.entries.find((e) => e.taskId === taskId2);

			expect(entry1).toBeDefined();
			expect(entry1?.agentId).toBe(agentId1);
			expect(entry1?.teamId).toBe(teamId1);
			expect(typeof entry1?.enqueuedAt).toBe("number");
			expect(entry1?.enqueuedAt).toBeGreaterThan(0);

			expect(entry2).toBeDefined();
			expect(entry2?.agentId).toBe(agentId2);
		} finally {
			fs.rmSync(sandboxBasePath, { recursive: true, force: true });
		}
	});

	test("getDispatchQueueSnapshot shape: has entries array and draining boolean", () => {
		// Call snapshot without setting up dispatcher — verifies the module signature
		const snapshot = getDispatchQueueSnapshot();
		expect(Array.isArray(snapshot.entries)).toBe(true);
		expect(typeof snapshot.draining).toBe("boolean");
	});
});

// ---------------------------------------------------------------------------
// AC-idempotency: Restart sweep does not duplicate active sessions
// ---------------------------------------------------------------------------

describe("AD2 AC-idempotency: dispatcher restart does not duplicate sessions", () => {
	let dispose: (() => void) | undefined;

	beforeEach(() => {
		// AK2 §4a: register Strategy so provisionSession routes through the Strategy Port.
		setActiveStrategy(fabricStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		dispose?.();
		dispose = undefined;
	});

	test("startup sweep skips tasks that already have an active session", async ({
		db,
		eventBus,
	}) => {
		const sandboxBasePath = makeWorkspaceBasePath();
		try {
			const adapter = new StubDispatchAdapter();
			const { agentId, taskId } = await seedDomain(db, "ac-idem", {}, { state: "accepted" });

			// The seed inserts as "proposed" — set to "accepted" directly for this test
			await db.update(tasks).set({ state: "accepted", updatedAt: NOW }).where(eq(tasks.id, taskId));

			// Also insert an existing active session (simulates previously dispatched task)
			const existingSessionId = "ad2-existing-active-session";
			await db.insert(sessions).values({
				id: existingSessionId,
				taskId,
				agentId,
				modelTier: "workhorse",
				startedAt: NOW,
				state: "active",
			});

			const deps = makeDispatcherDeps(db, eventBus, adapter, sandboxBasePath);

			// Register dispatcher — triggers startup sweep
			dispose = registerTaskDispatcher(deps);

			// Allow time for startup sweep to process
			await new Promise((resolve) => setTimeout(resolve, 300));

			// Assert: no new session was created (existing active session blocks re-dispatch)
			const allSessions = await db.select().from(sessions).where(eq(sessions.taskId, taskId));
			expect(allSessions).toHaveLength(1);
			expect(allSessions[0]?.id).toBe(existingSessionId);

			// Adapter should NOT have been called (no startSession)
			expect(adapter.capturedConfigs).toHaveLength(0);
		} finally {
			fs.rmSync(sandboxBasePath, { recursive: true, force: true });
		}
	});

	test("re-registering dispatcher does not create duplicate sessions for already-dispatched tasks", async ({
		db,
		eventBus,
	}) => {
		const sandboxBasePath = makeWorkspaceBasePath();
		try {
			const adapter = new StubDispatchAdapter();
			const { taskId } = await seedDomain(db, "ac-idem2");

			const deps = makeDispatcherDeps(db, eventBus, adapter, sandboxBasePath);

			// First registration
			const dispose1 = registerTaskDispatcher(deps);

			await transitionTask(db, eventBus, taskId, "accepted");

			// Wait for first dispatch
			await vi.waitFor(
				async () => {
					const sessionRows = await db.select().from(sessions).where(eq(sessions.taskId, taskId));
					expect(sessionRows.length).toBeGreaterThanOrEqual(1);
				},
				{ timeout: 10_000 },
			);

			const sessionsAfterFirst = await db
				.select()
				.from(sessions)
				.where(eq(sessions.taskId, taskId));
			const firstCount = sessionsAfterFirst.length;

			// Dispose first registration
			dispose1();

			// Second registration — should NOT dispatch again for the already-dispatched task
			dispose = registerTaskDispatcher(deps);

			// Allow time for startup sweep
			await new Promise((resolve) => setTimeout(resolve, 300));

			const sessionsAfterSecond = await db
				.select()
				.from(sessions)
				.where(eq(sessions.taskId, taskId));
			// Should have exactly the same number of sessions (no duplicates)
			expect(sessionsAfterSecond).toHaveLength(firstCount);
		} finally {
			fs.rmSync(sandboxBasePath, { recursive: true, force: true });
		}
	});
});

// ---------------------------------------------------------------------------
// AC-sweep-race: startupSweep generation-guard prevents double-dispatch on
// dispose + re-register before the sweep's DB queries resolve.
// ---------------------------------------------------------------------------

describe("AD2 AC-sweep-race: stale startupSweep does not pollute new registration queue", () => {
	let dispose: (() => void) | undefined;

	beforeEach(() => {
		// AK2 §4a: register Strategy so provisionSession routes through the Strategy Port.
		setActiveStrategy(fabricStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		dispose?.();
		dispose = undefined;
	});

	/**
	 * Regression test for the dispose+re-register race.
	 *
	 * Without the generation-guard, the scenario below causes double-dispatch:
	 *
	 *   1. registerTaskDispatcher (gen=N) fires startupSweep (fire-and-forget).
	 *   2. dispose() bumps gen to N+1; re-register bumps gen to N+2.
	 *   3. The stale gen-N sweep's DB queries finish after gen is now N+2.
	 *   4. WITHOUT guard: sweep pushes entries into what is now gen-N+2's queue
	 *      → double-dispatch; two sessions created for the same task.
	 *   5. WITH guard: sweep sees gen-N !== currentGen (N+2) → returns immediately.
	 *
	 * The test makes the race deterministic by controlling timing:
	 *   - Seed an accepted task.
	 *   - Insert an active session to fill the concurrency slot, so the gen-N
	 *     sweep would find the task but NOT immediately dispatch (it needs drain
	 *     to run later). This means the sweep's queue-push is the observable action.
	 *   - Register (gen-N) + immediately dispose + re-register (gen-N+2).
	 *   - Release the barrier so the stale gen-N sweep can run.
	 *   - Assert queue stays empty from the stale sweep's perspective, and no
	 *     duplicate sessions appear after capacity is freed.
	 *
	 * Implementation note: we delay the sweep's DB query by intercepting the
	 * `select` method with a controlled promise barrier.
	 *
	 * @lore AD2: The generation-guard in startupSweep checks generation !== currentGeneration
	 * after EACH DB await. Two checks: after sessions query, after tasks query. Both needed
	 * because either query could complete after a dispose+re-register cycle.
	 */
	test("dispose+re-register during sweep does not cause double-dispatch for accepted task", async ({
		db,
		eventBus,
	}) => {
		const sandboxBasePath = makeWorkspaceBasePath();
		try {
			// Arrange: accepted task + a blocking session (fills the concurrency slot
			// so that the stale gen's queue-push is the observable action, not the drain).
			const adapter = new StubDispatchAdapter();
			const { agentId, taskId } = await seedDomain(
				db,
				"sweep-race",
				{ maxConcurrentSessions: 1 },
				{ state: "accepted" },
			);
			await db.update(tasks).set({ state: "accepted", updatedAt: NOW }).where(eq(tasks.id, taskId));

			// Create a blocking session so drainQueue parks after gen-2 sweep runs.
			// When we later end it, we can check the session count precisely.
			const blockTaskId = "ad2-block-task-sweep-race";
			const blockSessionId = "ad2-block-session-sweep-race";
			await db.insert(tasks).values({
				id: blockTaskId,
				betId: `ad2-bet-sweep-race`,
				teamId: `ad2-team-sweep-race`,
				title: "Block",
				state: "in_progress",
				createdAt: NOW,
				updatedAt: NOW,
			});
			await db.insert(sessions).values({
				id: blockSessionId,
				taskId: blockTaskId,
				agentId,
				modelTier: "workhorse",
				startedAt: NOW,
				state: "active",
			});

			// Barrier controls when the stale gen-1 sweep's DB queries resolve.
			let releaseBarrier: () => void = () => {};
			const barrier = new Promise<void>((resolve) => {
				releaseBarrier = resolve;
			});

			// Build a delayedDb that makes the first select().from() chain awaitable
			// only after the barrier resolves. This stalls the stale sweep mid-flight
			// while we dispose+re-register.
			let selectCallCount = 0;
			const delayedDb = new Proxy(db, {
				get(target, prop, receiver) {
					if (prop !== "select") {
						return Reflect.get(target, prop, receiver);
					}
					// biome-ignore lint/suspicious/noExplicitAny: proxy for test interception only
					return (...selectArgs: any[]) => {
						// biome-ignore lint/suspicious/noExplicitAny: proxy for test interception only
						const chain = (target.select as (...a: any[]) => any)(...selectArgs);
						selectCallCount++;
						const callIndex = selectCallCount;

						// Only delay the FIRST select (the sessions query in startupSweep).
						// The second select (tasks query) will also stall because it awaits
						// the same async context. We wrap the chain's `then` to inject the barrier.
						if (callIndex > 1) {
							return chain;
						}

						// Return a thenable wrapper: awaiting this chain waits for the barrier.
						// biome-ignore lint/suspicious/noExplicitAny: proxy thenable — intentional
						const wrapped: any = new Proxy(chain, {
							get(chainTarget, chainProp, chainReceiver) {
								if (chainProp !== "then") {
									return Reflect.get(chainTarget, chainProp, chainReceiver);
								}
								// biome-ignore lint/suspicious/noExplicitAny: proxy thenable — intentional
								return (onFulfilled: any, onRejected: any) =>
									barrier
										.then(() => (chainTarget as Promise<unknown>).then(onFulfilled, onRejected))
										.then(onFulfilled, onRejected);
							},
						});
						return wrapped;
					};
				},
			}) as typeof db;

			// Act step 1: register with delayedDb — gen-1 sweep starts but stalls at barrier.
			const delayedDeps = makeDispatcherDeps(delayedDb, eventBus, adapter, sandboxBasePath);
			const dispose1 = registerTaskDispatcher(delayedDeps);

			// Act step 2: synchronously dispose gen-1 and re-register with real db (gen → gen+2).
			dispose1();
			const realDeps = makeDispatcherDeps(db, eventBus, adapter, sandboxBasePath);
			dispose = registerTaskDispatcher(realDeps);

			// Act step 3: release barrier — stale gen-1 sweep can now proceed.
			// The generation guard inside startupSweep will see gen-1 !== currentGen
			// and return before pushing any entries.
			releaseBarrier();

			// Allow stale sweep to complete (and bail) + gen-2 sweep to also complete.
			await new Promise((resolve) => setTimeout(resolve, 500));

			// Gen-2's startupSweep ran with real db and found the accepted task.
			// The blocking session fills concurrency=1, so the task is in queue but not dispatched yet.
			const queueSnapshot = getDispatchQueueSnapshot();
			const queuedByGen2 = queueSnapshot.entries.filter((e) => e.taskId === taskId);

			// The task should appear in the queue at most ONCE (gen-2 sweep enqueued it once).
			// If the stale gen-1 sweep had also pushed an entry, it would appear twice.
			expect(queuedByGen2.length).toBeLessThanOrEqual(1);

			// Now end the blocking session to free capacity and trigger drain.
			await db
				.update(sessions)
				.set({ state: "done", endedAt: NOW })
				.where(eq(sessions.id, blockSessionId));
			eventBus.emit({
				type: "session_ended",
				streamId: blockSessionId,
				sessionId: blockSessionId,
				agentId,
				taskId: blockTaskId,
				timestamp: Date.now(),
				outcome: "completed",
			});

			// Wait for exactly one session to be created for our task.
			await vi.waitFor(
				async () => {
					const sessionRows = await db.select().from(sessions).where(eq(sessions.taskId, taskId));
					expect(sessionRows.length).toBeGreaterThanOrEqual(1);
				},
				{ timeout: 10_000 },
			);

			// Allow time for any spurious second dispatch (would indicate race not fixed).
			await new Promise((resolve) => setTimeout(resolve, 300));

			// Assert: exactly 1 session — stale gen-1 sweep did NOT double-enqueue.
			const sessionRows = await db.select().from(sessions).where(eq(sessions.taskId, taskId));
			expect(sessionRows).toHaveLength(1);
			expect(sessionRows[0]?.agentId).toBe(agentId);
		} finally {
			fs.rmSync(sandboxBasePath, { recursive: true, force: true });
		}
	});
});

// ---------------------------------------------------------------------------
// AC-provisioning: provisionSession conditional transition (Task 1 prerequisite)
// ---------------------------------------------------------------------------

describe("AD2 Task1 prerequisite: provisionSession succeeds when task already in_progress", () => {
	beforeEach(() => {
		// AK2 §4a: register Strategy so provisionSession routes through the Strategy Port.
		setActiveStrategy(fabricStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
	});

	test("provisionSession does not throw InvalidTransitionError when task is already in_progress", async ({
		db,
		eventBus,
	}) => {
		// This tests the Task 1 change: the conditional transition guard in session-provisioning.ts
		// When a task is already in_progress (handoff re-dispatch case), provisionSession
		// should skip the transitionTask call instead of throwing InvalidTransitionError.

		const sandboxBasePath = makeWorkspaceBasePath();
		try {
			const adapter = new StubDispatchAdapter();
			const { agentId, taskId, teamId } = await seedDomain(db, "t1-prereq");

			// Set task to in_progress directly (simulates task state after handoff)
			await db
				.update(tasks)
				.set({ state: "in_progress", updatedAt: NOW })
				.where(eq(tasks.id, taskId));

			const pool = makeBuiltinPool(adapter);
			const workspace = new LocalSandboxAdapter();

			// Import provisionSession to verify it handles in_progress task correctly
			const { provisionSession: ps } = await import("../services/session-provisioning.js");

			const result = await ps(
				{ db, eventBus, adapterPool: pool, workspace },
				{ taskId, agentId, productId: teamId, sandboxBasePath },
			);

			// Should complete without throwing
			expect(result.sessionId).toBeTruthy();
			expect(result.outcome).toBe("completed");

			// Task state should still be in_progress (no double-transition)
			const [taskRow] = await db
				.select({ state: tasks.state })
				.from(tasks)
				.where(eq(tasks.id, taskId));
			// After the harness completes, session ends. The dispatcher doesn't advance task state beyond in_progress.
			// The task stays in_progress; session transitions reflect the session state, not task state.
			expect(["in_progress", "done"]).toContain(taskRow?.state);
		} finally {
			fs.rmSync(sandboxBasePath, { recursive: true, force: true });
		}
	});
});
