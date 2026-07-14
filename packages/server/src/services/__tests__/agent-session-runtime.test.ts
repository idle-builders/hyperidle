import {
	agentSessionRequests,
	bets,
	createTestDb,
	type TestDbHandle,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { createAgentSessionRequest } from "@hyperidle/session-requests";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { AdapterPool } from "../../harness/adapter-pool.js";
import type { SandboxAdapter } from "../../harness/sandbox-adapter.js";
import { consumeAgentSessionRequest } from "../agent-session-runtime.js";
import { admitSession, runSession } from "../session-provisioning.js";

vi.mock("../session-provisioning.js", () => ({
	admitSession: vi.fn(async (_deps, params) => ({
		sessionId: "session-runtime-1",
		sessionContext: {
			sessionId: "session-runtime-1",
			agentId: params.agentId,
			taskId: params.taskId,
			sandboxPath: "/tmp/au1-runtime-test/session-runtime-1",
			ingestion: { dispose: vi.fn() },
			traceId: "trace-runtime-1",
			requestContext: params.requestContext,
		},
	})),
	runSession: vi.fn(async () => ({
		sessionId: "session-runtime-1",
		outcome: "completed",
		totalCostCents: 0,
		taskId: "task-1",
		forceReturnCount: 0,
	})),
}));

describe("agent session runtime consumer", () => {
	let handle: TestDbHandle;

	beforeEach(async () => {
		handle = await createTestDb();
		const now = new Date().toISOString();
		await handle.db
			.insert(teams)
			.values({ id: "team-1", name: "Team", phase: "build", createdAt: now });
		await handle.db
			.insert(teamMembers)
			.values({ id: "member-1", teamId: "team-1", capacity: 3, activeBets: 0, formedAt: now });
		await handle.db.insert(users).values({
			id: "agent-1",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		});
		await handle.db.insert(bets).values({
			id: "bet-1",
			teamId: "team-1",
			description: "Bet",
			status: "active",
			createdAt: now,
		});
		await handle.db.insert(tasks).values({
			id: "task-1",
			betId: "bet-1",
			teamId: "team-1",
			title: "Task",
			state: "accepted",
			ownerAgentId: "agent-1",
			createdAt: now,
			updatedAt: now,
		});
		vi.clearAllMocks();
	});

	afterEach(async () => {
		await handle.close();
	});

	test("consumeAgentSessionRequest claims request, marks running before runSession, and marks terminal", async () => {
		const request = await createAgentSessionRequest(handle.db, {
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
			{
				db: handle.db,
				eventBus: new EventBus(),
				adapterPool: {} as AdapterPool,
				workspace: {} as SandboxAdapter,
			},
			request,
			{ sandboxBasePath: "/tmp/au1-runtime-test" },
		);

		expect(admitSession).toHaveBeenCalledWith(
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
		expect(runSession).toHaveBeenCalledOnce();
		const [row] = await handle.db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, request.id));
		expect(row).toMatchObject({ status: "completed", sessionId: "session-runtime-1" });
	});

	test("request is running before harness run starts", async () => {
		const request = await createAgentSessionRequest(handle.db, {
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
		vi.mocked(runSession).mockImplementationOnce(async () => {
			const [row] = await handle.db
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
			{
				db: handle.db,
				eventBus: new EventBus(),
				adapterPool: {} as AdapterPool,
				workspace: {} as SandboxAdapter,
			},
			request,
			{ sandboxBasePath: "/tmp/au1-runtime-test" },
		);
	});
});
