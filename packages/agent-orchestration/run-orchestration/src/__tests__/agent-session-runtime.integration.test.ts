/**
 * @lore AU19 Increment 3c: real cut-over — moved here from
 * `packages/server/src/services/__tests__/agent-session-runtime.test.ts`.
 * See `agent-run-boundary.integration.test.ts`'s top `@lore` for the
 * fixture-conversion + port-injection rationale (same shape).
 */
import { agentSessionRequests, bets, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { createAgentSessionRequest } from "@hyperidle/session-requests";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { describe, vi } from "vitest";
import { consumeAgentSessionRequest } from "../agent-session-runtime.js";
import { buildTestPorts } from "./test-ports.js";

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

		const request = await createAgentSessionRequest(db, {
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

		const request = await createAgentSessionRequest(db, {
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
});
