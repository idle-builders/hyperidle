/**
 * AD2 — Task-to-Session Dispatcher: integration tests.
 *
 * Covers all acceptance criteria for the task dispatcher service:
 *   AC1  — Auto-provisioning when task accepted with ownerAgentId set
 *   AC2  — Auto-provisioning on handoff (session_ended triggers new session)
 *   AC3  — Cost cap exceeded → task queued, no session created
 *   AC4  — Concurrency limit → task queued, dispatched when session ends
 *   AC5  — Non-code workspace dispatch uses builtin adapter (no git)
 *   AC6  — GET /api/dispatch-queue returns queued entries
 *   AC-idempotency — Restart sweep does not duplicate existing active sessions
 *
 * @lore AD2: Uses vitest fixture pattern — db, eventBus injected per test.
 * dispose() for registerTaskDispatcher is NOT DB setup — it's kept as afterEach.
 * setProvisionSessionFn is wired at module load time to avoid circular imports.
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
	getDispatchQueueSnapshot,
	registerTaskDispatcher,
	setProvisionSessionFn,
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
import { afterEach, describe, expect, vi } from "vitest";
import { AdapterPool } from "../harness/adapter-pool.js";
import { LocalWorkspaceAdapter } from "../harness/local-workspace-adapter.js";
import { provisionSession } from "../services/session-provisioning.js";
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
setProvisionSessionFn(provisionSession);

// ---------------------------------------------------------------------------
// Minimal capturing harness adapter (no real LLM calls)
// ---------------------------------------------------------------------------

class CapturingHarnessAdapter implements HarnessAdapter {
	public readonly capturedConfigs: SessionConfig[] = [];
	public sessionCount = 0;

	async startSession(config: SessionConfig): Promise<SessionHandle> {
		this.capturedConfigs.push(config);
		this.sessionCount++;
		return { sessionId: `ad2-captured-${this.sessionCount}` };
	}

	async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
		// Completes immediately — simulates fast harness
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
	workspaceBasePath: string,
	poolMaxConcurrent = 4,
): TaskDispatcherDeps {
	const adapterPool = makeBuiltinPool(adapter, poolMaxConcurrent);
	const workspace = new LocalWorkspaceAdapter();
	return {
		db,
		eventBus,
		adapterPool,
		workspace,
		workspaceBasePath,
	};
}

// ---------------------------------------------------------------------------
// AC1: Auto-provisioning when task transitions to accepted
// ---------------------------------------------------------------------------

describe("AD2 AC1: session auto-provisioned when task accepted with ownerAgentId", () => {
	let dispose: (() => void) | undefined;

	afterEach(() => {
		dispose?.();
		dispose = undefined;
	});

	test("creates a session row when task transitions proposed → accepted with ownerAgentId set", async ({
		db,
		eventBus,
	}) => {
		const workspaceBasePath = makeWorkspaceBasePath();
		try {
			const adapter = new CapturingHarnessAdapter();
			const { agentId, taskId } = await seedDomain(db, "ac1-a");

			const deps = makeDispatcherDeps(db, eventBus, adapter, workspaceBasePath);
			dispose = registerTaskDispatcher(deps);

			// Transition task: proposed → accepted (the event fires synchronously)
			await transitionTask(db, eventBus, taskId, "accepted");

			// Wait for async dispatch to complete
			await vi.waitFor(
				async () => {
					const sessionRows = await db.select().from(sessions).where(eq(sessions.taskId, taskId));
					expect(sessionRows.length).toBeGreaterThanOrEqual(1);
				},
				{ timeout: 10_000 },
			);

			const sessionRows = await db.select().from(sessions).where(eq(sessions.taskId, taskId));

			expect(sessionRows[0]?.agentId).toBe(agentId);
			// Session was created — it may be active or done (fast harness completes immediately)
			expect(["active", "done"]).toContain(sessionRows[0]?.state);
		} finally {
			fs.rmSync(workspaceBasePath, { recursive: true, force: true });
		}
	});

	test("does NOT provision a session when task accepted but ownerAgentId is null", async ({
		db,
		eventBus,
	}) => {
		const workspaceBasePath = makeWorkspaceBasePath();
		try {
			const adapter = new CapturingHarnessAdapter();

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

			const deps = makeDispatcherDeps(db, eventBus, adapter, workspaceBasePath);
			dispose = registerTaskDispatcher(deps);

			await transitionTask(db, eventBus, taskId, "accepted");

			// Allow time for any async processing
			await new Promise((resolve) => setTimeout(resolve, 200));

			const sessionRows = await db.select().from(sessions).where(eq(sessions.taskId, taskId));
			expect(sessionRows).toHaveLength(0);
		} finally {
			fs.rmSync(workspaceBasePath, { recursive: true, force: true });
		}
	});
});

// ---------------------------------------------------------------------------
// AC2: Auto-provisioning on handoff (session_ended → re-dispatch for new agent)
// ---------------------------------------------------------------------------

describe("AD2 AC2: session provisioned for new agent after handoff", () => {
	let dispose: (() => void) | undefined;

	afterEach(() => {
		dispose?.();
		dispose = undefined;
	});

	test("dispatches new session for agentB when agentA session ends and ownerAgentId changed", async ({
		db,
		eventBus,
	}) => {
		const workspaceBasePath = makeWorkspaceBasePath();
		try {
			const adapter = new CapturingHarnessAdapter();

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

			const deps = makeDispatcherDeps(db, eventBus, adapter, workspaceBasePath);
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
			fs.rmSync(workspaceBasePath, { recursive: true, force: true });
		}
	});
});

// ---------------------------------------------------------------------------
// AC3: Cost cap exceeded → task queued, no session created
// ---------------------------------------------------------------------------

describe("AD2 AC3: cost cap exceeded causes task to queue (no session provisioned)", () => {
	let dispose: (() => void) | undefined;

	afterEach(() => {
		dispose?.();
		dispose = undefined;
	});

	test("queues task when agent cost cap is exceeded (costActual > costCap)", async ({
		db,
		eventBus,
	}) => {
		const workspaceBasePath = makeWorkspaceBasePath();
		try {
			const adapter = new CapturingHarnessAdapter();

			// Create agent with cost cap already exceeded: costActual > costCap
			const { agentId, taskId } = await seedDomain(db, "ac3", {
				costCap: 100, // $1 in cents
				costActual: 200, // $2 in cents — already over cap
			});

			const deps = makeDispatcherDeps(db, eventBus, adapter, workspaceBasePath);
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
			fs.rmSync(workspaceBasePath, { recursive: true, force: true });
		}
	});
});

// ---------------------------------------------------------------------------
// AC4: Concurrency limit → task queued, dispatched when session ends
// ---------------------------------------------------------------------------

describe("AD2 AC4: concurrency limit causes queuing; session dispatch on capacity free", () => {
	let dispose: (() => void) | undefined;

	afterEach(() => {
		dispose?.();
		dispose = undefined;
	});

	test("queues task when agent is at maxConcurrentSessions=1", async ({ db, eventBus }) => {
		const workspaceBasePath = makeWorkspaceBasePath();
		try {
			const adapter = new CapturingHarnessAdapter();

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

			const deps = makeDispatcherDeps(db, eventBus, adapter, workspaceBasePath);
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
			fs.rmSync(workspaceBasePath, { recursive: true, force: true });
		}
	});

	test("dispatches queued task when blocking session ends", async ({ db, eventBus }) => {
		const workspaceBasePath = makeWorkspaceBasePath();
		try {
			const adapter = new CapturingHarnessAdapter();

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

			const deps = makeDispatcherDeps(db, eventBus, adapter, workspaceBasePath);
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
			fs.rmSync(workspaceBasePath, { recursive: true, force: true });
		}
	});
});

// ---------------------------------------------------------------------------
// AC5: Non-code workspace dispatch uses builtin adapter (no git assumption)
// ---------------------------------------------------------------------------

describe("AD2 AC5: non-coding tasks dispatch with builtin harness (no git workspace)", () => {
	let dispose: (() => void) | undefined;

	afterEach(() => {
		dispose?.();
		dispose = undefined;
	});

	test("provisions session via builtin adapter for marketing agent (non-code role)", async ({
		db,
		eventBus,
	}) => {
		const workspaceBasePath = makeWorkspaceBasePath();
		try {
			const adapter = new CapturingHarnessAdapter();

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
				workspace: new LocalWorkspaceAdapter(),
				workspaceBasePath,
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

			// Assert: builtin adapter was selected (captured configs have workspacePath)
			expect(adapter.capturedConfigs).toHaveLength(1);
			const capturedConfig = adapter.capturedConfigs[0];
			expect(capturedConfig).toBeDefined();

			// Assert: workspace created does NOT contain a .git directory
			// (non-code workspace — no git repo initialization)
			const workspacePath = capturedConfig?.workspacePath;
			if (workspacePath) {
				const gitPath = path.join(workspacePath, ".git");
				expect(fs.existsSync(gitPath)).toBe(false);
			}
		} finally {
			fs.rmSync(workspaceBasePath, { recursive: true, force: true });
		}
	});

	test("does not select claude-code adapter when agent harnessType=builtin", async ({
		db,
		eventBus,
	}) => {
		const workspaceBasePath = makeWorkspaceBasePath();
		try {
			const builtinAdapter = new CapturingHarnessAdapter();
			const claudeCodeAdapter = new CapturingHarnessAdapter();

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
				workspace: new LocalWorkspaceAdapter(),
				workspaceBasePath,
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
			fs.rmSync(workspaceBasePath, { recursive: true, force: true });
		}
	});
});

// ---------------------------------------------------------------------------
// AC6: Observability — GET /api/dispatch-queue returns queued entries
// ---------------------------------------------------------------------------

describe("AD2 AC6: GET /api/dispatch-queue returns queued entries", () => {
	let dispose: (() => void) | undefined;

	afterEach(() => {
		dispose?.();
		dispose = undefined;
	});

	test("getDispatchQueueSnapshot returns entries with taskId, agentId, teamId, enqueuedAt", async ({
		db,
		eventBus,
	}) => {
		const workspaceBasePath = makeWorkspaceBasePath();
		try {
			const adapter = new CapturingHarnessAdapter();

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

			const deps = makeDispatcherDeps(db, eventBus, adapter, workspaceBasePath);
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
			fs.rmSync(workspaceBasePath, { recursive: true, force: true });
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

	afterEach(() => {
		dispose?.();
		dispose = undefined;
	});

	test("startup sweep skips tasks that already have an active session", async ({
		db,
		eventBus,
	}) => {
		const workspaceBasePath = makeWorkspaceBasePath();
		try {
			const adapter = new CapturingHarnessAdapter();
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

			const deps = makeDispatcherDeps(db, eventBus, adapter, workspaceBasePath);

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
			fs.rmSync(workspaceBasePath, { recursive: true, force: true });
		}
	});

	test("re-registering dispatcher does not create duplicate sessions for already-dispatched tasks", async ({
		db,
		eventBus,
	}) => {
		const workspaceBasePath = makeWorkspaceBasePath();
		try {
			const adapter = new CapturingHarnessAdapter();
			const { taskId } = await seedDomain(db, "ac-idem2");

			const deps = makeDispatcherDeps(db, eventBus, adapter, workspaceBasePath);

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
			fs.rmSync(workspaceBasePath, { recursive: true, force: true });
		}
	});
});

// ---------------------------------------------------------------------------
// AC-provisioning: provisionSession conditional transition (Task 1 prerequisite)
// ---------------------------------------------------------------------------

describe("AD2 Task1 prerequisite: provisionSession succeeds when task already in_progress", () => {
	test("provisionSession does not throw InvalidTransitionError when task is already in_progress", async ({
		db,
		eventBus,
	}) => {
		// This tests the Task 1 change: the conditional transition guard in session-provisioning.ts
		// When a task is already in_progress (handoff re-dispatch case), provisionSession
		// should skip the transitionTask call instead of throwing InvalidTransitionError.

		const workspaceBasePath = makeWorkspaceBasePath();
		try {
			const adapter = new CapturingHarnessAdapter();
			const { agentId, taskId, teamId } = await seedDomain(db, "t1-prereq");

			// Set task to in_progress directly (simulates task state after handoff)
			await db
				.update(tasks)
				.set({ state: "in_progress", updatedAt: NOW })
				.where(eq(tasks.id, taskId));

			const pool = makeBuiltinPool(adapter);
			const workspace = new LocalWorkspaceAdapter();

			// Import provisionSession to verify it handles in_progress task correctly
			const { provisionSession: ps } = await import("../services/session-provisioning.js");

			const result = await ps(
				{ db, eventBus, adapterPool: pool, workspace },
				{ taskId, agentId, productId: teamId, workspaceBasePath },
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
			fs.rmSync(workspaceBasePath, { recursive: true, force: true });
		}
	});
});
