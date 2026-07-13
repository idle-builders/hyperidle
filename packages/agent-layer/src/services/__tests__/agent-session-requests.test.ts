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
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
	claimNextAgentSessionRequest,
	createAgentSessionRequest,
	markRequestRunning,
} from "../agent-session-requests.js";

describe("agent session request repository", () => {
	let handle: TestDbHandle;

	beforeEach(async () => {
		handle = await createTestDb();
		const now = new Date().toISOString();
		await handle.db
			.insert(teams)
			.values({ id: "team-1", name: "Team", phase: "build", createdAt: now });
		await handle.db
			.insert(teamMembers)
			.values({ id: "members-1", teamId: "team-1", capacity: 3, activeBets: 0, formedAt: now });
		await handle.db.insert(users).values([
			{
				id: "agent-1",
				kind: "ai",
				name: "Agent",
				role: "builder",
				status: "active",
				createdAt: now,
			},
			{
				id: "user-1",
				kind: "human",
				name: "User",
				role: "founder",
				status: "active",
				createdAt: now,
			},
		]);
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
			createdAt: now,
			updatedAt: now,
		});
	});

	afterEach(async () => {
		await handle.close();
	});

	test("createAgentSessionRequest is idempotent by source/action key", async () => {
		const input = {
			sourceKind: "task" as const,
			sourceId: "task-1",
			streamId: "task:task-1",
			taskId: "task-1",
			teamId: "team-1",
			agentId: "agent-1",
			promptMode: "task" as const,
			idempotencyKey: "task:task-1:accepted",
			sourceCorrelation: { taskId: "task-1", teamId: "team-1" },
		};

		const first = await createAgentSessionRequest(handle.db, input);
		const second = await createAgentSessionRequest(handle.db, input);

		expect(second.id).toBe(first.id);
		const rows = await handle.db.select().from(agentSessionRequests);
		expect(rows).toHaveLength(1);
	});

	test("createAgentSessionRequest returns the existing row under concurrent duplicate creates", async () => {
		const input = {
			sourceKind: "task" as const,
			sourceId: "task-1",
			streamId: "task:task-1",
			taskId: "task-1",
			teamId: "team-1",
			agentId: "agent-1",
			promptMode: "task" as const,
			idempotencyKey: "task:task-1:accepted",
			sourceCorrelation: { taskId: "task-1", teamId: "team-1" },
		};

		const results = await Promise.all(
			Array.from({ length: 8 }, () => createAgentSessionRequest(handle.db, input)),
		);

		expect(new Set(results.map((r) => r.id)).size).toBe(1);
		const rows = await handle.db.select().from(agentSessionRequests);
		expect(rows).toHaveLength(1);
	});

	test("claimNextAgentSessionRequest claims exactly one pending request", async () => {
		await createAgentSessionRequest(handle.db, {
			sourceKind: "assistant",
			sourceId: "msg-1",
			streamId: "thread:thread-1",
			agentId: "agent-1",
			userId: "user-1",
			promptMode: "conversation",
			idempotencyKey: "assistant:msg-1",
			sourceCorrelation: {
				threadId: "thread-1",
				messageId: "msg-1",
				userId: "user-1",
				assistantAgentId: "agent-1",
			},
		});

		const [claimed, second] = await Promise.all([
			claimNextAgentSessionRequest(handle.db, "worker-1", {
				now: new Date("2026-07-08T12:00:00.000Z"),
				leaseMs: 30_000,
			}),
			claimNextAgentSessionRequest(handle.db, "worker-2", {
				now: new Date("2026-07-08T12:00:00.000Z"),
				leaseMs: 30_000,
			}),
		]);

		const winners = [claimed, second].filter((request) => request !== null);
		expect(winners).toHaveLength(1);
		expect(winners[0]?.status).toBe("claimed");

		await markRequestRunning(handle.db, winners[0]!.id, "session-1");
		const [row] = await handle.db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, winners[0]!.id));
		expect(row?.status).toBe("running");
		expect(row?.sessionId).toBe("session-1");
	});
});
