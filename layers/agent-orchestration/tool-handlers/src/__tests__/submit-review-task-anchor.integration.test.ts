/**
 * `submit_review`'s thread anchoring. Founder ruling 7: a review lands in
 * the thread the task already has, or a new one attached to the task —
 * NEVER a different task's thread. The resolution:
 * `getFirstThreadByHost("task", ctx.taskId, …)`, else
 * `insertThread({hostKind:"task", hostId: ctx.taskId, …})` seeding the
 * task's OWN team's humans as participants, via `resolveReviewRecipientsForItem`
 * — the same team-scoped seam `create_item` already uses for this decision
 * (`tool-definitions.ts`). This backend is shared across an organisation's
 * teams, so a review must reach the team that owns the work, never an
 * arbitrary human resolved with no team filter at all.
 *
 * Every assertion below is checked against the PERSISTED row (the
 * `threads`/`messages` tables), never only `result.success` — a
 * success-flag-only assertion would not catch a regression where the tool
 * reports success while silently anchoring on the wrong host.
 */

import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, messages, tasks, teams, threads, users } from "@hyperidle/db";
import { createTestDb, type TestDbHandle } from "@hyperidle/db/testing";
import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext } from "@hyperidle/harness-protocol";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolHandlersPorts } from "../ports.js";
import { buildToolDefinitions } from "../tool-definitions.js";
import { STUB_TOOL_HANDLERS_PORTS } from "./stub-ports.js";

const NOW = "2026-08-28T00:00:00.000Z";
const HUMAN_ID = "human-founder-1";

let sharedDb: HyperIdleDb;

const ports: ToolHandlersPorts = {
	...STUB_TOOL_HANDLERS_PORTS,
	// This session was never denied anything, so there is no gate review to
	// record. That is the ordinary case these tests exercise.
	gate: { linkReviewToSession: async () => {} },
	coreApi: {
		...STUB_TOOL_HANDLERS_PORTS.coreApi,
		openTask: async (id: string) => {
			const [row] = await sharedDb.select().from(tasks).where(eq(tasks.id, id));
			return row ? { task: { parentTaskId: row.parentTaskId ?? null, teamId: row.teamId } } : undefined;
		},
		// Backed by the real `users` table so the test genuinely exercises
		// team-scoped resolution — humans on the team, falling back to all
		// humans only when the team has none — the same algorithm the
		// production `resolveReviewRecipients` (org-routing.ts) implements.
		resolveReviewRecipientsForItem: async (ctx) => {
			const teamHumans = ctx.teamId
				? await sharedDb
						.select()
						.from(users)
						.where(and(eq(users.kind, "human"), eq(users.teamId, ctx.teamId)))
				: [];
			if (teamHumans.length > 0) return teamHumans.map((u) => u.id);
			const allHumans = await sharedDb.select().from(users).where(eq(users.kind, "human"));
			return allHumans.map((u) => u.id);
		},
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
		sessionId: `session-review-anchor-${sessionSuffix}`,
		taskId,
		sandboxPath: path.join(os.tmpdir(), `hi-review-anchor-${sessionSuffix}-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

/**
 * Seed: team + root task (parentTaskId: null) + child task.
 * The child task is what the agent's session is working on.
 */
async function seedTeamTask(
	db: HyperIdleDb,
	idPrefix: string,
	humanId?: string,
): Promise<{ teamId: string; rootTaskId: string; taskId: string }> {
	const teamId = `${idPrefix}-team`;
	const rootTaskId = `${idPrefix}-root`;
	const taskId = `${idPrefix}-task`;
	await db.insert(teams).values({ id: teamId, name: teamId, phase: "build", createdAt: NOW });
	if (humanId) {
		await db.insert(users).values({
			id: humanId,
			kind: "human",
			name: humanId,
			role: "founder",
			status: "active",
			teamId,
			createdAt: NOW,
		});
	}
	await db.insert(tasks).values({
		id: rootTaskId,
		parentTaskId: null,
		teamId,
		title: "Root goal",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(tasks).values({
		id: taskId,
		parentTaskId: rootTaskId,
		teamId,
		title: "T",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	return { teamId, rootTaskId, taskId };
}

/**
 * This suite is about thread anchoring, not artifact validation, so it
 * attaches evidence through the canvas-envelope channel (`artifacts`) rather
 * than a stored `artifactRef` — the retired `"text_diff"` vocabulary this
 * helper used to emit predates both this test and the consolidated
 * `ARTIFACT_KINDS`/`REVIEW_CANVAS_KINDS` vocabularies, and a stored
 * `artifactRef` now also requires a real backing row owned by the calling
 * task, which is orthogonal to what this file exercises.
 */
function canvasArtifact(idSuffix: string): {
	id: string;
	tool: string;
	app: string;
	sourceHref: string;
	title: string;
	kind: "outcome_summary";
	payload: Record<string, unknown>;
} {
	return {
		id: `${idSuffix}-art`,
		tool: "hyperidle",
		app: "HyperIdle",
		sourceHref: `/artifacts/${idSuffix}-art`,
		title: idSuffix,
		kind: "outcome_summary",
		payload: {},
	};
}

async function allThreads(db: HyperIdleDb): Promise<ReadonlyArray<Record<string, unknown>>> {
	const rows = await db.select().from(threads);
	return rows.map((r) => ({ ...r, participants: JSON.parse(r.participants) as string[] }));
}

async function reviewMessages(db: HyperIdleDb): Promise<ReadonlyArray<Record<string, unknown>>> {
	const rows = await db.select().from(messages).where(eq(messages.type, "review"));
	return rows;
}

describe("submit_review — anchors on the task's own thread (founder ruling 7)", () => {
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

	it("posts to the task's existing thread, not the root task's, when both already have a thread", async () => {
		const { rootTaskId, taskId } = await seedTeamTask(db, "task-both-threads");

		// Both tasks already have a thread — the exact situation where a
		// by-host lookup on the root task would find and reuse the WRONG one.
		const rootThreadId = crypto.randomUUID();
		await db.insert(threads).values({
			id: rootThreadId,
			hostKind: "task",
			hostId: rootTaskId,
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
			{
				title: "Please approve",
				reasoning: ["done"],
				artifacts: [canvasArtifact("task-both-threads")],
			},
			makeContext(db, eventBus, taskId, "both"),
		);

		expect(result.success).toBe(true);

		const written = await reviewMessages(db);
		expect(written).toHaveLength(1);
		expect(written[0]?.threadId).toBe(taskThreadId);
		expect(written[0]?.threadId).not.toBe(rootThreadId);

		// No review message reaches the root task's thread at all.
		const rootThreadMessages = written.filter((m) => m.threadId === rootThreadId);
		expect(rootThreadMessages).toHaveLength(0);
	});

	it("creates a thread attached to the task when the task has no thread yet", async () => {
		const { taskId } = await seedTeamTask(db, "task-thread-create");

		const result = await submitReviewTool.handler(
			{
				title: "Please approve",
				reasoning: ["done"],
				artifacts: [canvasArtifact("task-thread-create")],
			},
			makeContext(db, eventBus, taskId, "create"),
		);

		expect(result.success).toBe(true);

		const createdThreads = await allThreads(db);
		const taskHosted = createdThreads.filter((t) => t.hostKind === "task" && t.hostId === taskId);
		expect(taskHosted).toHaveLength(1);

		const written = await reviewMessages(db);
		expect(written).toHaveLength(1);
		expect(written[0]?.threadId).toBe(taskHosted[0]?.id);
	});

	it("seeds the human as a participant on a thread it creates — the thread is otherwise unreachable in the participant-scoped inbox", async () => {
		const { taskId } = await seedTeamTask(db, "task-seed-participant", HUMAN_ID);

		const result = await submitReviewTool.handler(
			{
				title: "Please approve",
				reasoning: ["done"],
				artifacts: [canvasArtifact("task-seed-participant")],
			},
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

	it("anchors on the task's own thread when the task is a root task (parentTaskId: null)", async () => {
		// A root task (no parent) is the direct work item — submit_review
		// must still create a thread on this task, not try to look up a parent.
		const teamId = "team-root-task";
		const rootTaskId = "root-task-direct";
		await db.insert(teams).values({ id: teamId, name: teamId, phase: "build", createdAt: NOW });
		await db.insert(tasks).values({
			id: rootTaskId,
			parentTaskId: null,
			teamId,
			title: "Root goal",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		});

		const result = await submitReviewTool.handler(
			{
				title: "Please approve",
				reasoning: ["done"],
				artifacts: [canvasArtifact("root-task-direct")],
			},
			makeContext(db, eventBus, rootTaskId, "root"),
		);

		expect(result.success).toBe(true);

		const createdThreads = await allThreads(db);
		const taskHosted = createdThreads.filter(
			(t) => t.hostKind === "task" && t.hostId === rootTaskId,
		);
		expect(taskHosted).toHaveLength(1);

		const written = await reviewMessages(db);
		expect(written).toHaveLength(1);
		expect(written[0]?.threadId).toBe(taskHosted[0]?.id);
	});

	it("seeds only the OWNING team's human — a second team's human never receives a review that isn't theirs", async () => {
		const HUMAN_TEAM_A = "human-team-a";
		const HUMAN_TEAM_B = "human-team-b";
		const { taskId } = await seedTeamTask(db, "task-team-a", HUMAN_TEAM_A);
		await seedTeamTask(db, "task-team-b", HUMAN_TEAM_B);

		const result = await submitReviewTool.handler(
			{ title: "Please approve", reasoning: ["done"], artifacts: [canvasArtifact("task-team-a")] },
			makeContext(db, eventBus, taskId, "team-scoped"),
		);

		expect(result.success).toBe(true);

		const createdThreads = await allThreads(db);
		const taskHosted = createdThreads.find((t) => t.hostKind === "task" && t.hostId === taskId);
		expect(taskHosted).toBeDefined();

		const participants = taskHosted?.participants as string[];
		expect(participants).toContain(HUMAN_TEAM_A);
		expect(participants).not.toContain(HUMAN_TEAM_B);
	});
});
