/**
 * AU27 Increment 4 (Decision 2) — `consumeAgentSessionRequest`'s
 * `parseBakedTranscript` + `mapTranscriptToMessages` (relocated verbatim
 * from `dispatch/src/service.ts` as a pure orchestration-side formatting
 * helper) parse the drained request's baked raw transcript rows off
 * `payloadJson` and map them to generic chat messages onto
 * `provisionParams.transcript` — a JSON.parse + pure mapping of the
 * already-drained payload, ZERO orchestration -> core read.
 */
import { agentSessionRequests, type HyperIdleDb, tasks, teams, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { describe, vi } from "vitest";
import { runSession } from "../runtime.js";
import { buildTestPorts } from "./test-ports.js";

async function seedTaskFixture(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: "team-1", name: "Team", phase: "build", createdAt: now });
	await db.insert(users).values({
		id: "agent-1",
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: "bet-1",
		parentTaskId: null,
		teamId: "team-1",
		title: "Bet",
		description: "Bet",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(tasks).values({
		id: "task-1",
		parentTaskId: "bet-1",
		teamId: "team-1",
		title: "Task",
		state: "accepted",
		ownerAgentId: "agent-1",
		createdAt: now,
		updatedAt: now,
	});
}

async function createRequestForTest(
	db: HyperIdleDb,
	opts: { idempotencyKey: string; payloadJson?: string },
) {
	const now = new Date().toISOString();
	const [row] = await db
		.insert(agentSessionRequests)
		.values({
			id: `test-request-${opts.idempotencyKey}`,
			sourceKind: "task",
			sourceId: "task-1",
			streamId: "task:task-1",
			taskId: "task-1",
			agentId: "agent-1",
			teamId: "team-1",
			promptMode: "task",
			payloadJson: opts.payloadJson ?? null,
			idempotencyKey: opts.idempotencyKey,
			sourceCorrelationJson: JSON.stringify({ taskId: "task-1", teamId: "team-1" }),
			status: "pending",
			createdAt: now,
			updatedAt: now,
		})
		.returning();
	if (!row) throw new Error("Insert failed");
	return row;
}

describe("consumeAgentSessionRequest — baked transcript mapping (Increment 4)", () => {
	test("maps baked raw transcript rows to generic chat messages, keyed on the running agent's own id", async ({
		db,
	}) => {
		await seedTaskFixture(db);

		const ports = buildTestPorts();
		vi.mocked(ports.sessionProvisioner!.admitSession).mockImplementation(async (_deps, params) => ({
			sessionId: "session-transcript-1",
			sessionContext: { taskId: params.taskId },
		}));
		vi.mocked(ports.sessionProvisioner!.runSession).mockImplementation(async () => ({
			sessionId: "session-transcript-1",
			outcome: "completed",
			taskId: "task-1",
			forceReturnCount: 0,
		}));

		const rawTranscript = [
			{ senderId: "user-1", payload: JSON.stringify({ text: "hello" }), type: "plain" },
			{ senderId: "agent-1", payload: JSON.stringify({ text: "hi there" }), type: "plain" },
			// A notice-typed row must be filtered out (no `text` reply content).
			{ senderId: "agent-1", payload: JSON.stringify({ notice: "system" }), type: "plain" },
			// A non-"plain" row must be filtered out.
			{ senderId: "user-1", payload: JSON.stringify({ text: "verdict" }), type: "verdict" },
		];

		const request = await createRequestForTest(db, {
			idempotencyKey: "task:task-1:transcript",
			payloadJson: JSON.stringify({ transcript: rawTranscript }),
		});

		await runSession(
			{ db, eventBus: new EventBus(), ports } as unknown as import("../contracts.js").RuntimeDeps,
			{ mode: "durable", request, sandboxBasePath: "/tmp/au27-transcript-runtime" },
		);

		expect(ports.sessionProvisioner!.admitSession).toHaveBeenCalledWith(
			expect.any(Object),
			expect.objectContaining({
				transcript: [
					{ role: "user", content: "hello" },
					{ role: "assistant", content: "hi there" },
				],
			}),
		);
	});

	test("omits transcript when the drained payload carries none", async ({ db }) => {
		await seedTaskFixture(db);

		const ports = buildTestPorts();
		vi.mocked(ports.sessionProvisioner!.admitSession).mockImplementation(async (_deps, params) => ({
			sessionId: "session-transcript-2",
			sessionContext: { taskId: params.taskId },
		}));
		vi.mocked(ports.sessionProvisioner!.runSession).mockImplementation(async () => ({
			sessionId: "session-transcript-2",
			outcome: "completed",
			taskId: "task-1",
			forceReturnCount: 0,
		}));

		const request = await createRequestForTest(db, {
			idempotencyKey: "task:task-1:no-transcript",
		});

		await runSession(
			{ db, eventBus: new EventBus(), ports } as unknown as import("../contracts.js").RuntimeDeps,
			{ mode: "durable", request, sandboxBasePath: "/tmp/au27-transcript-runtime" },
		);

		const [, params] = vi.mocked(ports.sessionProvisioner!.admitSession).mock.calls[0] ?? [];
		expect(params).toBeDefined();
		expect((params as { transcript?: unknown }).transcript).toBeUndefined();
	});
});
