/**
 * @lore AU19 Increment 3c: real cut-over — moved here from
 * `packages/server/src/services/__tests__/agent-session-runtime.test.ts`.
 * See `agent-run-boundary.integration.test.ts`'s top `@lore` for the
 * fixture-conversion + port-injection rationale (same shape).
 */
import {
	agentLifecycleInbox,
	agentSessionRequests,
	bets,
	type HyperIdleDb,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { createSessionRequest } from "@hyperidle/session-requests";
import { type AgentSessionRequestInput, EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { describe, vi } from "vitest";
import { consumeAgentSessionRequest } from "../agent-session-runtime.js";
import { buildTestPorts } from "./test-ports.js";

const createRequestForTest = (db: HyperIdleDb, request: AgentSessionRequestInput) =>
	createSessionRequest(db, { kind: "direct", request });

describe("agent session runtime consumer", () => {
	test("consumeAgentSessionRequest claims request, marks running before runSession, and marks terminal", async ({
		db,
	}) => {
		const now = new Date().toISOString();
		await db.insert(teams).values({ id: "team-1", name: "Team", phase: "build", createdAt: now });
		await db
			.insert(teamMembers)
			.values({ id: "member-1", teamId: "team-1", capacity: 3, activeBets: 0, formedAt: now });
		await db.insert(users).values({
			id: "agent-1",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		});
		await db.insert(bets).values({
			id: "bet-1",
			teamId: "team-1",
			description: "Bet",
			status: "active",
			createdAt: now,
		});
		await db.insert(tasks).values({
			id: "task-1",
			betId: "bet-1",
			teamId: "team-1",
			title: "Task",
			state: "accepted",
			ownerAgentId: "agent-1",
			createdAt: now,
			updatedAt: now,
		});

		const ports = buildTestPorts();
		vi.mocked(ports.sessionProvisioner.admitSession).mockImplementation(async (_deps, params) => ({
			sessionId: "session-runtime-1",
			sessionContext: { taskId: params.taskId },
		}));
		vi.mocked(ports.sessionProvisioner.runSession).mockImplementation(async () => ({
			sessionId: "session-runtime-1",
			outcome: "completed",
			totalCostCents: 0,
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

		await consumeAgentSessionRequest(
			{ db, eventBus: new EventBus() },
			request,
			{ sandboxBasePath: "/tmp/au1-runtime-test" },
			ports,
		);

		expect(ports.sessionProvisioner.admitSession).toHaveBeenCalledWith(
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
		expect(ports.sessionProvisioner.runSession).toHaveBeenCalledOnce();
		const [row] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, request.id));
		expect(row).toMatchObject({ status: "completed", sessionId: "session-runtime-1" });
	});

	test("request is running before harness run starts", async ({ db }) => {
		const now = new Date().toISOString();
		await db.insert(teams).values({ id: "team-1", name: "Team", phase: "build", createdAt: now });
		await db
			.insert(teamMembers)
			.values({ id: "member-1", teamId: "team-1", capacity: 3, activeBets: 0, formedAt: now });
		await db.insert(users).values({
			id: "agent-1",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		});
		await db.insert(bets).values({
			id: "bet-1",
			teamId: "team-1",
			description: "Bet",
			status: "active",
			createdAt: now,
		});
		await db.insert(tasks).values({
			id: "task-1",
			betId: "bet-1",
			teamId: "team-1",
			title: "Task",
			state: "accepted",
			ownerAgentId: "agent-1",
			createdAt: now,
			updatedAt: now,
		});

		const ports = buildTestPorts();
		vi.mocked(ports.sessionProvisioner.admitSession).mockImplementation(async (_deps, params) => ({
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
		vi.mocked(ports.sessionProvisioner.runSession).mockImplementationOnce(async () => {
			const [row] = await db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.id, request.id));
			expect(row).toMatchObject({ status: "running", sessionId: "session-runtime-1" });
			return {
				sessionId: "session-runtime-1",
				outcome: "completed",
				totalCostCents: 0,
				taskId: "task-1",
				forceReturnCount: 0,
			};
		});

		await consumeAgentSessionRequest(
			{ db, eventBus: new EventBus() },
			request,
			{ sandboxBasePath: "/tmp/au1-runtime-test" },
			ports,
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
				assistantAgentId: "failure-agent",
			},
		});
		const ports = buildTestPorts();
		vi.mocked(ports.sessionProvisioner.admitSession).mockResolvedValue({
			sessionId: "failure-session",
			sessionContext: { taskId: null },
		});
		vi.mocked(ports.sessionProvisioner.runSession).mockRejectedValue(new Error("harness crashed"));

		await expect(
			consumeAgentSessionRequest(
				{ db, eventBus: new EventBus() },
				request,
				{ sandboxBasePath: "/tmp/au20-runtime-failure" },
				ports,
			),
		).rejects.toThrow("harness crashed");

		const [stored] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, request.id));
		expect(stored).toMatchObject({
			status: "failed",
			sessionId: "failure-session",
		});
		const facts = await db
			.select()
			.from(agentLifecycleInbox)
			.where(eq(agentLifecycleInbox.requestId, request.id));
		expect(facts).toHaveLength(1);
		expect(facts[0]).toMatchObject({ state: "failed", sessionId: "failure-session" });
	});
});
