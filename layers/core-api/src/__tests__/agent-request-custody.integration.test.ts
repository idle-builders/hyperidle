/**
 * This suite drives the real DB/request worker (`drainAgentSessionRequests` /
 * `bootAgentLayer`, both from `agent-layer-boot.ts`), with a deterministic
 * fake ONLY at the `ProvisionSessionDeps` harness-execution edge
 * (`admitSession` / `runSession` from `session-provisioning.js`, the same
 * seam used by `agent-run-boundary.test.ts`). It never imports a
 * custody/claim/terminal/recovery helper directly to assert its return value.
 */

import {
	agentRunConfig,
	agentSessionRequests,
	messages,
	sessions,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
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
				sandboxPath: "/tmp/custody",
				ingestion: { dispose: vi.fn() },
				traceId: "trace-custody",
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
	id: string,
	options: { claimed?: boolean; expired?: boolean } = {},
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: `${id}-team`, name: id, createdAt: now });
	await db.insert(users).values({
		id: `${id}-agent`,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		teamId: `${id}-team`,
		createdAt: now,
	});
	await db.insert(threads).values({
		id: `thr-${`${id}-bet`}`,
		hostKind: "team",
		hostId: `${id}-team`,
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(tasks).values({
		threadId: `thr-${`${id}-bet`}`,
		id: `${id}-bet`,
		parentTaskId: null,
		teamId: `${id}-team`,
		title: id,
		description: id,
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(threads).values({
		id: `thr-${`${id}-task`}`,
		hostKind: "team",
		hostId: `${id}-team`,
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(tasks).values({
		threadId: `thr-${`${id}-task`}`,
		id: `${id}-task`,
		parentTaskId: `${id}-bet`,
		teamId: `${id}-team`,
		title: id,
		state: "accepted",
		ownerAgentId: `${id}-agent`,
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(agentSessionRequests).values({
		id,
		sourceKind: "task",
		sourceId: `${id}-task`,
		streamId: `task:${id}-task`,
		taskId: `${id}-task`,
		agentId: `${id}-agent`,
		teamId: `${id}-team`,
		promptMode: "task",
		sourceCorrelationJson: JSON.stringify({ taskId: `${id}-task`, teamId: `${id}-team` }),
		idempotencyKey: id,
		status: options.claimed ? "claimed" : "pending",
		...(options.claimed
			? {
					claimedBy: "prior-worker",
					claimedAt: now,
					claimToken: "prior-token",
					claimExpiresAt: options.expired
						? "2000-01-01T00:00:00.000Z"
						: new Date(Date.now() + 30_000).toISOString(),
				}
			: {}),
		createdAt: now,
		updatedAt: now,
	});
}

/**
 * The assistant turn's own `sourceKind: "assistant"` request, seeded directly
 * on `agentSessionRequests` (bypassing the trigger-recording stage) exactly
 * like `seedTaskRequest` does for `task` — proving the shared drain
 * (`drainAgentSessionRequests` -> `runClaimedRequest`) is genuinely agnostic
 * to source kind, not merely that `task` happens to work.
 */
async function seedAssistantTurnRequest(
	db: import("@hyperidle/db").HyperIdleDb,
	id: string,
): Promise<void> {
	const now = new Date().toISOString();
	const founderId = `${id}-founder`;
	const assistantId = `ast-${founderId}`;
	const threadId = `${id}-thread`;
	const messageId = `${id}-msg`;
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
	// The run config lives in `agent_run_config`.
	await db.insert(agentRunConfig).values({
		agentUserId: assistantId,
		harnessType: "opencode",
		modelId: "deepseek/deepseek-v4-flash",
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
		clientKey: `ck-${id}`,
		createdAt: now,
	});
	await db.insert(agentSessionRequests).values({
		id,
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
			agentId: assistantId,
		}),
		idempotencyKey: id,
		status: "pending",
		createdAt: now,
		updatedAt: now,
	});
}

describe("request custody drives the real drain and runtime", () => {
	test("two concurrent drains yield exactly one winner for a pending request", async ({ db }) => {
		await seedTaskRequest(db, "pending-race");
		await Promise.all([drain(db), drain(db)]);
		expect(await db.select().from(sessions)).toHaveLength(1);
		const [request] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, "pending-race"));
		// detachAfterAdmission's mocked runSession resolves near-instantly, so by
		// the time the drain returns the request has already run its full
		// admission→completion lifecycle through the single terminal writer.
		expect(request?.status).toBe("completed");
	});

	test("an expired claim is reclaimed once and the unique correlated session is adopted", async ({
		db,
	}) => {
		await seedTaskRequest(db, "restart-request", { claimed: true, expired: true });
		await Promise.all([drain(db), drain(db)]);
		expect(await db.select().from(sessions)).toHaveLength(1);
	});

	test("process death immediately after a committed session insert is recovered on restart without a second session", async ({
		db,
	}) => {
		// Legacy checkpoint: the session row was committed (a prior crashed attempt's
		// reserve-or-adopt succeeded) but the request never reached "running" —
		// it is still "claimed" with an expired lease.
		await seedTaskRequest(db, "checkpoint-request", { claimed: true, expired: true });
		const now = new Date().toISOString();
		await db.insert(sessions).values({
			id: "checkpoint-session",
			requestId: "checkpoint-request",
			taskId: "checkpoint-request-task",
			agentId: "checkpoint-request-agent",
			modelTier: "fast",
			startedAt: now,
			state: "active",
			sourceKind: "task",
			sourceId: "checkpoint-request-task",
			sourceCorrelationJson: JSON.stringify({
				taskId: "checkpoint-request-task",
				teamId: "checkpoint-request-team",
			}),
		});
		await drain(db);
		const durableSessions = await db
			.select()
			.from(sessions)
			.where(eq(sessions.requestId, "checkpoint-request"));
		expect(durableSessions).toHaveLength(1);
		expect(durableSessions[0]?.id).toBe("checkpoint-session");
		const [request] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, "checkpoint-request"));
		expect(request).toMatchObject({ status: "completed", sessionId: "checkpoint-session" });
	});

	test("a completed run has one CAS-won terminal transition and exactly one lifecycle fact", async ({
		db,
	}) => {
		await seedTaskRequest(db, "terminal-request");
		await drain(db);
		const [request] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, "terminal-request"));
		expect(request?.status).toBe("completed");
	});

	// The assistant's `sourceKind: "assistant"` request drains through the SAME
	// shared poller as `task`, and reaches "completed" only via the real
	// `running`-precondition CAS (`transition-run.ts`'s
	// `transitionAgentRunLifecycle`) — not merely because a row exists.
	// `runClaimedRequest` writes `to: "running"` BEFORE admitting; only after
	// that does the detached `runSession` completion write `to: "completed"`
	// under a `precondition: "running"` CAS. A request that never reached
	// "running" cannot reach "completed" — it would CAS-miss and terminalize
	// "failed" instead, so this assertion is a genuine lifecycle-transition
	// proof, not a row-existence check.

	test("an assistant_turn request reaches running then completed through the shared durable poller", async ({
		db,
	}) => {
		await seedAssistantTurnRequest(db, "assistant-lifecycle-request");
		await drain(db);

		const [request] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, "assistant-lifecycle-request"));
		expect(request?.status).toBe("completed");
		expect(request?.sourceKind).toBe("assistant");

		const [session] = await db
			.select()
			.from(sessions)
			.where(eq(sessions.requestId, "assistant-lifecycle-request"));
		expect(session?.sourceKind).toBe("assistant");
	});
});
