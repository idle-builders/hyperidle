/**
 * AU27 Increment 1 (Decision 1) — `consumeAgentSessionRequest`'s
 * `parseBakedCallingThreadId` parses `callingThreadId` off the drained
 * request's `payloadJson` (the same generic pass-through column
 * `transcript`/`modelId`/`contextBundle`/`agentConfig` already ride) and
 * forwards it onto `provisionParams.callingThreadId` — a JSON.parse of the
 * already-drained payload, ZERO orchestration -> core read (AU21 AC #2).
 */
import { bets, type HyperIdleDb, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { createSessionRequest } from "@hyperidle/session-requests";
import { EventBus } from "@hyperidle/shared";
import { describe, vi } from "vitest";
import { runSession } from "../runtime.js";
import { buildTestPorts } from "./test-ports.js";

async function seedTaskFixture(db: HyperIdleDb): Promise<void> {
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
}

describe("consumeAgentSessionRequest — callingThreadId bake (Increment 1)", () => {
	test("parses callingThreadId off the drained request's payloadJson onto provisionParams", async ({
		db,
	}) => {
		await seedTaskFixture(db);

		const ports = buildTestPorts();
		vi.mocked(ports.sessionProvisioner!.admitSession).mockImplementation(async (_deps, params) => ({
			sessionId: "session-calling-thread-1",
			sessionContext: { taskId: params.taskId },
		}));
		vi.mocked(ports.sessionProvisioner!.runSession).mockImplementation(async () => ({
			sessionId: "session-calling-thread-1",
			outcome: "completed",
			taskId: "task-1",
			forceReturnCount: 0,
		}));

		const request = await createSessionRequest(db, {
			kind: "direct",
			request: {
				sourceKind: "task",
				sourceId: "task-1",
				streamId: "task:task-1",
				taskId: "task-1",
				agentId: "agent-1",
				teamId: "team-1",
				promptMode: "task",
				idempotencyKey: "task:task-1:calling-thread",
				sourceCorrelation: { taskId: "task-1", teamId: "team-1" },
				payloadJson: JSON.stringify({ callingThreadId: "thread-calling-1" }),
			},
		});

		await runSession(
			{ db, eventBus: new EventBus(), ports } as unknown as import("../contracts.js").RuntimeDeps,
			{ mode: "durable", request, sandboxBasePath: "/tmp/au27-calling-thread-runtime" },
		);

		expect(ports.sessionProvisioner!.admitSession).toHaveBeenCalledWith(
			expect.any(Object),
			expect.objectContaining({ callingThreadId: "thread-calling-1" }),
		);
	});

	test("omits callingThreadId when the drained payload carries none (e.g. routine_run)", async ({
		db,
	}) => {
		await seedTaskFixture(db);

		const ports = buildTestPorts();
		vi.mocked(ports.sessionProvisioner!.admitSession).mockImplementation(async (_deps, params) => ({
			sessionId: "session-calling-thread-2",
			sessionContext: { taskId: params.taskId },
		}));
		vi.mocked(ports.sessionProvisioner!.runSession).mockImplementation(async () => ({
			sessionId: "session-calling-thread-2",
			outcome: "completed",
			taskId: "task-1",
			forceReturnCount: 0,
		}));

		const request = await createSessionRequest(db, {
			kind: "direct",
			request: {
				sourceKind: "task",
				sourceId: "task-1",
				streamId: "task:task-1",
				taskId: "task-1",
				agentId: "agent-1",
				teamId: "team-1",
				promptMode: "task",
				idempotencyKey: "task:task-1:no-calling-thread",
				sourceCorrelation: { taskId: "task-1", teamId: "team-1" },
			},
		});

		await runSession(
			{ db, eventBus: new EventBus(), ports } as unknown as import("../contracts.js").RuntimeDeps,
			{ mode: "durable", request, sandboxBasePath: "/tmp/au27-calling-thread-runtime" },
		);

		const [, params] = vi.mocked(ports.sessionProvisioner!.admitSession).mock.calls[0] ?? [];
		expect(params).toBeDefined();
		expect((params as { callingThreadId?: string }).callingThreadId).toBeUndefined();
	});
});
