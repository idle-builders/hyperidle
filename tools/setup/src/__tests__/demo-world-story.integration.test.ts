/**
 * The demo world tells the design's story: the trials task and its parts, the
 * card question, the reviews, the knowledge tree and Finn's notifications — so
 * a screen wired to real data can be compared with its design one to one.
 */

import { changes, type HyperIdleDb } from "@hyperidle/db";
import { computeTaskNeed } from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import type { RunnerDb } from "@hyperidle/runner-db";
import { createUserActions, type UserActionsDeps } from "@hyperidle/user";
import { sql } from "drizzle-orm";
import { describe, expect, test } from "../__testing__/test-fixtures.js";
import { seedDemoWorld } from "../demo-fixture.js";
import {
	FOUNDER_ID,
	TASK_CARD,
	TASK_EXPLAIN,
	TASK_LAYOUT,
	TASK_TRIALS,
	TASK_WEEKLY,
} from "../demo-world/ids.js";
import { runFactoryBootstrap } from "../factory-bootstrap-runner.js";

async function rows<T extends Record<string, unknown>>(db: HyperIdleDb, q: string): Promise<T[]> {
	const result = await db.execute(sql.raw(q));
	return (result as { rows: T[] }).rows;
}

async function count(db: HyperIdleDb, table: string, where = ""): Promise<number> {
	const r = await rows<{ c: string }>(db, `SELECT COUNT(*) AS c FROM ${table} ${where}`);
	return Number(r[0]?.c ?? 0);
}

async function runnerRows<T extends Record<string, unknown>>(
	db: RunnerDb,
	q: string,
): Promise<T[]> {
	const result = await db.execute(sql.raw(q));
	return (result as { rows: T[] }).rows;
}

async function countRunner(db: RunnerDb, table: string, where = ""): Promise<number> {
	const r = await runnerRows<{ c: string }>(db, `SELECT COUNT(*) AS c FROM ${table} ${where}`);
	return Number(r[0]?.c ?? 0);
}

async function seedWorld(db: HyperIdleDb, runnerDb: RunnerDb): Promise<void> {
	await runFactoryBootstrap(db);
	await seedDemoWorld(db, runnerDb);
}

/** The need the backend derives for a task, from its state and its thread messages. */
async function needOf(db: HyperIdleDb, taskId: string): Promise<string | null> {
	const [task] = await rows<{ state: string; thread_id: string }>(
		db,
		`SELECT state, thread_id FROM tasks WHERE id = '${taskId}'`,
	);
	if (!task) throw new Error(`no task ${taskId}`);
	const msgs = await rows<{ type: string; resolved_at: string | null }>(
		db,
		`SELECT type, resolved_at FROM messages WHERE thread_id = '${task.thread_id}'`,
	);
	return computeTaskNeed(
		task.state,
		msgs.map((m) => ({ type: m.type, resolvedAt: m.resolved_at })),
	);
}

/** Minimal deps for open_user as self — only the inbox read needs to be real. */
function openUserDeps(db: HyperIdleDb): UserActionsDeps {
	return {
		changes: {
			appendChange: async (_exec, row) => {
				const [inserted] = await db.insert(changes).values(row).returning();
				if (!inserted) throw new Error("appendChange: no row");
				return inserted;
			},
			listByIds: async (_db, ids) => {
				const all = await _db.select().from(changes);
				return all.filter((r) => (ids as string[]).includes(r.id));
			},
		},
		searchDocuments: async () => ({ ok: true, data: [] as never }) as const,
		editDocument: async () => ({ ok: false, problems: [] as never }) as const,
		onPluginPartEdited: async () => undefined,
	};
}

describe("the demo world tells the design's story", () => {
	test("Work lists the design's root tasks", async ({ db, runnerDb }) => {
		await seedWorld(db, runnerDb);

		const roots = await rows<{ title: string; state: string; team: string }>(
			db,
			`SELECT t.title, t.state, tm.name AS team FROM tasks t JOIN teams tm ON tm.id = t.team_id
			  WHERE t.parent_task_id IS NULL ORDER BY t.title`,
		);
		expect(roots).toEqual([
			{ title: "Explain what happens when a trial ends", state: "review", team: "Product" },
			{ title: "Proration math covered end to end", state: "done", team: "Product" },
			{ title: "Refund wording", state: "review", team: "Support" },
			{ title: "Support themes, weekly", state: "in_progress", team: "Product" },
			{ title: "Trial dates normalised to UTC", state: "done", team: "Product" },
			{ title: "Trials that convert without a call", state: "in_progress", team: "Product" },
			{ title: "Usage-based tier, metering", state: "in_progress", team: "Product" },
		]);
	});

	test("the trials task has four parts and twelve at the bottom, six of them done", async ({
		db,
		runnerDb,
	}) => {
		await seedWorld(db, runnerDb);

		const parts = await rows<{ title: string }>(
			db,
			`SELECT title FROM tasks WHERE parent_task_id = '${TASK_TRIALS}' ORDER BY position`,
		);
		expect(parts.map((p) => p.title)).toEqual([
			"Understand today",
			"Build the day-12 path",
			"Run the test for two weeks",
			"Write up what we learned",
		]);

		const leaves = await rows<{ state: string }>(
			db,
			`WITH RECURSIVE tree AS (
			   SELECT id FROM tasks WHERE id = '${TASK_TRIALS}'
			   UNION ALL SELECT t.id FROM tasks t JOIN tree ON t.parent_task_id = tree.id)
			 SELECT t.state FROM tasks t JOIN tree ON tree.id = t.id
			  WHERE NOT EXISTS (SELECT 1 FROM tasks c WHERE c.parent_task_id = t.id)`,
		);
		expect(leaves).toHaveLength(12);
		expect(leaves.filter((l) => l.state === "done")).toHaveLength(6);
	});

	test("the card question is open, so its part needs input; the layout needs a review", async ({
		db,
		runnerDb,
	}) => {
		await seedWorld(db, runnerDb);

		const questions = await rows<{ payload: string; resolved_at: string | null }>(
			db,
			`SELECT m.payload, m.resolved_at FROM messages m JOIN tasks t ON t.thread_id = m.thread_id
			  WHERE t.id = '${TASK_CARD}' AND m.type = 'questionnaire'`,
		);
		expect(questions.map((q) => [JSON.parse(q.payload).title, q.resolved_at])).toEqual([
			["When do we take the card?", null],
		]);
		expect(await needOf(db, TASK_CARD)).toBe("input");
		expect(await needOf(db, TASK_LAYOUT)).toBe("review");
	});

	test("the trial-end explainer: round 1 rejected with a reason, round 2 waiting", async ({
		db,
		runnerDb,
	}) => {
		await seedWorld(db, runnerDb);

		const reviews = await rows<{ id: string; resolved_at: string | null }>(
			db,
			`SELECT id, resolved_at FROM messages
			  WHERE type = 'review' AND payload::jsonb ->> 'title' = 'Trial-end explainer'
			  ORDER BY created_at`,
		);
		expect(reviews.map((r) => r.resolved_at === null)).toEqual([false, true]);

		const verdicts = await rows<{ payload: string }>(
			db,
			`SELECT payload FROM messages WHERE type = 'verdict'
			  AND payload::jsonb ->> 'resolvesMessageId' = '${reviews[0]?.id}'`,
		);
		const verdict = JSON.parse(verdicts[0]?.payload ?? "{}");
		expect(verdict.decision).toBe("reject");
		expect(verdict.note).toMatch(/warning in the email/);
		expect(await needOf(db, TASK_EXPLAIN)).toBe("review");
	});

	test("Support themes, weekly: twelve Monday runs done, the next one to come", async ({
		db,
		runnerDb,
	}) => {
		await seedWorld(db, runnerDb);

		const runs = await rows<{ state: string }>(
			db,
			`SELECT state FROM tasks WHERE parent_task_id = '${TASK_WEEKLY}' ORDER BY position`,
		);
		expect(runs.map((r) => r.state)).toEqual([...Array(12).fill("done"), "proposed"]);
		const monday = await rows<{ schedule: string; paused: boolean }>(
			db,
			"SELECT s.schedule, s.paused FROM subscriptions s JOIN users u ON u.id = s.user_id WHERE u.name = 'Growth'",
		);
		expect(monday).toEqual([{ schedule: "0 7 * * 1", paused: false }]);
	});

	test("knowledge has a space per team, with How we price and its drafts", async ({
		db,
		runnerDb,
	}) => {
		await seedWorld(db, runnerDb);

		const tree = await rows<{ team: string; title: string; parent: string | null; status: string }>(
			db,
			`SELECT tm.name AS team, d.title, p.title AS parent, d.status FROM documents d
			   JOIN teams tm ON tm.id = d.scope_id
			   LEFT JOIN documents p ON p.id = d.parent_id
			  WHERE d.scope_kind = 'team' AND d.slot = 'ordinary'
			    AND (d.parent_kind IS NULL OR d.parent_kind = 'document')
			  ORDER BY tm.name, d.position`,
		);
		expect(tree).toEqual([
			{ team: "Product", title: "How we price", parent: null, status: "active" },
			{ team: "Product", title: "Trials", parent: "How we price", status: "active" },
			{ team: "Product", title: "Tiers and metering", parent: "How we price", status: "active" },
			{
				team: "Product",
				title: "Should trials be 10 days?",
				parent: "How we price",
				status: "proposed",
			},
			{ team: "Product", title: "What a clean feature looks like", parent: null, status: "active" },
			{ team: "Product", title: "Engineering", parent: null, status: "active" },
			{ team: "Product", title: "Deploy rule", parent: "Engineering", status: "proposed" },
			{ team: "Product", title: "Tracing the codebase", parent: "Engineering", status: "active" },
			{ team: "Product", title: "Which plan fits", parent: "How we price", status: "active" },
			{ team: "Support", title: "July support themes", parent: null, status: "active" },
			{ team: "Support", title: "Refund wording", parent: null, status: "proposed" },
		]);
	});

	test("Finn lands in the app, and has unread notifications", async ({ db, runnerDb }) => {
		await seedWorld(db, runnerDb);

		const humans = await rows<{ id: string; name: string }>(
			db,
			"SELECT id, name FROM users WHERE kind = 'human' ORDER BY created_at ASC, id ASC",
		);
		expect(humans[0]).toEqual({ id: FOUNDER_ID, name: "Finn Olsen" });

		const openUser = createUserActions(openUserDeps(db)).find(
			(a) => a.declaration.name === "open_user",
		);
		if (!openUser) throw new Error("open_user action not found");
		const result = await openUser.run(
			{ actor: FOUNDER_ID, db, eventBus: new EventBus(), now: new Date().toISOString() },
			{ id: FOUNDER_ID },
		);
		const inbox =
			(result.ok
				? (result.data as { inbox?: Array<{ readAt: string | null }> }).inbox
				: undefined) ?? [];
		expect(inbox.filter((item) => item.readAt === null)).toHaveLength(2);
	});

	test("nothing claims to be running: every session has ended, and tasks under way keep its notes", async ({
		db,
		runnerDb,
	}) => {
		await seedWorld(db, runnerDb);
		expect(
			await countRunner(runnerDb, "sessions", "WHERE state = 'active' OR ended_at IS NULL"),
		).toBe(0);
		// sessions live in runner-db; get tasks from core-db first, then fetch notes per task
		const underWayTasks = await rows<{ id: string }>(
			db,
			`SELECT t.id FROM tasks t WHERE t.state = 'in_progress' AND t.owner_agent_id IS NOT NULL
			 AND NOT EXISTS (SELECT 1 FROM tasks c WHERE c.parent_task_id = t.id)`,
		);
		expect(underWayTasks.length).toBeGreaterThan(0);
		const underWay = await Promise.all(
			underWayTasks.map(async (task) => {
				const sessionNotes = await runnerRows<{ notes: string | null }>(
					runnerDb,
					`SELECT s.notes FROM sessions s WHERE s.task_id = '${task.id}' ORDER BY s.started_at DESC LIMIT 1`,
				);
				return { id: task.id, notes: sessionNotes[0]?.notes ?? null };
			}),
		);
		for (const task of underWay) expect(task.notes, task.id).toEqual(expect.any(String));
	});

	test("seeding twice changes nothing", async ({ db, runnerDb }) => {
		await seedWorld(db, runnerDb);
		const tables = [
			"users",
			"teams",
			"tasks",
			"threads",
			"messages",
			"documents",
			"subscriptions",
			"inbox",
			"plugins",
			"plugin_contributions",
		];
		const before = await Promise.all(tables.map((t) => count(db, t)));
		const sessionsBefore = await countRunner(runnerDb, "sessions");

		await seedDemoWorld(db, runnerDb);

		expect(await Promise.all(tables.map((t) => count(db, t)))).toEqual(before);
		expect(await countRunner(runnerDb, "sessions")).toBe(sessionsBefore);
	});
});
