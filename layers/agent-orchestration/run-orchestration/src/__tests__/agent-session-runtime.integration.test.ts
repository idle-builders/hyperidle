import {
	agentLifecycleInbox,
	agentSessionRequests,
	agentWorkIntents,
	bets,
	type HyperIdleDb,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import {
	type AgentRunAdmissionFailedEvent,
	type AgentSessionRequestInput,
	TargetAgentNotRunnableError,
} from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import { createSessionRequest } from "@hyperidle/session-requests";
import { eq } from "drizzle-orm";
import { describe, vi } from "vitest";
import { runSession } from "../runtime.js";
import { buildTestPorts } from "./test-ports.js";

const createRequestForTest = (db: HyperIdleDb, request: AgentSessionRequestInput) =>
	createSessionRequest(db, { kind: "direct", request });

describe("agent session runtime consumer", () => {
	test("runSession claims request, marks running before runSession, and marks terminal", async ({
		db,
		ids,
	}) => {
		const now = new Date().toISOString();
		await db
			.insert(teams)
			.values({ id: ids("team-1"), name: "Team", phase: "build", createdAt: now });
		await db
			.insert(teamMembers)
			.values({ id: ids("member-1"), teamId: ids("team-1"), capacity: 3, activeBets: 0, formedAt: now });
		await db.insert(users).values({
			id: ids("agent-1"),
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		});
		await db.insert(bets).values({
			id: ids("bet-1"),
			teamId: ids("team-1"),
			description: "Bet",
			status: "active",
			createdAt: now,
		});
		await db.insert(tasks).values({
			id: ids("task-1"),
			betId: ids("bet-1"),
			teamId: ids("team-1"),
			title: "Task",
			state: "accepted",
			ownerAgentId: ids("agent-1"),
			createdAt: now,
			updatedAt: now,
		});

		const ports = buildTestPorts();
		vi.mocked(ports.sessionProvisioner!.admitSession).mockImplementation(async (_deps, params) => ({
			sessionId: ids("session-runtime-1"),
			sessionContext: { taskId: params.taskId },
		}));
		vi.mocked(ports.sessionProvisioner!.runSession).mockImplementation(async () => ({
			sessionId: ids("session-runtime-1"),
			outcome: "completed",
			taskId: ids("task-1"),
			forceReturnCount: 0,
		}));

		const request = await createRequestForTest(db, {
			sourceKind: "task",
			sourceId: ids("task-1"),
			streamId: `task:${ids("task-1")}`,
			taskId: ids("task-1"),
			agentId: ids("agent-1"),
			teamId: ids("team-1"),
			promptMode: "task",
			idempotencyKey: ids("task:task-1:accepted"),
			sourceCorrelation: { taskId: ids("task-1"), teamId: ids("team-1") },
		});

		await runSession(
			{ db, eventBus: new EventBus(), ports } as unknown as import("../contracts.js").RuntimeDeps,
			{ mode: "durable", request, sandboxBasePath: "/tmp/au1-runtime-test" },
		);

		expect(ports.sessionProvisioner!.admitSession).toHaveBeenCalledWith(
			expect.any(Object),
			expect.objectContaining({
				taskId: ids("task-1"),
				requestContext: {
					requestId: request.id,
					sourceKind: "task",
					sourceId: ids("task-1"),
					sourceCorrelation: { taskId: ids("task-1"), teamId: ids("team-1") },
				},
			}),
		);
		expect(ports.sessionProvisioner!.runSession).toHaveBeenCalledOnce();
		const [row] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, request.id));
		expect(row).toMatchObject({ status: "completed", sessionId: ids("session-runtime-1") });
	});

	test("request is running before harness run starts", async ({ db, ids }) => {
		const now = new Date().toISOString();
		await db
			.insert(teams)
			.values({ id: ids("team-1"), name: "Team", phase: "build", createdAt: now });
		await db
			.insert(teamMembers)
			.values({ id: ids("member-1"), teamId: ids("team-1"), capacity: 3, activeBets: 0, formedAt: now });
		await db.insert(users).values({
			id: ids("agent-1"),
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		});
		await db.insert(bets).values({
			id: ids("bet-1"),
			teamId: ids("team-1"),
			description: "Bet",
			status: "active",
			createdAt: now,
		});
		await db.insert(tasks).values({
			id: ids("task-1"),
			betId: ids("bet-1"),
			teamId: ids("team-1"),
			title: "Task",
			state: "accepted",
			ownerAgentId: ids("agent-1"),
			createdAt: now,
			updatedAt: now,
		});

		const ports = buildTestPorts();
		vi.mocked(ports.sessionProvisioner!.admitSession).mockImplementation(async (_deps, params) => ({
			sessionId: ids("session-runtime-1"),
			sessionContext: { taskId: params.taskId },
		}));

		const request = await createRequestForTest(db, {
			sourceKind: "task",
			sourceId: ids("task-1"),
			streamId: `task:${ids("task-1")}`,
			taskId: ids("task-1"),
			agentId: ids("agent-1"),
			teamId: ids("team-1"),
			promptMode: "task",
			idempotencyKey: ids("task:task-1:running-before-run"),
			sourceCorrelation: { taskId: ids("task-1"), teamId: ids("team-1") },
		});
		vi.mocked(ports.sessionProvisioner!.runSession).mockImplementationOnce(async () => {
			const [row] = await db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.id, request.id));
			expect(row).toMatchObject({ status: "running", sessionId: ids("session-runtime-1") });
			return {
				sessionId: ids("session-runtime-1"),
				outcome: "completed",
				taskId: ids("task-1"),
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
		ids,
	}) => {
		const createdAt = new Date().toISOString();
		await db.insert(users).values([
			{
				id: ids("failure-agent"),
				kind: "ai",
				name: "Failure Agent",
				role: "builder",
				status: "active",
				createdAt,
			},
			{
				id: ids("failure-user"),
				kind: "human",
				name: "Failure User",
				role: "founder",
				status: "active",
				createdAt,
			},
		]);
		const request = await createRequestForTest(db, {
			sourceKind: "assistant",
			sourceId: ids("failure-message"),
			streamId: `thread:${ids("failure-thread")}`,
			agentId: ids("failure-agent"),
			userId: ids("failure-user"),
			promptMode: "conversation",
			idempotencyKey: ids("assistant:failure-message"),
			sourceCorrelation: {
				threadId: ids("failure-thread"),
				messageId: ids("failure-message"),
				userId: ids("failure-user"),
				assistantAgentId: ids("failure-agent"),
			},
		});
		const ports = buildTestPorts();
		vi.mocked(ports.sessionProvisioner!.admitSession).mockResolvedValue({
			sessionId: ids("failure-session"),
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
			sessionId: ids("failure-session"),
		});
		const facts = await db
			.select()
			.from(agentLifecycleInbox)
			.where(eq(agentLifecycleInbox.requestId, request.id));
		expect(facts).toHaveLength(1);
		expect(facts[0]).toMatchObject({ state: "failed", sessionId: ids("failure-session") });
	});

	test("a deactivated-agent provisioning failure reports back via agent_run_admission_failed", async ({
		db,
		ids,
	}) => {
		const createdAt = new Date().toISOString();
		await db
			.insert(teams)
			.values({ id: ids("team-race"), name: "Team", phase: "build", createdAt });
		await db.insert(teamMembers).values({
			id: ids("member-race"),
			teamId: ids("team-race"),
			capacity: 3,
			activeBets: 0,
			formedAt: createdAt,
		});
		await db.insert(users).values({
			id: ids("agent-race"),
			kind: "ai",
			name: "Agent",
			role: "builder",
			// Deactivated between the intent's emit-time bake and this provisioning
			// attempt — `admitSession` is mocked to reject exactly as the real
			// Phase 1 status check now would (see `provisioner.ts`).
			status: "retired",
			createdAt,
		});
		await db.insert(bets).values({
			id: ids("bet-race"),
			teamId: ids("team-race"),
			description: "Bet",
			status: "active",
			createdAt,
		});
		await db.insert(tasks).values({
			id: ids("task-race"),
			betId: ids("bet-race"),
			teamId: ids("team-race"),
			title: "Task",
			state: "accepted",
			ownerAgentId: ids("agent-race"),
			createdAt,
			updatedAt: createdAt,
		});
		const request = await createRequestForTest(db, {
			sourceKind: "task",
			sourceId: ids("task-race"),
			streamId: `task:${ids("task-race")}`,
			taskId: ids("task-race"),
			agentId: ids("agent-race"),
			teamId: ids("team-race"),
			promptMode: "task",
			idempotencyKey: ids("task:task-race:deactivated"),
			sourceCorrelation: { taskId: ids("task-race"), teamId: ids("team-race") },
		});
		// The already-handed-off intent this session request was baked from —
		// `reportPreAdmissionProvisioningFailure` correlates the failure back to
		// ITS identity (`sourceKind:"task_dispatch_attempt"`), not the resolved
		// request's own (`sourceKind:"task"`).
		await db.insert(agentWorkIntents).values({
			id: ids("intent-race"),
			kind: "task_run",
			sourceKind: "task_dispatch_attempt",
			sourceId: ids("attempt-race"),
			idempotencyKey: ids("task:task-race:deactivated"),
			status: "handed_off",
			requestId: request.id,
			createdAt,
			updatedAt: createdAt,
		});

		const ports = buildTestPorts();
		vi.mocked(ports.sessionProvisioner!.admitSession).mockRejectedValue(
			new TargetAgentNotRunnableError(ids("agent-race")),
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
			intentId: ids("intent-race"),
			kind: "task_run",
			sourceKind: "task_dispatch_attempt",
			sourceId: ids("attempt-race"),
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
});
