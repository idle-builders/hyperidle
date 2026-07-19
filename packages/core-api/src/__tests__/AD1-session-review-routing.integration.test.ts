/**
 * AD1 RED — Wire Review Routing to Humans: session-review-creator routing tests.
 *
 * These tests FAIL until:
 *  - resolveReviewRecipients is wired into session-review-creator.ts
 *  - When session ends for medium/high risk task, the review thread participants
 *    include human reviewers from org_edges (using task.teamId for routing)
 *  - When no org_edges match, ALL human users are added as participants (fallback)
 *
 * AC: When a founder queries their conversation queue, review threads created
 *     by their team's agents appear in the list (humans are participants).
 */

import { findThread, insertThread, updateThread } from "@hyperidle/conversation";
import type { WriteExecutor } from "@hyperidle/db";
import {
	bets,
	createTestDb,
	type HyperIdleDb,
	items,
	orgEdges,
	sessions,
	type TestDbHandle,
	taskPlanningSignals,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { resolveReviewRecipients } from "@hyperidle/org";
import { type ReviewPorts, registerReviewSubscriptions } from "@hyperidle/review";
import type { SessionEndedEvent } from "@hyperidle/shared";
import { EventBus } from "@hyperidle/shared";
import { findUser, listUsers } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { getTaskRiskTierByTaskId } from "@hyperidle/work";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordAgentWorkIntent } from "../services/session-requests-bindings.js";

/**
 * @lore AU19 Increment 1j: `registerReviewSubscriptions` now takes injected
 * `work`/`conversation`/`users`/`org` ports (Mechanism C — `review` never
 * imports another Service). This test builds the exact same production
 * wiring `server-factory.ts` uses — no behavior change.
 *
 * @lore AU19 Increment 1k: `taskRiskTier` ADDED — wired to `work`'s real
 * `getTaskRiskTierByTaskId`, replacing the direct `taskStrategyFabric` table
 * seed/query this test used before AU3's half-done rename was finished.
 */
const reviewDeps: ReviewPorts = {
	work: {
		getTaskById: (exec: WriteExecutor, id: string) => work.get(exec, "task", id),
		updateTaskById: (exec: WriteExecutor, id: string, patch) =>
			work.update(exec, "task", id, patch),
		createItem: (exec: WriteExecutor, values) => work.create(exec, "item", values),
		getRiskTierByTaskId: getTaskRiskTierByTaskId,
	},
	conversation: { insertThread, getThreadById: (db, id) => findThread(db, { id }), updateThread },
	users: {
		getUserById: (db, id) => findUser(db, { id }),
		listUsersByKind: (db, kind) => listUsers(db, { kind }),
	},
	org: { resolveReviewRecipients },
	intentRecorder: { record: recordAgentWorkIntent },
};

const NOW = new Date().toISOString();

async function seedBase(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({
		id: "team-src",
		name: "Source Team",
		phase: "build",
		createdAt: NOW,
	});
	await db.insert(teamMembers).values({
		id: "tm-src",
		teamId: "team-src",
		capacity: 3,
		activeBets: 0,
		formedAt: NOW,
	});
	await db.insert(bets).values({
		id: "bet-src",
		teamId: "team-src",
		description: "Source bet",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: "agent-src",
		kind: "ai",
		name: "Source Agent",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
}

describe("AD1 — session-review-creator: human participants added to review thread", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		await seedBase(db);
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await handle?.close();
	});

	// -------------------------------------------------------------------------
	// AC: review thread includes human reviewer via org_edges (team mechanism)
	// -------------------------------------------------------------------------
	describe("AC: review thread includes matched human reviewer", () => {
		it("adds human reviewer to thread participants via team org_edge", async () => {
			// Seed human reviewer
			await db.insert(users).values({
				id: "founder-src",
				kind: "human",
				name: "Source Founder",
				role: "founder",
				status: "active",
				createdAt: NOW,
			});

			// Unrelated human — should NOT be in thread (edge matched)
			await db.insert(users).values({
				id: "unrelated-founder",
				kind: "human",
				name: "Unrelated Founder",
				role: "founder",
				status: "active",
				createdAt: NOW,
			});

			// Team org_edge: founder-src reviews team-src
			await db.insert(orgEdges).values({
				id: "edge-team-src",
				fromUserId: "founder-src",
				mechanism: "team",
				target: "team-src",
				createdAt: NOW,
			});

			// Seed task (high risk, belongs to team-src)
			await db.insert(tasks).values({
				id: "task-src-high",
				betId: "bet-src",
				teamId: "team-src",
				ownerAgentId: "agent-src",
				title: "High risk task with team edge",
				state: "in_progress",
				createdAt: NOW,
				updatedAt: NOW,
			});
			await db
				.insert(taskPlanningSignals)
				.values({ id: "tsf-src-high", taskId: "task-src-high", riskTier: "high" });
			await db.insert(sessions).values({
				id: "session-src-high",
				taskId: "task-src-high",
				agentId: "agent-src",
				modelTier: "capable",
				startedAt: NOW,
				state: "ended",
				outcome: "success",
			});

			const unsubscribe = registerReviewSubscriptions(db, eventBus, reviewDeps);

			const event: SessionEndedEvent = {
				type: "session_ended",
				streamId: "stream-src",
				sessionId: "session-src-high",
				agentId: "agent-src",
				taskId: "task-src-high",
				timestamp: Date.now(),
				outcome: "completed",
			};
			eventBus.emit(event);

			// Wait for async handler to complete
			await vi.waitFor(async () => {
				const createdItems = await db.select().from(items);
				expect(createdItems).toHaveLength(1);
			});

			const allThreads = await db.select().from(threads);
			expect(allThreads).toHaveLength(1);
			// biome-ignore lint/style/noNonNullAssertion: thread must exist
			const participants: string[] = JSON.parse(allThreads[0]!.participants);

			// founder-src matched via team edge → must be in participants
			expect(participants).toContain("founder-src");
			// unrelated-founder should NOT be in participants (edge matched, no fallback)
			expect(participants).not.toContain("unrelated-founder");

			unsubscribe();
		});
	});

	// -------------------------------------------------------------------------
	// AC: fallback — all humans added when no org_edges match
	// -------------------------------------------------------------------------
	describe("AC: fallback — all human users added when no org_edges match", () => {
		it("adds all human users to thread participants when no org_edges exist", async () => {
			// Seed two human reviewers (no org_edges)
			await db.insert(users).values([
				{
					id: "fallback-h1",
					kind: "human",
					name: "Fallback Human 1",
					role: "founder",
					status: "active",
					createdAt: NOW,
				},
				{
					id: "fallback-h2",
					kind: "human",
					name: "Fallback Human 2",
					role: "founder",
					status: "active",
					createdAt: NOW,
				},
			]);

			await db.insert(tasks).values({
				id: "task-fallback",
				betId: "bet-src",
				teamId: "team-src",
				ownerAgentId: "agent-src",
				title: "Fallback task",
				state: "in_progress",
				createdAt: NOW,
				updatedAt: NOW,
			});
			await db
				.insert(taskPlanningSignals)
				.values({ id: "tsf-fallback", taskId: "task-fallback", riskTier: "medium" });
			await db.insert(sessions).values({
				id: "session-fallback",
				taskId: "task-fallback",
				agentId: "agent-src",
				modelTier: "capable",
				startedAt: NOW,
				state: "ended",
				outcome: "partial",
			});

			const unsubscribe = registerReviewSubscriptions(db, eventBus, reviewDeps);

			const event: SessionEndedEvent = {
				type: "session_ended",
				streamId: "stream-fallback",
				sessionId: "session-fallback",
				agentId: "agent-src",
				taskId: "task-fallback",
				timestamp: Date.now(),
				outcome: "completed",
			};
			eventBus.emit(event);

			await vi.waitFor(async () => {
				const createdItems = await db.select().from(items);
				expect(createdItems).toHaveLength(1);
			});

			const allThreads = await db.select().from(threads);
			expect(allThreads).toHaveLength(1);
			// biome-ignore lint/style/noNonNullAssertion: thread must exist
			const participants: string[] = JSON.parse(allThreads[0]!.participants);

			// Both human users must be in participants (fallback)
			expect(participants).toContain("fallback-h1");
			expect(participants).toContain("fallback-h2");
			// AI agent (non-human) should NOT be added via fallback
			// agent-src is the initiator so it IS in participants, but fallback only adds humans

			unsubscribe();
		});
	});

	// -------------------------------------------------------------------------
	// AC: participants are sorted and deduplicated
	// -------------------------------------------------------------------------
	describe("AC: thread participants are sorted and deduplicated", () => {
		it("deduplicates and sorts participants when routing adds humans", async () => {
			await db.insert(users).values({
				id: "zzz-founder",
				kind: "human",
				name: "ZZZ Founder",
				role: "founder",
				status: "active",
				createdAt: NOW,
			});

			await db.insert(tasks).values({
				id: "task-sort",
				betId: "bet-src",
				teamId: "team-src",
				ownerAgentId: "agent-src",
				title: "Sort test task",
				state: "in_progress",
				createdAt: NOW,
				updatedAt: NOW,
			});
			await db
				.insert(taskPlanningSignals)
				.values({ id: "tsf-sort", taskId: "task-sort", riskTier: "high" });
			await db.insert(sessions).values({
				id: "session-sort",
				taskId: "task-sort",
				agentId: "agent-src",
				modelTier: "capable",
				startedAt: NOW,
				state: "ended",
			});

			const unsubscribe = registerReviewSubscriptions(db, eventBus, reviewDeps);

			const event: SessionEndedEvent = {
				type: "session_ended",
				streamId: "stream-sort",
				sessionId: "session-sort",
				agentId: "agent-src",
				taskId: "task-sort",
				timestamp: Date.now(),
				outcome: "completed",
			};
			eventBus.emit(event);

			await vi.waitFor(async () => {
				const createdItems = await db.select().from(items);
				expect(createdItems).toHaveLength(1);
			});

			const allThreads = await db.select().from(threads);
			// biome-ignore lint/style/noNonNullAssertion: thread must exist
			const participants: string[] = JSON.parse(allThreads[0]!.participants);

			// No duplicates
			const unique = new Set(participants);
			expect(unique.size).toBe(participants.length);
			// Sorted
			const sorted = [...participants].sort();
			expect(participants).toEqual(sorted);

			unsubscribe();
		});
	});
});
