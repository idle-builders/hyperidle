import { bets, sessions, tasks, teamMembers, teams, threads, users } from "@hyperidle/db";
import { beforeEach, describe } from "vitest";
import {
	clearDeduplicationCache,
	getDedupCacheSize,
	recordCostAndCheck,
	registerCostCapDedupReleaser,
} from "../services/cost-cap.js";
import { type HandoffMetadata, handoff } from "../services/handoff-protocol.js";
import type { SessionContext } from "../services/session-lifecycle.js";
import { expect, test } from "../test-fixtures.js";

/**
 * I3 review C1 / arch H-1: every session-end code path must reclaim the
 * cost-cap dedup-map entry. The wiring lives in two places:
 *  - `app.ts` subscribes `registerCostCapDedupReleaser(eventBus)` to
 *    `session_ended`, covering `endSession`, `crashSession`, AND any
 *    HTTP path that emits `session_ended` (e.g. PATCH /sessions/:id).
 *  - `handoff-protocol.ts` deliberately suppresses `session_ended` (see
 *    in-file comment) so it calls `releaseSessionDedup` directly after
 *    its transaction commits.
 *
 * These tests exercise both delivery routes against a real DB + bus.
 */

const NOW = new Date().toISOString();

async function seed(db: import("@hyperidle/db").HyperIdleDb): Promise<void> {
	await db.insert(teams).values({ id: "p1", name: "P1", phase: "build", createdAt: NOW });
	await db.insert(teamMembers).values({
		id: "t1",
		teamId: "p1",
		capacity: 5,
		activeBets: 0,
		costCap: 1_000_000,
		costActual: 0,
		formedAt: NOW,
	});

	await db.insert(users).values({
		id: "a1",
		name: "A1",
		role: "builder",
		status: "active",
		maxConcurrentSessions: 1,
		teamId: "t1",
		costCap: 100,
		costActual: 0,
		createdAt: NOW,
	});

	await db.insert(users).values({
		id: "a2",
		name: "A2",
		role: "builder",
		status: "active",
		maxConcurrentSessions: 1,
		teamId: "t1",
		costCap: 100,
		costActual: 0,
		createdAt: NOW,
	});

	await db.insert(bets).values({
		id: "b1",
		teamId: "p1",
		description: "x",
		appetite: "small",
		status: "active",
		createdAt: NOW,
	});

	const taskThreadId = "thread-task-1";
	await db.insert(threads).values({
		id: taskThreadId,
		hostKind: "task",
		hostId: "task-1",
		initiatorId: "agent-1",
		participants: JSON.stringify(["agent-1"]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});

	await db.insert(tasks).values({
		id: "task-1",
		betId: "b1",
		teamId: "p1",
		ownerAgentId: "a1",
		title: "T1",
		state: "in_progress",
		threadId: taskThreadId,
		createdAt: NOW,
		updatedAt: NOW,
	});

	await db.insert(sessions).values({
		id: "sess-1",
		taskId: "task-1",
		agentId: "a1",
		modelTier: "workhorse",
		startedAt: NOW,
		state: "active",
	});
}

describe("I3 review C1: session_ended releases cost-cap dedup", () => {
	beforeEach(async () => {
		clearDeduplicationCache();
	});

	test("emitting session_ended on the bus drops the per-session dedup entry", async ({
		db,
		eventBus,
	}) => {
		// Subscribe the cost-cap releaser so emitting session_ended
		// reclaims the dedup entry — same wiring `createApp` performs.
		const unsubscribe = registerCostCapDedupReleaser(eventBus);
		await seed(db);

		await recordCostAndCheck(db, eventBus, {
			sessionId: "sess-1",
			cost: 200, // breaches the 100 cap
			agentId: "a1",
			teamId: "t1",
		});
		expect(getDedupCacheSize()).toBeGreaterThan(0);

		eventBus.emit({
			type: "session_ended",
			streamId: "sess-1",
			sessionId: "sess-1",
			agentId: "a1",
			taskId: "task-1",
			timestamp: Date.now(),
			outcome: "completed",
		});

		expect(getDedupCacheSize()).toBe(0);

		unsubscribe();
	});

	test("handoff() releases the dedup entry post-transaction without emitting session_ended", async ({
		db,
		eventBus,
	}) => {
		const unsubscribe = registerCostCapDedupReleaser(eventBus);
		await seed(db);

		// Pre-seed dedup state for sess-1.
		await recordCostAndCheck(db, eventBus, {
			sessionId: "sess-1",
			cost: 200,
			agentId: "a1",
			teamId: "t1",
		});
		expect(getDedupCacheSize()).toBeGreaterThan(0);

		// Spy: handoff MUST NOT emit session_ended.
		const sessionEnded: unknown[] = [];
		eventBus.on("session_ended", (e: unknown) => sessionEnded.push(e));

		const ctx: SessionContext = {
			sessionId: "sess-1",
			agentId: "a1",
			taskId: "task-1",
			sandboxPath: "/tmp/test",
			ingestion: { dispose: () => {} } as SessionContext["ingestion"],
			traceId: "trace-1",
		};
		const metadata: HandoffMetadata = {
			context_id: "ctx-1",
			status: "in_progress",
			reason: "passing the baton",
			artifacts: [],
			remaining_work: [],
		};
		await handoff(db, eventBus, {
			sessionContext: ctx,
			toAgent: "a2",
			metadata,
		});

		expect(sessionEnded).toHaveLength(0);
		expect(getDedupCacheSize()).toBe(0);

		unsubscribe();
	});
});
