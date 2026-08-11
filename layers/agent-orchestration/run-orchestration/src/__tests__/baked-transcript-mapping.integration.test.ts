/**
 * AU27 Increment 4 (Decision 2) — `consumeAgentSessionRequest`'s
 * `parseBakedTranscript` + `mapTranscriptToMessages` (relocated verbatim
 * from `dispatch/src/service.ts` as a pure orchestration-side formatting
 * helper) parse the drained request's baked raw transcript rows off
 * `payloadJson` and map them to generic chat messages onto
 * `provisionParams.transcript` — a JSON.parse + pure mapping of the
 * already-drained payload, ZERO orchestration -> core read.
 */
import { bets, type HyperIdleDb, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { expect, test, type ScopedIds } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { createSessionRequest } from "@hyperidle/session-requests";
import { describe, vi } from "vitest";
import { runSession } from "../runtime.js";
import { buildTestPorts } from "./test-ports.js";

async function seedTaskFixture(db: HyperIdleDb, ids: ScopedIds): Promise<void> {
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
}

describe("consumeAgentSessionRequest — baked transcript mapping (Increment 4)", () => {
	test("maps baked raw transcript rows to generic chat messages, keyed on the running agent's own id", async ({
		db,
		ids,
	}) => {
		await seedTaskFixture(db, ids);

		const ports = buildTestPorts();
		vi.mocked(ports.sessionProvisioner!.admitSession).mockImplementation(async (_deps, params) => ({
			sessionId: ids("session-transcript-1"),
			sessionContext: { taskId: params.taskId },
		}));
		vi.mocked(ports.sessionProvisioner!.runSession).mockImplementation(async () => ({
			sessionId: ids("session-transcript-1"),
			outcome: "completed",
			taskId: ids("task-1"),
			forceReturnCount: 0,
		}));

		// @lore AU38: the mapping keys sender→role off the running agent's OWN id,
		// so the transcript senderIds must resolve identically to the arranged ids.
		const rawTranscript = [
			{ senderId: ids("user-1"), payload: JSON.stringify({ text: "hello" }), type: "plain" },
			{ senderId: ids("agent-1"), payload: JSON.stringify({ text: "hi there" }), type: "plain" },
			// A notice-typed row must be filtered out (no `text` reply content).
			{ senderId: ids("agent-1"), payload: JSON.stringify({ notice: "system" }), type: "plain" },
			// A non-"plain" row must be filtered out.
			{ senderId: ids("user-1"), payload: JSON.stringify({ text: "verdict" }), type: "verdict" },
		];

		const request = await createSessionRequest(db, {
			kind: "direct",
			request: {
				sourceKind: "task",
				sourceId: ids("task-1"),
				streamId: `task:${ids("task-1")}`,
				taskId: ids("task-1"),
				agentId: ids("agent-1"),
				teamId: ids("team-1"),
				promptMode: "task",
				idempotencyKey: ids("task:task-1:transcript"),
				sourceCorrelation: { taskId: ids("task-1"), teamId: ids("team-1") },
				payloadJson: JSON.stringify({ transcript: rawTranscript }),
			},
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

	test("omits transcript when the drained payload carries none", async ({ db, ids }) => {
		await seedTaskFixture(db, ids);

		const ports = buildTestPorts();
		vi.mocked(ports.sessionProvisioner!.admitSession).mockImplementation(async (_deps, params) => ({
			sessionId: ids("session-transcript-2"),
			sessionContext: { taskId: params.taskId },
		}));
		vi.mocked(ports.sessionProvisioner!.runSession).mockImplementation(async () => ({
			sessionId: ids("session-transcript-2"),
			outcome: "completed",
			taskId: ids("task-1"),
			forceReturnCount: 0,
		}));

		const request = await createSessionRequest(db, {
			kind: "direct",
			request: {
				sourceKind: "task",
				sourceId: ids("task-1"),
				streamId: `task:${ids("task-1")}`,
				taskId: ids("task-1"),
				agentId: ids("agent-1"),
				teamId: ids("team-1"),
				promptMode: "task",
				idempotencyKey: ids("task:task-1:no-transcript"),
				sourceCorrelation: { taskId: ids("task-1"), teamId: ids("team-1") },
			},
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
