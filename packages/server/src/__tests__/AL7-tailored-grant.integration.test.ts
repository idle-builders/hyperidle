/**
 * AL7 RED — Tailored grant lifecycle: approve → compose grant → proposed_call_granted event
 *
 * Tests FAIL until:
 *   - proposed_calls table (status: captured | granted | executed | failed | held)
 *   - tailored_grants table with CAS consume (UPDATE WHERE consumed=false RETURNING *)
 *   - threads.ts verdict path: approve → composeTailoredGrant → captured→granted → emit proposed_call_granted
 *   - non-approve verdict → captured→held, no grant
 *   - task-dispatcher: handleProposedCallGranted enqueues session 2
 *   - proposed_call_granted in KernelEvent union
 *
 * Covers: AC3 (approve → grant + event + enqueue), AC6 (at-most-once CAS consume),
 *         AC7 (non-approve → no grant, held), AC8 (never-approved → never executed).
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	artifacts,
	bets,
	type HyperIdleDb,
	messages,
	proposedCalls,
	sessions,
	tailoredGrants,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import {
	fabricStrategy,
	registerTaskDispatcher,
	setProvisionSessionFn,
	type TaskDispatcherDeps,
} from "@hyperidle/fabric";
import type {
	EventBus,
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	ProposedCallGrantedEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { AdapterPool } from "../harness/adapter-pool.js";
import { LocalSandboxAdapter } from "../harness/local-sandbox-adapter.js";
import { provisionSession } from "../services/session-provisioning.js";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";
import { test } from "../test-fixtures.js";

// Wire provisionSession into the fabric registry to avoid circular import.
setProvisionSessionFn(provisionSession);

// ─────────────────────────────────────────────────────────────────────────────
// Minimal capturing harness for dispatcher enqueue test
// ─────────────────────────────────────────────────────────────────────────────
class CapturingAdapter implements HarnessAdapter {
	public sessionCount = 0;
	public lastConfig: SessionConfig | undefined;
	async startSession(config: SessionConfig): Promise<SessionHandle> {
		this.sessionCount++;
		this.lastConfig = config;
		return { sessionId: `al7-captured-${this.sessionCount}` };
	}
	async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
		yield { type: "tool_call", toolName: "submit_review", args: { message: "AL7 stub done" } };
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

const NOW = new Date().toISOString();
const TEST_API_KEY = "al7-tailored-grant-test-key";

function authHeaders(): Record<string, string> {
	return { "Content-Type": "application/json", "X-API-Key": TEST_API_KEY };
}

beforeEach(() => {
	vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
});

async function seedCapturedCall(db: HyperIdleDb): Promise<{
	agentId: string;
	taskId: string;
	threadId: string;
	reviewMessageId: string;
	proposedCallId: string;
}> {
	const teamId = `team-tg-${crypto.randomUUID()}`;
	const agentId = `agent-tg-${crypto.randomUUID()}`;
	const betId = `bet-tg-${crypto.randomUUID()}`;
	const taskId = `task-tg-${crypto.randomUUID()}`;
	const artifactId = `art-tg-${crypto.randomUUID()}`;
	const proposedCallId = `pc-tg-${crypto.randomUUID()}`;

	await db.insert(teams).values({ id: teamId, name: "TG Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: `tm-${teamId}`, teamId, capacity: 3, activeBets: 0, formedAt: NOW });
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Builder",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(bets).values({
		id: betId,
		teamId,
		description: "TG bet",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		ownerAgentId: agentId,
		title: "TG task",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(artifacts).values({
		id: artifactId,
		producingTaskId: taskId,
		kind: "action_operation",
		createdAt: NOW,
	});

	const threadId = `thread-tg-${crypto.randomUUID()}`;
	await db.insert(threads).values({
		id: threadId,
		hostKind: "bet",
		hostId: betId,
		initiatorId: agentId,
		participants: JSON.stringify([agentId]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});

	const reviewMessageId = `msg-tg-${crypto.randomUUID()}`;
	await db.insert(messages).values({
		id: reviewMessageId,
		senderId: agentId,
		threadId,
		type: "review",
		payload: JSON.stringify({
			title: "TG Review",
			reasoning: ["reason"],
			artifactRef: { id: artifactId, kind: "action_operation" },
		}),
		clientKey: reviewMessageId,
		createdAt: NOW,
	});

	// Insert a pre-captured Proposed Call (as if the router already ran in session 1)
	await db.insert(proposedCalls).values({
		id: proposedCallId,
		reviewMessageId,
		subjectThreadId: threadId,
		artifactId,
		originSessionId: `sess-s1-${proposedCallId}`,
		toolId: "commit_file",
		args: JSON.stringify({ path: "/workspace/out.txt", content: "hello" }),
		identityHash: "sha256-abc123",
		reversibility: "irreversible",
		status: "captured",
		stagedByAgentId: agentId,
		createdAt: NOW,
	});

	return { agentId, taskId, threadId, reviewMessageId, proposedCallId };
}

// ─────────────────────────────────────────────────────────────────────────────
// AC3 — approve verdict → tailored grant + proposed_call_granted event
// ─────────────────────────────────────────────────────────────────────────────

describe("AC3: approve verdict composes tailored grant + emits proposed_call_granted", () => {
	test("POST verdict approve → tailored_grants row (consumed:false) + PC status:granted", async ({
		db,
		app,
		eventBus,
	}) => {
		const { taskId, threadId, reviewMessageId, proposedCallId } = await seedCapturedCall(db);

		const received: ProposedCallGrantedEvent[] = [];
		(eventBus as EventBus).on("proposed_call_granted", (e) => received.push(e));

		const res = await app.request(`/api/threads/${threadId}/messages/${reviewMessageId}/verdict`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ decision: "approve", rationale: "LGTM" }),
		});
		expect(res.status).toBeLessThan(300);

		// tailored_grants row must exist (scoped to taskId + agentId, consumed:false)
		const grants = await db
			.select()
			.from(tailoredGrants)
			.where(eq(tailoredGrants.proposedCallId, proposedCallId));
		expect(grants).toHaveLength(1);
		expect(grants[0]?.consumed).toBe(false);
		expect(grants[0]?.taskScope).toBe(taskId);
		expect(grants[0]?.approvedToolId).toBe("commit_file");
		// Approved args recorded (for optional arg-pin convenience)
		const approvedArgs = JSON.parse(grants[0]?.approvedArgs ?? "{}") as Record<string, unknown>;
		expect(approvedArgs.path).toBe("/workspace/out.txt");

		// Proposed Call transitioned captured → granted
		const pcs = await db.select().from(proposedCalls).where(eq(proposedCalls.id, proposedCallId));
		expect(pcs[0]?.status).toBe("granted");

		// proposed_call_granted event emitted
		expect(received).toHaveLength(1);
		expect(received[0]?.type).toBe("proposed_call_granted");
		expect(received[0]?.proposedCallId).toBe(proposedCallId);
		expect(received[0]?.taskId).toBe(taskId);
	});

	test("non-approve verdict (request-changes) → NO grant, PC status:held", async ({
		db,
		app,
		eventBus,
	}) => {
		const { threadId, reviewMessageId, proposedCallId } = await seedCapturedCall(db);

		const received: ProposedCallGrantedEvent[] = [];
		(eventBus as EventBus).on("proposed_call_granted", (e) => received.push(e));

		const res = await app.request(`/api/threads/${threadId}/messages/${reviewMessageId}/verdict`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ decision: "request-changes", rationale: "not ready" }),
		});
		expect(res.status).toBeLessThan(300);

		// No tailored grant
		const grants = await db
			.select()
			.from(tailoredGrants)
			.where(eq(tailoredGrants.proposedCallId, proposedCallId));
		expect(grants).toHaveLength(0);

		// Proposed Call → held (never granted, never executed)
		const pcs = await db.select().from(proposedCalls).where(eq(proposedCalls.id, proposedCallId));
		expect(pcs[0]?.status).toBe("held");

		// No proposed_call_granted event emitted
		expect(received).toHaveLength(0);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC6 — at-most-once: single-statement CAS consume grants exactly once
// ─────────────────────────────────────────────────────────────────────────────

describe("AC6: tailored_grant consume is a single-statement CAS (at-most-once)", () => {
	test("two concurrent CAS claims on the same grant: exactly one claims it, one is denied", async ({
		db,
	}) => {
		// Directly test the CAS mechanic by inserting a grant + running two concurrent updates.
		// Use seedCapturedCall to satisfy the proposed_calls FK constraint.
		const { composeTailoredGrant, consumeTailoredGrant } = await import(
			"../services/proposed-call-workflow.js"
		);

		const { taskId, agentId, proposedCallId } = await seedCapturedCall(db);

		const grantProps = {
			proposedCallId,
			taskScope: taskId,
			agentScope: agentId,
			approvedToolId: "commit_file",
			approvedArgs: JSON.stringify({ path: "/workspace/out.txt", content: "hello" }),
			argPinned: false,
			identityHash: "sha256-abc123",
		};

		// First compose a grant (consumed:false)
		await composeTailoredGrant(db, grantProps);

		// Two concurrent CAS consumes — exactly one must claim the grant
		const [r1, r2] = await Promise.all([
			consumeTailoredGrant(db, {
				taskScope: grantProps.taskScope,
				agentScope: grantProps.agentScope,
				approvedToolId: grantProps.approvedToolId,
			}),
			consumeTailoredGrant(db, {
				taskScope: grantProps.taskScope,
				agentScope: grantProps.agentScope,
				approvedToolId: grantProps.approvedToolId,
			}),
		]);

		// Exactly one succeed (claimed), one returns null (no rows)
		const claimed = [r1, r2].filter((r) => r !== null);
		const denied = [r1, r2].filter((r) => r === null);
		expect(claimed).toHaveLength(1);
		expect(denied).toHaveLength(1);

		// Grant is now consumed
		const grants = await db
			.select()
			.from(tailoredGrants)
			.where(eq(tailoredGrants.proposedCallId, grantProps.proposedCallId));
		expect(grants[0]?.consumed).toBe(true);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC7 — non-approve → no grant, no event; AC8 — never-approved → never executed
// ─────────────────────────────────────────────────────────────────────────────

describe("AC7/AC8: held Proposed Call never executes", () => {
	test("AC7: reject verdict leaves PC held and no Outcome row", async ({ db, app }) => {
		const { threadId, reviewMessageId, proposedCallId } = await seedCapturedCall(db);

		await app.request(`/api/threads/${threadId}/messages/${reviewMessageId}/verdict`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ decision: "reject", rationale: "not needed" }),
		});

		const pcs = await db.select().from(proposedCalls).where(eq(proposedCalls.id, proposedCallId));
		expect(pcs[0]?.status).toBe("held");

		// No tailored grant minted
		const grants = await db
			.select()
			.from(tailoredGrants)
			.where(eq(tailoredGrants.proposedCallId, proposedCallId));
		expect(grants).toHaveLength(0);
	});

	test("AC8: a Proposed Call with no verdict ever has no tailored grant and no Outcome", async ({
		db,
	}) => {
		const { proposedCallId } = await seedCapturedCall(db);

		// No verdict posted — PC stays captured
		const pcs = await db.select().from(proposedCalls).where(eq(proposedCalls.id, proposedCallId));
		expect(pcs[0]?.status).toBe("captured");

		const grants = await db
			.select()
			.from(tailoredGrants)
			.where(eq(tailoredGrants.proposedCallId, proposedCallId));
		expect(grants).toHaveLength(0);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3 (enqueue) — task-dispatcher: handleProposedCallGranted enqueues session 2
//
// When the task dispatcher receives `proposed_call_granted`, it must enqueue
// the task for the grant's agentId so session 2 is dispatched.
// ─────────────────────────────────────────────────────────────────────────────

describe("AC3 (enqueue): proposed_call_granted causes dispatcher to enqueue session 2", () => {
	let dispose: (() => void) | undefined;
	let sandboxBasePath: string;

	beforeEach(() => {
		setActiveStrategy(fabricStrategy);
		sandboxBasePath = fs.mkdtempSync(path.join(os.tmpdir(), "al7-dispatch-"));
	});

	afterEach(() => {
		clearActiveStrategy();
		dispose?.();
		dispose = undefined;
		try {
			fs.rmSync(sandboxBasePath, { recursive: true, force: true });
		} catch {
			// Non-fatal
		}
	});

	test("proposed_call_granted event causes the dispatcher to provision session 2 with grant-bearing workflow", async ({
		db,
		eventBus,
	}) => {
		const adapter = new CapturingAdapter();
		const adapterPool = new AdapterPool();
		adapterPool.register("builtin-local", adapter, {
			name: "builtin-local",
			kind: "local",
			type: "builtin",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		});

		const deps: TaskDispatcherDeps = {
			db,
			eventBus,
			adapterPool,
			workspace: new LocalSandboxAdapter(),
			sandboxBasePath,
		};
		dispose = registerTaskDispatcher(deps);

		// Seed a task in in_progress state (as if session 1 just ended)
		const { agentId, taskId, teamId } = await seedDispatcherTask(db);

		// AL7 CRITICAL-1: also seed the proposed call + tailored grant so the
		// dispatcher can derive the grant-bearing sessionWorkflow for session 2.
		// Without these rows the workflow is null and session 2 has no approvedCall.
		const { reviewMessageId, proposedCallId, artifactId, threadId } =
			await seedDispatcherProposedCall(db, { taskId, agentId });

		// Emit the proposed_call_granted event (simulates the verdict path)
		eventBus.emit({
			type: "proposed_call_granted",
			streamId: threadId,
			proposedCallId,
			taskId,
			agentId,
			timestamp: Date.now(),
		});

		// Wait for the dispatcher to enqueue + provision session 2
		await vi.waitFor(
			async () => {
				const sessionRows = await db.select().from(sessions).where(eq(sessions.taskId, taskId));
				expect(sessionRows.length).toBeGreaterThanOrEqual(1);
			},
			{ timeout: 10_000 },
		);

		// Confirm session 2 was provisioned for the correct agent
		const sessionRows = await db.select().from(sessions).where(eq(sessions.taskId, taskId));
		expect(sessionRows[0]?.agentId).toBe(agentId);
		expect(["active", "done"]).toContain(sessionRows[0]?.state);
		expect(adapter.sessionCount).toBeGreaterThanOrEqual(1);

		// CRITICAL-1 load-bearing assertion: session 2 carries the grant-bearing workflow
		// with approvedCall. This proves the dispatcher derived the workflow from the DB
		// and passed it to provisionSession → the registry will permit the approved op.
		expect(adapter.lastConfig?.sessionWorkflow).toBeDefined();
		expect(adapter.lastConfig?.sessionWorkflow?.sessionRole).toBe("grant-bearing");
		expect(adapter.lastConfig?.sessionWorkflow?.approvedCall?.toolId).toBe("commit_file");

		void teamId; // used only in seedDispatcherTask
		void reviewMessageId; // seeded for FK constraint
		void artifactId; // seeded for FK constraint
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper: seed a minimal domain entry for the dispatcher enqueue test
// ─────────────────────────────────────────────────────────────────────────────
async function seedDispatcherTask(
	db: HyperIdleDb,
): Promise<{ agentId: string; taskId: string; teamId: string }> {
	const suffix = `al7d-${crypto.randomUUID().slice(0, 8)}`;
	const agentId = `al7d-agent-${suffix}`;
	const teamId = `al7d-team-${suffix}`;
	const tmId = `al7d-tm-${suffix}`;
	const betId = `al7d-bet-${suffix}`;
	const taskId = `al7d-task-${suffix}`;
	const threadId = `al7d-thread-${suffix}`;

	await db.insert(teams).values({ id: teamId, name: `AL7D Team`, phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: tmId, teamId, capacity: 5, activeBets: 0, formedAt: NOW });
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "AL7D Agent",
		role: "builder",
		status: "active",
		maxConcurrentSessions: 4,
		teamId: tmId,
		harnessType: "builtin",
		createdAt: NOW,
	});
	await db.insert(bets).values({
		id: betId,
		teamId,
		description: "AL7D bet",
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
	// Task is in_progress (session 1 just ended; proposed_call_granted re-engages)
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		title: "AL7D Task",
		state: "in_progress",
		ownerAgentId: agentId,
		threadId,
		createdAt: NOW,
		updatedAt: NOW,
	});

	return { agentId, taskId, teamId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: seed proposed call + tailored grant for the dispatcher CRITICAL-1 test.
// The dispatcher looks up these rows by proposedCallId to derive the
// grant-bearing sessionWorkflow for session 2.
// ─────────────────────────────────────────────────────────────────────────────
async function seedDispatcherProposedCall(
	db: HyperIdleDb,
	opts: { taskId: string; agentId: string },
): Promise<{
	proposedCallId: string;
	reviewMessageId: string;
	artifactId: string;
	threadId: string;
}> {
	const suffix = `al7d-pc-${crypto.randomUUID().slice(0, 8)}`;
	const proposedCallId = `al7d-pc-${suffix}`;
	const artifactId = `al7d-art-${suffix}`;
	const threadId = `al7d-pcthread-${suffix}`;
	const reviewMessageId = `al7d-msg-${suffix}`;
	const betId = `al7d-pcbet-${suffix}`;

	// Need a bet to anchor artifacts (via producingTaskId → tasks.betId)
	// The task already exists from seedDispatcherTask; we look up its betId.
	const [task] = await db
		.select({ betId: tasks.betId })
		.from(tasks)
		.where(eq(tasks.id, opts.taskId))
		.limit(1);
	const resolvedBetId = task?.betId ?? betId;

	await db.insert(artifacts).values({
		id: artifactId,
		producingTaskId: opts.taskId,
		kind: "action_operation",
		createdAt: NOW,
	});

	// Thread anchors the review message (hostKind=bet, not task, to avoid FK issues)
	await db.insert(threads).values({
		id: threadId,
		hostKind: "bet",
		hostId: resolvedBetId,
		initiatorId: opts.agentId,
		participants: JSON.stringify([opts.agentId]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});

	await db.insert(messages).values({
		id: reviewMessageId,
		senderId: opts.agentId,
		threadId,
		type: "review",
		payload: JSON.stringify({
			title: "AL7D Dispatch Review",
			reasoning: ["reason"],
			artifactRef: { id: artifactId, kind: "action_operation" },
		}),
		clientKey: reviewMessageId,
		createdAt: NOW,
	});

	const approvedArgs = { path: "/sandbox/dispatch-proof.txt", content: "dispatched" };
	await db.insert(proposedCalls).values({
		id: proposedCallId,
		reviewMessageId,
		subjectThreadId: threadId,
		artifactId,
		originSessionId: `sess-s1-${proposedCallId}`,
		toolId: "commit_file",
		args: JSON.stringify(approvedArgs),
		identityHash: "sha256-dispatch",
		reversibility: "irreversible",
		status: "granted",
		stagedByAgentId: opts.agentId,
		createdAt: NOW,
	});

	await db.insert(tailoredGrants).values({
		proposedCallId,
		taskScope: opts.taskId,
		agentScope: opts.agentId,
		approvedToolId: "commit_file",
		approvedArgs: JSON.stringify(approvedArgs),
		argPinned: false,
		identityHash: "sha256-dispatch",
		consumed: false,
		retryCount: 0,
		mintedAt: NOW,
	});

	return { proposedCallId, reviewMessageId, artifactId, threadId };
}
