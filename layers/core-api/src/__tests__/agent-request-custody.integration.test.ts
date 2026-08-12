/**
 * AU9 Remediation-2 — R2: this suite drives the real DB/request worker
 * (`drainAgentSessionRequests` / `bootAgentLayer`, both from `agent-layer-boot.ts`
 * — NOT one of the five R2-banned custody modules), with a deterministic fake
 * ONLY at the `ProvisionSessionDeps` harness-execution edge (`admitSession` /
 * `runSession` from `session-provisioning.js`, the same seam used by the
 * already-protected `agent-run-boundary.test.ts`). It never imports a
 * custody/claim/terminal/recovery helper directly to assert its return value.
 */

import {
	agentLifecycleInbox,
	agentRunConfig,
	agentSessionRequests,
	bets,
	messages,
	sessions,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import type { RuntimePorts } from "@hyperidle/run-orchestration";
import { eq } from "drizzle-orm";
import { afterEach, describe, vi } from "vitest";
import { expect, test } from "../__testing__/test-fixtures.js";
import { startTestRuntime } from "./run-orchestration-test-runtime.js";

const sessionProvisioner: NonNullable<RuntimePorts["sessionProvisioner"]> = {
	admitSession: vi.fn(async (deps, params) => {
		// Reflects whichever session row the REAL reserve-or-adopt path already
		// created/adopted for this request — never fabricates a second one.
		const requestId = params.requestContext?.requestId;
		const [existing] = requestId
			? await deps.db.select().from(sessions).where(eq(sessions.requestId, requestId)).limit(1)
			: [];
		const sessionId = existing?.id ?? `stub-session-${requestId ?? "unknown"}`;
		return {
			sessionId,
			sessionContext: {
				sessionId,
				agentId: params.agentId,
				taskId: params.taskId,
				sandboxPath: "/tmp/au9-custody",
				ingestion: { dispose: vi.fn() },
				traceId: "trace-au9-custody",
				requestContext: params.requestContext,
			},
		};
	}),
	runSession: vi.fn(async () => {
		return {
			sessionId: "unused",
			outcome: "completed" as const,
			taskId: null,
			forceReturnCount: 0,
		};
	}),
};

async function drain(db: import("@hyperidle/db").HyperIdleDb) {
	const eventBus = new EventBus();
	const handle = await startTestRuntime(db, eventBus, { db, eventBus }, sessionProvisioner);
	await handle.dispose();
}

afterEach(() => {
	vi.clearAllMocks();
});

async function seedTaskRequest(
	db: import("@hyperidle/db").HyperIdleDb,
	ids: ScopedIds,
	prefix: string,
	options: { claimed?: boolean; expired?: boolean } = {},
): Promise<string> {
	const now = new Date().toISOString();
	const teamId = ids(`${prefix}-team`);
	const memberId = ids(`${prefix}-member`);
	const agentId = ids(`${prefix}-agent`);
	const betId = ids(`${prefix}-bet`);
	const taskId = ids(`${prefix}-task`);
	const requestId = ids(prefix);
	await db.insert(teams).values({ id: teamId, name: prefix, phase: "build", createdAt: now });
	await db.insert(teamMembers).values({
		id: memberId,
		teamId: teamId,
		capacity: 3,
		activeBets: 0,
		formedAt: now,
	});
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		teamId: memberId,
		createdAt: now,
	});
	await db.insert(bets).values({
		id: betId,
		teamId: teamId,
		description: prefix,
		status: "active",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: taskId,
		betId: betId,
		teamId: teamId,
		title: prefix,
		state: "accepted",
		ownerAgentId: agentId,
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(agentSessionRequests).values({
		id: requestId,
		sourceKind: "task",
		sourceId: taskId,
		streamId: `task:${taskId}`,
		taskId: taskId,
		agentId: agentId,
		teamId: teamId,
		promptMode: "task",
		sourceCorrelationJson: JSON.stringify({ taskId: taskId, teamId: teamId }),
		idempotencyKey: prefix,
		status: options.claimed ? "claimed" : "pending",
		...(options.claimed
			? {
					claimedBy: "prior-worker",
					claimedAt: now,
					claimToken: ids(`${prefix}-token`),
					claimExpiresAt: options.expired
						? "2000-01-01T00:00:00.000Z"
						: new Date(Date.now() + 30_000).toISOString(),
				}
			: {}),
		createdAt: now,
		updatedAt: now,
	});
	return requestId;
}

/**
 * AU27 W1 fix — the assistant turn's own `sourceKind: "assistant"` request,
 * seeded directly on `agentSessionRequests` (bypassing the trigger-recording
 * stage) exactly like `seedTaskRequest` does for `task` — proving the shared
 * drain (`drainAgentSessionRequests` → `runClaimedRequest`) is genuinely
 * agnostic to source kind, not merely that `task` happens to work.
 */
async function seedAssistantTurnRequest(
	db: import("@hyperidle/db").HyperIdleDb,
	ids: ScopedIds,
	prefix: string,
): Promise<string> {
	const now = new Date().toISOString();
	const founderId = ids(`${prefix}-founder`);
	const assistantId = ids(`${prefix}-assistant`);
	const threadId = ids(`${prefix}-thread`);
	const messageId = ids(`${prefix}-msg`);
	const requestId = ids(prefix);
	await db.insert(users).values({
		id: founderId,
		kind: "human",
		name: "Founder",
		role: "founder",
		status: "active",
		createdAt: now,
	});
	await db.insert(users).values({
		id: assistantId,
		kind: "ai",
		name: "Assistant",
		role: "assistant",
		status: "active",
		createdAt: now,
	});
	// AU26 G1: the run config lives in `agent_run_config` now.
	await db.insert(agentRunConfig).values({
		agentUserId: assistantId,
		harnessType: "builtin",
		modelId: ids(`${prefix}-model`),
		modelProvider: "openrouter",
	});
	await db.insert(threads).values({
		id: threadId,
		hostKind: "user",
		hostId: founderId,
		initiatorId: founderId,
		participants: JSON.stringify([founderId, assistantId]),
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(messages).values({
		id: messageId,
		threadId,
		senderId: founderId,
		type: "plain",
		payload: JSON.stringify({ text: "What is 1 + 1?" }),
		clientKey: ids(`${prefix}-ck`),
		createdAt: now,
	});
	await db.insert(agentSessionRequests).values({
		id: requestId,
		sourceKind: "assistant",
		sourceId: messageId,
		streamId: `assistant:${messageId}`,
		taskId: null,
		agentId: assistantId,
		userId: founderId,
		promptMode: "conversation",
		sourceCorrelationJson: JSON.stringify({
			threadId,
			messageId,
			userId: founderId,
			assistantAgentId: assistantId,
		}),
		idempotencyKey: prefix,
		status: "pending",
		createdAt: now,
		updatedAt: now,
	});
	return requestId;
}

describe("request custody drives the real drain and runtime", () => {
	test("two concurrent drains yield exactly one winner for a pending request", async ({
		db,
		ids,
	}) => {
		const requestId = await seedTaskRequest(db, ids, "pending-race");
		await Promise.all([drain(db), drain(db)]);
		const mySessions = await db.select().from(sessions).where(eq(sessions.requestId, requestId));
		expect(mySessions).toHaveLength(1);
		const [request] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, requestId));
		// detachAfterAdmission's mocked runSession resolves near-instantly, so by
		// the time the drain returns the request has already run its full
		// admission→completion lifecycle through the single terminal writer.
		expect(request?.status).toBe("completed");
	});

	test("an expired claim is reclaimed once and the unique correlated session is adopted", async ({
		db,
		ids,
	}) => {
		const requestId = await seedTaskRequest(db, ids, "restart-request", {
			claimed: true,
			expired: true,
		});
		await Promise.all([drain(db), drain(db)]);
		const mySessions = await db.select().from(sessions).where(eq(sessions.requestId, requestId));
		expect(mySessions).toHaveLength(1);
	});

	test("process death immediately after a committed session insert is recovered on restart without a second session", async ({
		db,
		ids,
	}) => {
		// Legacy checkpoint: the session row was committed (a prior crashed attempt's
		// reserve-or-adopt succeeded) but the request never reached "running" —
		// it is still "claimed" with an expired lease.
		const requestId = await seedTaskRequest(db, ids, "checkpoint-request", {
			claimed: true,
			expired: true,
		});
		const now = new Date().toISOString();
		const checkpointSessionId = ids("checkpoint-session");
		await db.insert(sessions).values({
			id: checkpointSessionId,
			requestId: requestId,
			taskId: ids("checkpoint-request-task"),
			agentId: ids("checkpoint-request-agent"),
			modelTier: "fast",
			startedAt: now,
			state: "active",
			sourceKind: "task",
			sourceId: ids("checkpoint-request-task"),
			sourceCorrelationJson: JSON.stringify({
				taskId: ids("checkpoint-request-task"),
				teamId: ids("checkpoint-request-team"),
			}),
		});
		await drain(db);
		const durableSessions = await db
			.select()
			.from(sessions)
			.where(eq(sessions.requestId, requestId));
		expect(durableSessions).toHaveLength(1);
		expect(durableSessions[0]?.id).toBe(checkpointSessionId);
		const [request] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, requestId));
		expect(request).toMatchObject({ status: "completed", sessionId: checkpointSessionId });
	});

	test("a completed run has one CAS-won terminal transition and exactly one lifecycle fact", async ({
		db,
		ids,
	}) => {
		const requestId = await seedTaskRequest(db, ids, "terminal-request");
		await drain(db);
		const [request] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, requestId));
		expect(request?.status).toBe("completed");
		const inbox = await db
			.select()
			.from(agentLifecycleInbox)
			.where(eq(agentLifecycleInbox.requestId, requestId));
		expect(inbox).toHaveLength(1);
		expect(inbox[0]).toMatchObject({ state: "completed" });
	});

	// -------------------------------------------------------------------------
	// AU27 W1 — AC-5's promised proof: the assistant's `sourceKind: "assistant"`
	// request drains through the SAME shared poller as `task`, and reaches
	// "completed" only via the real `running`-precondition CAS
	// (`transition-run.ts`'s `transitionAgentRunLifecycle`) — not merely
	// because a row exists. `runClaimedRequest` (runtime.ts:370-375) writes
	// `to: "running"` BEFORE admitting; only after that does the detached
	// `runSession` completion write `to: "completed"` under a
	// `precondition: "running"` CAS. A request that never reached "running"
	// cannot reach "completed" — it would CAS-miss and terminalize "failed"
	// instead (runtime.ts's `.catch` branch), so this assertion is a genuine
	// lifecycle-transition proof, not a row-existence check.
	// -------------------------------------------------------------------------

	test("an assistant_turn request reaches running then completed through the shared durable poller (AC-5)", async ({
		db,
		ids,
	}) => {
		const requestId = await seedAssistantTurnRequest(db, ids, "assistant-lifecycle-request");
		await drain(db);

		const [request] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, requestId));
		expect(request?.status).toBe("completed");
		expect(request?.sourceKind).toBe("assistant");

		const [session] = await db.select().from(sessions).where(eq(sessions.requestId, requestId));
		expect(session?.sourceKind).toBe("assistant");

		const inbox = await db
			.select()
			.from(agentLifecycleInbox)
			.where(eq(agentLifecycleInbox.requestId, requestId));
		expect(inbox).toHaveLength(1);
		expect(inbox[0]).toMatchObject({ state: "completed" });
	});
});
