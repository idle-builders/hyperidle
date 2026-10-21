import {
	agentSessionRequests,
	agentWorkIntents,
	type HyperIdleDb,
	tasks,
	teams,
	threads,
	users,
	userTeams,
} from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import type { AgentSessionRequestInput } from "@hyperidle/domain-model";
import type { AgentRunAdmissionFailedEvent } from "@hyperidle/event-bus";
import { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { describe, vi } from "vitest";
import { TargetAgentNotRunnableError } from "../errors.js";
import { runSession } from "../runtime.js";
import { buildTestPorts } from "./test-ports.js";

async function seedBoundaryFixture(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: "team-boundary", name: "Boundary", createdAt: now });
	await db.insert(users).values([
		{
			id: "agent-boundary",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		},
		{
			id: "user-boundary",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: now,
		},
	]);
	await db.insert(userTeams).values({ userId: "agent-boundary", teamId: "team-boundary" });
	await db.insert(threads).values({
		id: "thr-bet-boundary",
		hostKind: "team",
		hostId: "team-boundary",
		initiatorId: "agent-boundary",
		participants: "[]",
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: "bet-boundary",
		threadId: "thr-bet-boundary",
		parentTaskId: null,
		teamId: "team-boundary",
		title: "Close agent execution boundary",
		description: "Close agent execution boundary",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(threads).values({
		id: "thr-task-boundary",
		hostKind: "team",
		hostId: "team-boundary",
		initiatorId: "agent-boundary",
		participants: "[]",
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: "task-boundary",
		threadId: "thr-task-boundary",
		parentTaskId: "bet-boundary",
		teamId: "team-boundary",
		title: "Boundary task",
		state: "accepted",
		ownerAgentId: "agent-boundary",
		createdAt: now,
		updatedAt: now,
	});
}

function boundarySourceInput(
	sourceKind: AgentSessionRequestInput["sourceKind"],
	suffix: string,
): AgentSessionRequestInput {
	const base = {
		sourceId: `${sourceKind}-${suffix}`,
		streamId: `${sourceKind}:${suffix}`,
		agentId: "agent-boundary",
		teamId: "team-boundary",
		idempotencyKey: `${sourceKind}:${suffix}`,
	} as const;

	switch (sourceKind) {
		case "task":
			return {
				...base,
				sourceKind,
				sourceId: "task-boundary",
				streamId: "task:task-boundary",
				taskId: "task-boundary",
				promptMode: "task",
				sourceCorrelation: { taskId: "task-boundary", teamId: "team-boundary" },
			};
		case "assistant":
			return {
				...base,
				sourceKind,
				userId: "user-boundary",
				promptMode: "conversation",
				sourceCorrelation: {
					threadId: "thread-boundary",
					messageId: `msg-${suffix}`,
					userId: "user-boundary",
					agentId: "agent-boundary",
				},
			};
		case "knowledge":
			return {
				...base,
				sourceKind,
				taskId: null,
				promptMode: "knowledge",
				sourceCorrelation: {
					knowledgeItemId: `item-${suffix}`,
					action: "summarize",
					teamId: "team-boundary",
				},
			};
		case "subscription":
			return {
				...base,
				sourceKind,
				taskId: null,
				promptMode: "subscription",
				sourceCorrelation: {
					subscriptionId: `subscription-${suffix}`,
					changeId: `change-${suffix}`,
					teamId: "team-boundary",
				},
			};
		case "review_resume":
			return {
				...base,
				sourceKind,
				taskId: null,
				promptMode: "resume",
				sourceCorrelation: {
					reviewMessageId: `review-${suffix}`,
					threadId: "thread-boundary",
					resumedSessionId: `sess-${suffix}`,
				},
			};
	}
}

async function createRequestForTest(db: HyperIdleDb, request: AgentSessionRequestInput) {
	const now = new Date().toISOString();
	const [row] = await db
		.insert(agentSessionRequests)
		.values({
			id: `test-request-${request.idempotencyKey}`,
			sourceKind: request.sourceKind,
			sourceId: request.sourceId,
			streamId: request.streamId,
			agentId: request.agentId,
			userId: request.userId ?? null,
			promptMode: request.promptMode,
			payloadJson: request.payloadJson ?? null,
			idempotencyKey: request.idempotencyKey,
			teamId: request.teamId ?? null,
			taskId: request.taskId ?? null,
			sourceCorrelationJson: JSON.stringify(request.sourceCorrelation ?? {}),
			status: "pending",
			createdAt: now,
			updatedAt: now,
		})
		.returning();
	if (!row) throw new Error("Insert failed");
	return row;
}

describe("agent session runtime consumer", () => {
	test("runSession claims request, marks running before runSession, and marks terminal", async ({
		db,
	}) => {
		const now = new Date().toISOString();
		await db.insert(teams).values({ id: "team-1", name: "Team", createdAt: now });
		await db.insert(users).values({
			id: "agent-1",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		});
		await db.insert(threads).values({
			id: "thr-bet-1",
			hostKind: "team",
			hostId: "team-1",
			initiatorId: "agent-1",
			participants: "[]",
			lastActiveAt: now,
			createdAt: now,
		});
		await db.insert(tasks).values({
			id: "bet-1",
			threadId: "thr-bet-1",
			parentTaskId: null,
			teamId: "team-1",
			title: "Bet",
			description: "Bet",
			state: "in_progress",
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(threads).values({
			id: "thr-task-1",
			hostKind: "team",
			hostId: "team-1",
			initiatorId: "agent-1",
			participants: "[]",
			lastActiveAt: now,
			createdAt: now,
		});
		await db.insert(tasks).values({
			id: "task-1",
			threadId: "thr-task-1",
			parentTaskId: "bet-1",
			teamId: "team-1",
			title: "Task",
			state: "accepted",
			ownerAgentId: "agent-1",
			createdAt: now,
			updatedAt: now,
		});

		const ports = buildTestPorts();
		vi.mocked(ports.sessionProvisioner!.admitSession).mockImplementation(async (_deps, params) => ({
			sessionId: "session-runtime-1",
			sessionContext: { taskId: params.taskId },
		}));
		vi.mocked(ports.sessionProvisioner!.runSession).mockImplementation(async () => ({
			sessionId: "session-runtime-1",
			outcome: "completed",
			taskId: "task-1",
			forceReturnCount: 0,
		}));

		const request = await createRequestForTest(db, {
			sourceKind: "task",
			sourceId: "task-1",
			streamId: "task:task-1",
			taskId: "task-1",
			agentId: "agent-1",
			teamId: "team-1",
			promptMode: "task",
			idempotencyKey: "task:task-1:accepted",
			sourceCorrelation: { taskId: "task-1", teamId: "team-1" },
		});

		await runSession(
			{ db, eventBus: new EventBus(), ports } as unknown as import("../contracts.js").RuntimeDeps,
			{ mode: "durable", request, sandboxBasePath: "/tmp/au1-runtime-test" },
		);

		expect(ports.sessionProvisioner!.admitSession).toHaveBeenCalledWith(
			expect.any(Object),
			expect.objectContaining({
				taskId: "task-1",
				requestContext: {
					requestId: request.id,
					sourceKind: "task",
					sourceId: "task-1",
					sourceCorrelation: { taskId: "task-1", teamId: "team-1" },
				},
			}),
		);
		expect(ports.sessionProvisioner!.runSession).toHaveBeenCalledOnce();
		const [row] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, request.id));
		expect(row).toMatchObject({ status: "completed", sessionId: "session-runtime-1" });
	});

	test("request is running before harness run starts", async ({ db }) => {
		const now = new Date().toISOString();
		await db.insert(teams).values({ id: "team-1", name: "Team", createdAt: now });
		await db.insert(users).values({
			id: "agent-1",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		});
		await db.insert(threads).values({
			id: "thr-bet-1",
			hostKind: "team",
			hostId: "team-1",
			initiatorId: "agent-1",
			participants: "[]",
			lastActiveAt: now,
			createdAt: now,
		});
		await db.insert(tasks).values({
			id: "bet-1",
			threadId: "thr-bet-1",
			parentTaskId: null,
			teamId: "team-1",
			title: "Bet",
			description: "Bet",
			state: "in_progress",
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(threads).values({
			id: "thr-task-1",
			hostKind: "team",
			hostId: "team-1",
			initiatorId: "agent-1",
			participants: "[]",
			lastActiveAt: now,
			createdAt: now,
		});
		await db.insert(tasks).values({
			id: "task-1",
			threadId: "thr-task-1",
			parentTaskId: "bet-1",
			teamId: "team-1",
			title: "Task",
			state: "accepted",
			ownerAgentId: "agent-1",
			createdAt: now,
			updatedAt: now,
		});

		const ports = buildTestPorts();
		vi.mocked(ports.sessionProvisioner!.admitSession).mockImplementation(async (_deps, params) => ({
			sessionId: "session-runtime-1",
			sessionContext: { taskId: params.taskId },
		}));

		const request = await createRequestForTest(db, {
			sourceKind: "task",
			sourceId: "task-1",
			streamId: "task:task-1",
			taskId: "task-1",
			agentId: "agent-1",
			teamId: "team-1",
			promptMode: "task",
			idempotencyKey: "task:task-1:running-before-run",
			sourceCorrelation: { taskId: "task-1", teamId: "team-1" },
		});
		vi.mocked(ports.sessionProvisioner!.runSession).mockImplementationOnce(async () => {
			const [row] = await db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.id, request.id));
			expect(row).toMatchObject({ status: "running", sessionId: "session-runtime-1" });
			return {
				sessionId: "session-runtime-1",
				outcome: "completed",
				taskId: "task-1",
				forceReturnCount: 0,
			};
		});

		await runSession(
			{ db, eventBus: new EventBus(), ports } as unknown as import("../contracts.js").RuntimeDeps,
			{ mode: "durable", request, sandboxBasePath: "/tmp/au1-runtime-test" },
		);
	});

	test("a harness failure terminalizes the admitted request once and emits one durable fact", async ({
		db,
	}) => {
		const createdAt = new Date().toISOString();
		await db.insert(users).values([
			{
				id: "failure-agent",
				kind: "ai",
				name: "Failure Agent",
				role: "builder",
				status: "active",
				createdAt,
			},
			{
				id: "failure-user",
				kind: "human",
				name: "Failure User",
				role: "founder",
				status: "active",
				createdAt,
			},
		]);
		const request = await createRequestForTest(db, {
			sourceKind: "assistant",
			sourceId: "failure-message",
			streamId: "thread:failure",
			agentId: "failure-agent",
			userId: "failure-user",
			promptMode: "conversation",
			idempotencyKey: "assistant:failure-message",
			sourceCorrelation: {
				threadId: "failure-thread",
				messageId: "failure-message",
				userId: "failure-user",
				agentId: "failure-agent",
			},
		});
		const ports = buildTestPorts();
		vi.mocked(ports.sessionProvisioner!.admitSession).mockResolvedValue({
			sessionId: "failure-session",
			sessionContext: { taskId: null },
		});
		vi.mocked(ports.sessionProvisioner!.runSession).mockRejectedValue(new Error("harness crashed"));

		await expect(
			runSession(
				{ db, eventBus: new EventBus(), ports } as unknown as import("../contracts.js").RuntimeDeps,
				{ mode: "durable", request, sandboxBasePath: "/tmp/au20-runtime-failure" },
			),
		).rejects.toThrow("harness crashed");

		const [stored] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, request.id));
		expect(stored).toMatchObject({
			status: "failed",
			sessionId: "failure-session",
			// Load-bearing: the real composition once silently dropped this field
			// for months — a hand-rewritten test double kept forwarding it
			// correctly while production wrote null. Routing through the real `transitionRun`
			// (test-ports.ts) is what makes this assertion mean anything.
			errorMessage: "harness crashed",
		});
	});

	test("a deactivated-agent provisioning failure reports back via agent_run_admission_failed", async ({
		db,
	}) => {
		const createdAt = new Date().toISOString();
		await db.insert(teams).values({ id: "team-race", name: "Team", createdAt });
		await db.insert(users).values({
			id: "agent-race",
			kind: "ai",
			name: "Agent",
			role: "builder",
			// Deactivated between the intent's emit-time bake and this provisioning
			// attempt — `admitSession` is mocked to reject exactly as the real
			// Phase 1 status check now would (see `provisioner.ts`).
			status: "retired",
			createdAt,
		});
		await db.insert(threads).values({
			id: "thr-bet-race",
			hostKind: "team",
			hostId: "team-race",
			initiatorId: "agent-race",
			participants: "[]",
			lastActiveAt: createdAt,
			createdAt,
		});
		await db.insert(tasks).values({
			id: "bet-race",
			threadId: "thr-bet-race",
			parentTaskId: null,
			teamId: "team-race",
			title: "Bet",
			description: "Bet",
			state: "in_progress",
			createdAt: createdAt,
			updatedAt: createdAt,
		});
		await db.insert(threads).values({
			id: "thr-task-race",
			hostKind: "team",
			hostId: "team-race",
			initiatorId: "agent-race",
			participants: "[]",
			lastActiveAt: createdAt,
			createdAt,
		});
		await db.insert(tasks).values({
			id: "task-race",
			threadId: "thr-task-race",
			parentTaskId: "bet-race",
			teamId: "team-race",
			title: "Task",
			state: "accepted",
			ownerAgentId: "agent-race",
			createdAt,
			updatedAt: createdAt,
		});
		const request = await createRequestForTest(db, {
			sourceKind: "task",
			sourceId: "task-race",
			streamId: "task:task-race",
			taskId: "task-race",
			agentId: "agent-race",
			teamId: "team-race",
			promptMode: "task",
			idempotencyKey: "task:task-race:deactivated",
			sourceCorrelation: { taskId: "task-race", teamId: "team-race" },
		});
		// The already-handed-off intent this session request was baked from —
		// `reportPreAdmissionProvisioningFailure` correlates the failure back to
		// ITS identity (`sourceKind:"task_dispatch_attempt"`), not the resolved
		// request's own (`sourceKind:"task"`).
		await db.insert(agentWorkIntents).values({
			id: "intent-race",
			kind: "task_run",
			sourceKind: "task_dispatch_attempt",
			sourceId: "attempt-race",
			idempotencyKey: "task:task-race:deactivated",
			status: "handed_off",
			requestId: request.id,
			createdAt,
			updatedAt: createdAt,
		});

		const ports = buildTestPorts();
		vi.mocked(ports.sessionProvisioner!.admitSession).mockRejectedValue(
			new TargetAgentNotRunnableError("agent-race"),
		);
		const eventBus = new EventBus();
		const emitted: AgentRunAdmissionFailedEvent[] = [];
		eventBus.on("agent_run_admission_failed", (event) => emitted.push(event));

		await expect(
			runSession({ db, eventBus, ports } as unknown as import("../contracts.js").RuntimeDeps, {
				mode: "durable",
				request,
				sandboxBasePath: "/tmp/au21-race-test",
			}),
		).rejects.toThrow();

		expect(emitted).toHaveLength(1);
		expect(emitted[0]).toMatchObject({
			type: "agent_run_admission_failed",
			intentId: "intent-race",
			kind: "task_run",
			sourceKind: "task_dispatch_attempt",
			sourceId: "attempt-race",
			failureCode: "TARGET_AGENT_NOT_RUNNABLE",
			terminal: true,
		});

		// Never proceeds with authority: no session/running request exists.
		const [stored] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, request.id));
		expect(stored?.status).toBe("failed");
		expect(stored?.sessionId).toBeNull();
	});

	test("all source kinds can enter the boundary from a durable request", async ({ db }) => {
		await seedBoundaryFixture(db);
		const ports = buildTestPorts();
		const eventBus = new EventBus();
		const lifecycle: Array<{ sourceKind: string; sourceId: string; state: string }> = [];
		eventBus.on("agent_run_lifecycle_changed", (event) => lifecycle.push(event));
		vi.mocked(ports.sessionProvisioner!.admitSession).mockImplementation(async (_deps, params) => ({
			sessionId: "session-boundary-boundary",
			sessionContext: { taskId: params.taskId },
		}));
		vi.mocked(ports.sessionProvisioner!.runSession).mockImplementation(async () => ({
			sessionId: "session-boundary-boundary",
			outcome: "completed",
			taskId: "task-boundary",
			forceReturnCount: 0,
		}));
		for (const sourceKind of ["task", "assistant", "subscription", "knowledge"] as const) {
			const request = await createRequestForTest(db, boundarySourceInput(sourceKind, "boundary"));
			await runSession(
				{ db, eventBus, ports } as unknown as import("../contracts.js").RuntimeDeps,
				{ mode: "durable", request, sandboxBasePath: "/tmp/boundary-boundary" },
			);
			const [row] = await db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.id, request.id));
			expect(row).toMatchObject({ sourceKind, status: "completed" });
		}
		expect(lifecycle).toHaveLength(4);
		expect(lifecycle.map(({ sourceKind, state }) => ({ sourceKind, state }))).toEqual(
			["task", "assistant", "subscription", "knowledge"].map((sourceKind) => ({
				sourceKind,
				state: "completed",
			})),
		);
		expect(lifecycle.filter(({ sourceKind }) => sourceKind === "assistant")).toEqual([
			expect.objectContaining({ sourceId: "assistant-boundary", state: "completed" }),
		]);
	});
});
