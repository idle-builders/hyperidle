/**
 * `submit_review`'s thread anchoring. Founder ruling 7: a review lands in
 * the thread the task already has, or a new one attached to the task —
 * NEVER the bet, because tasks will exist without bets. The resolution:
 * `getFirstThreadByHost("task", ctx.taskId, …)`, else
 * `insertThread({hostKind:"task", hostId: ctx.taskId, …})` seeding the human
 * as a participant (the same shape `findSoleHumanUser` already gives
 * `reply`'s own no-calling-thread fallback, `tool-definitions.ts`).
 *
 * Every assertion below is checked against the PERSISTED row (the
 * `threads`/`messages` tables), never only `result.success` — a
 * success-flag-only assertion would not catch a regression where the tool
 * reports success while silently anchoring on the wrong host.
 */

import * as os from "node:os";
import * as path from "node:path";
import { bets, type HyperIdleDb, messages, tasks, teams, threads, users } from "@hyperidle/db";
import { createTestDb, type TestDbHandle } from "@hyperidle/db/testing";
import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/harness-protocol";
import * as work from "@hyperidle/work";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolHandlersPorts } from "../ports.js";
import { buildToolDefinitions } from "../tool-definitions.js";
import { STUB_TOOL_HANDLERS_PORTS } from "./stub-ports.js";

const NOW = "2026-08-28T00:00:00.000Z";
const HUMAN_ID = "human-founder-1";

let sharedDb: HyperIdleDb;

/**
 * The one seam that seeds a newly created thread's human participant.
 * Returns a fixed human id so the test can assert on it without depending
 * on team-routing logic, which is proven separately elsewhere.
 */
async function fakeFindSoleHumanUser(): Promise<{ readonly id: string }> {
	return { id: HUMAN_ID };
}

const ports: ToolHandlersPorts = {
	...STUB_TOOL_HANDLERS_PORTS,
	coreApi: {
		...STUB_TOOL_HANDLERS_PORTS.coreApi,
		getTaskById: async (id: string) => {
			// The "no bet" scenario has no `tasks` row at all (schema's `betId`
			// is `notNull`, so a real task cannot be produced without one yet —
			// ruling 7's stated FUTURE case) — special-cased by id so this fake
			// still routes every real seeded task through the actual db.
			if (id === "t4-nobet-task") {
				return { betId: "", teamId: "t4-nobet-team", notes: null };
			}
			const row = await work.get(sharedDb, "task", id);
			return row ? { betId: row.betId, teamId: row.teamId, notes: row.notes ?? null } : undefined;
		},
		findSoleHumanUser: fakeFindSoleHumanUser,
		getFirstThreadByHost: async (hostKind: string, hostId: string) => {
			const [row] = await sharedDb
				.select()
				.from(threads)
				.where(and(eq(threads.hostKind, hostKind as never), eq(threads.hostId, hostId)));
			return row
				? { id: row.id, participants: JSON.parse(row.participants) as string[] }
				: undefined;
		},
		insertThread: async (input) => {
			const id = crypto.randomUUID();
			await sharedDb.insert(threads).values({
				id,
				hostKind: input.hostKind as never,
				hostId: input.hostId,
				initiatorId: input.participants[0] ?? "agent-builder",
				participants: JSON.stringify(input.participants),
				lastActiveAt: NOW,
				createdAt: NOW,
			});
			return { id };
		},
		updateThread: async (id, updates) => {
			await sharedDb
				.update(threads)
				.set({
					...(updates.participants ? { participants: JSON.stringify(updates.participants) } : {}),
					...(updates.lastActiveAt ? { lastActiveAt: updates.lastActiveAt } : {}),
				})
				.where(eq(threads.id, id));
		},
		insertMessage: async (input, actorId) => {
			const id = crypto.randomUUID();
			await sharedDb.insert(messages).values({
				id,
				senderId: actorId,
				threadId: input.threadId,
				type: input.type,
				payload: JSON.stringify(input.payload),
				clientKey: input.clientKey,
				createdAt: NOW,
			});
			return { id };
		},
	},
};

const submitReviewTool = buildToolDefinitions(ports).find((t) => t.name === "submit_review")!;

function makeContext(
	db: HyperIdleDb,
	eventBus: EventBus,
	taskId: string,
	sessionSuffix: string,
): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus,
		agentId: "agent-builder",
		sessionId: `session-t4-anchor-${sessionSuffix}`,
		taskId,
		sandboxPath: path.join(os.tmpdir(), `hi-t4-anchor-${sessionSuffix}-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

async function seedTeamBetTask(
	db: HyperIdleDb,
	idPrefix: string,
): Promise<{ teamId: string; betId: string; taskId: string }> {
	const teamId = `${idPrefix}-team`;
	const betId = `${idPrefix}-bet`;
	const taskId = `${idPrefix}-task`;
	await db.insert(teams).values({ id: teamId, name: teamId, phase: "build", createdAt: NOW });
	await db.insert(bets).values({
		id: betId,
		teamId,
		description: "d",
		appetite: "small",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		title: "T",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	return { teamId, betId, taskId };
}

function artifactRef(idSuffix: string): { id: string; kind: "text_diff" } {
	return { id: `${idSuffix}-art`, kind: "text_diff" };
}

async function allThreads(db: HyperIdleDb): Promise<ReadonlyArray<Record<string, unknown>>> {
	const rows = await db.select().from(threads);
	return rows.map((r) => ({ ...r, participants: JSON.parse(r.participants) as string[] }));
}

async function reviewMessages(db: HyperIdleDb): Promise<ReadonlyArray<Record<string, unknown>>> {
	const rows = await db.select().from(messages).where(eq(messages.type, "review"));
	return rows;
}

describe("submit_review — anchors on the task's thread, never the bet's (founder ruling 7)", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		sharedDb = db;
		eventBus = new EventBus();
		await db.insert(users).values({
			id: "agent-builder",
			kind: "ai",
			name: "Builder",
			role: "builder",
			status: "active",
			createdAt: NOW,
		});
	});

	afterEach(async () => {
		await handle.close();
	});

	it("posts to the task's existing thread, not the bet's, when the task already has both a bet thread and a task thread", async () => {
		const { betId, taskId } = await seedTeamBetTask(db, "t4-both");

		// Both hosts already have a thread — the exact situation where a
		// by-host lookup on the bet would find and reuse the WRONG one.
		const betThreadId = crypto.randomUUID();
		await db.insert(threads).values({
			id: betThreadId,
			hostKind: "bet",
			hostId: betId,
			initiatorId: HUMAN_ID,
			participants: JSON.stringify([HUMAN_ID]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		const taskThreadId = crypto.randomUUID();
		await db.insert(threads).values({
			id: taskThreadId,
			hostKind: "task",
			hostId: taskId,
			initiatorId: HUMAN_ID,
			participants: JSON.stringify([HUMAN_ID]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});

		const result = await submitReviewTool.handler(
			{ title: "Please approve", reasoning: ["done"], artifactRef: artifactRef("t4-both") },
			makeContext(db, eventBus, taskId, "both"),
		);

		expect(result.success).toBe(true);

		const written = await reviewMessages(db);
		expect(written).toHaveLength(1);
		expect(written[0]?.threadId).toBe(taskThreadId);
		expect(written[0]?.threadId).not.toBe(betThreadId);

		// No review message reaches the bet's thread at all — the regression
		// this package exists to close, asserted directly rather than only by
		// implication from the equality check above.
		const betThreadMessages = written.filter((m) => m.threadId === betThreadId);
		expect(betThreadMessages).toHaveLength(0);
	});

	it("creates a thread attached to the task — never the bet — when the task has no thread yet", async () => {
		const { taskId } = await seedTeamBetTask(db, "t4-create");

		const result = await submitReviewTool.handler(
			{ title: "Please approve", reasoning: ["done"], artifactRef: artifactRef("t4-create") },
			makeContext(db, eventBus, taskId, "create"),
		);

		expect(result.success).toBe(true);

		const createdThreads = await allThreads(db);
		const taskHosted = createdThreads.filter((t) => t.hostKind === "task" && t.hostId === taskId);
		expect(taskHosted).toHaveLength(1);

		const betHosted = createdThreads.filter((t) => t.hostKind === "bet");
		expect(betHosted).toHaveLength(0);

		const written = await reviewMessages(db);
		expect(written).toHaveLength(1);
		expect(written[0]?.threadId).toBe(taskHosted[0]?.id);
	});

	it("seeds the human as a participant on a thread it creates — the thread is otherwise unreachable in the participant-scoped inbox", async () => {
		const { taskId } = await seedTeamBetTask(db, "t4-seed");

		const result = await submitReviewTool.handler(
			{ title: "Please approve", reasoning: ["done"], artifactRef: artifactRef("t4-seed") },
			makeContext(db, eventBus, taskId, "seed"),
		);

		expect(result.success).toBe(true);

		const createdThreads = await allThreads(db);
		const taskHosted = createdThreads.find((t) => t.hostKind === "task" && t.hostId === taskId);
		expect(taskHosted).toBeDefined();

		// A thread with no human participant never surfaces in a
		// participant-scoped inbox — this is what makes an unseeded thread a
		// real reachability bug, not a cosmetic one.
		const participants = taskHosted?.participants as string[];
		expect(participants).toContain(HUMAN_ID);
		expect(participants).toContain("agent-builder");
	});

	it("anchors on the task's own thread even when the task has no bet at all", async () => {
		// `tasks.betId` is `notNull` in the live schema — a task genuinely
		// without a bet cannot be seeded as a real row yet (founder ruling 7's
		// own future case: "tasks will exist without bets"). This test proves
		// `submit_review`'s thread resolution does not need `parentTask.betId`
		// to be a real bet id by faking `getTaskById` for this one task id to
		// return an empty `betId` (see the `ports.coreApi.getTaskById` fake
		// above) — no `tasks` row is inserted, so nothing here can pass by
		// accidentally reading a real bet.
		const taskId = "t4-nobet-task";

		const result = await submitReviewTool.handler(
			{ title: "Please approve", reasoning: ["done"], artifactRef: artifactRef("t4-nobet") },
			makeContext(db, eventBus, taskId, "nobet"),
		);

		expect(result.success).toBe(true);

		const createdThreads = await allThreads(db);
		const taskHosted = createdThreads.filter((t) => t.hostKind === "task" && t.hostId === taskId);
		expect(taskHosted).toHaveLength(1);

		const betHosted = createdThreads.filter((t) => t.hostKind === "bet");
		expect(betHosted).toHaveLength(0);

		const written = await reviewMessages(db);
		expect(written).toHaveLength(1);
		expect(written[0]?.threadId).toBe(taskHosted[0]?.id);
	});
});
