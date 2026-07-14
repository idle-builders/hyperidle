/**
 * @lore AU19 Increment 3b: moved from
 * `packages/server/src/services/__tests__/agent-session-requests.test.ts` —
 * this test only needs `{ db }` (no `{ app }`), so it moves into the owning
 * package's own `src/__tests__/` and switches its fixture import from
 * `packages/server`'s `{ db, app, eventBus }` fixture to
 * `@hyperidle/db/test-fixtures`'s `{ db }`-only fixture, same precedent as
 * `@hyperidle/org`'s `org-edges.integration.test.ts` (Increment 1c). Renamed
 * `.test.ts` → `.integration.test.ts` to match the DB-fixture test-naming
 * convention every other migrated package's DB-touching test follows.
 *
 * `markRequestRunning` now takes a `MarkRequestRunningDeps` param (the
 * `SessionRequestsTriggerHistoryWriter` port, §11/`ports.ts`) — this test
 * supplies a no-op fake (it asserts on `agent_session_requests`'
 * status/session-id transition only, never on `trigger_resolution_history`,
 * which this test never seeds a row for).
 */

import { agentSessionRequests, bets, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import {
	claimNextAgentSessionRequest,
	createAgentSessionRequest,
	markRequestRunning,
} from "../agent-session-requests.js";
import type { MarkRequestRunningDeps } from "../ports.js";

const noopMarkRequestRunningDeps: MarkRequestRunningDeps = {
	triggerHistory: {
		recordSessionForResolutionHistory: async () => {},
	},
};

describe("agent session request repository", () => {
	test("createAgentSessionRequest is idempotent by source/action key", async ({ db }) => {
		const now = new Date().toISOString();
		await db.insert(teams).values({ id: "team-1", name: "Team", phase: "build", createdAt: now });
		await db.insert(teamMembers).values({
			id: "members-1",
			teamId: "team-1",
			capacity: 3,
			activeBets: 0,
			formedAt: now,
		});
		await db.insert(users).values([
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
			createdAt: now,
			updatedAt: now,
		});

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

		const first = await createAgentSessionRequest(db, input);
		const second = await createAgentSessionRequest(db, input);

		expect(second.id).toBe(first.id);
		const rows = await db.select().from(agentSessionRequests);
		expect(rows).toHaveLength(1);
	});

	test("createAgentSessionRequest returns the existing row under concurrent duplicate creates", async ({
		db,
	}) => {
		const now = new Date().toISOString();
		await db.insert(teams).values({ id: "team-2", name: "Team", phase: "build", createdAt: now });
		await db.insert(teamMembers).values({
			id: "members-2",
			teamId: "team-2",
			capacity: 3,
			activeBets: 0,
			formedAt: now,
		});
		await db.insert(users).values({
			id: "agent-2",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		});
		await db.insert(bets).values({
			id: "bet-2",
			teamId: "team-2",
			description: "Bet",
			status: "active",
			createdAt: now,
		});
		await db.insert(tasks).values({
			id: "task-2",
			betId: "bet-2",
			teamId: "team-2",
			title: "Task",
			state: "accepted",
			createdAt: now,
			updatedAt: now,
		});

		const input = {
			sourceKind: "task" as const,
			sourceId: "task-2",
			streamId: "task:task-2",
			taskId: "task-2",
			teamId: "team-2",
			agentId: "agent-2",
			promptMode: "task" as const,
			idempotencyKey: "task:task-2:accepted",
			sourceCorrelation: { taskId: "task-2", teamId: "team-2" },
		};

		const results = await Promise.all(
			Array.from({ length: 8 }, () => createAgentSessionRequest(db, input)),
		);

		expect(new Set(results.map((r) => r.id)).size).toBe(1);
		const rows = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.sourceId, "task-2"));
		expect(rows).toHaveLength(1);
	});

	test("claimNextAgentSessionRequest claims exactly one pending request", async ({ db }) => {
		const now = new Date().toISOString();
		await db.insert(teams).values({ id: "team-3", name: "Team", phase: "build", createdAt: now });
		await db.insert(teamMembers).values({
			id: "members-3",
			teamId: "team-3",
			capacity: 3,
			activeBets: 0,
			formedAt: now,
		});
		await db.insert(users).values([
			{
				id: "agent-3",
				kind: "ai",
				name: "Agent",
				role: "builder",
				status: "active",
				createdAt: now,
			},
			{
				id: "user-3",
				kind: "human",
				name: "User",
				role: "founder",
				status: "active",
				createdAt: now,
			},
		]);

		await createAgentSessionRequest(db, {
			sourceKind: "assistant",
			sourceId: "msg-3",
			streamId: "thread:thread-3",
			agentId: "agent-3",
			userId: "user-3",
			promptMode: "conversation",
			idempotencyKey: "assistant:msg-3",
			sourceCorrelation: {
				threadId: "thread-3",
				messageId: "msg-3",
				userId: "user-3",
				assistantAgentId: "agent-3",
			},
		});

		const [claimed, second] = await Promise.all([
			claimNextAgentSessionRequest(db, "worker-1", {
				now: new Date("2026-07-08T12:00:00.000Z"),
				leaseMs: 30_000,
			}),
			claimNextAgentSessionRequest(db, "worker-2", {
				now: new Date("2026-07-08T12:00:00.000Z"),
				leaseMs: 30_000,
			}),
		]);

		const winners = [claimed, second].filter((request) => request !== null);
		expect(winners).toHaveLength(1);
		expect(winners[0]?.status).toBe("claimed");

		await markRequestRunning(db, winners[0]!.id, "session-1", noopMarkRequestRunningDeps);
		const [row] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, winners[0]!.id));
		expect(row?.status).toBe("running");
		expect(row?.sessionId).toBe("session-1");
	});
});
