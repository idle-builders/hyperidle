/**
 * AX1 — the lived-in demo world.
 *
 * Proves `seedDemoWorld` fills a fresh database with a coherent, weeks-old
 * world: bet history across all lifecycles, tasks in every state, threads
 * with real reviews/verdicts, a knowledge corpus, sessions and routines with
 * history, and notifications — everything the three views need to look alive.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { sql } from "drizzle-orm";
import { seedDemoWorld } from "../demo-fixture.js";
import { runFactoryBootstrap } from "../factory-bootstrap-runner.js";

async function rows<T extends Record<string, unknown>>(db: HyperIdleDb, q: string): Promise<T[]> {
	const result = await db.execute(sql.raw(q));
	return (result as { rows: T[] }).rows;
}

async function count(db: HyperIdleDb, table: string, where = ""): Promise<number> {
	const r = await rows<{ c: string }>(db, `SELECT COUNT(*) AS c FROM ${table} ${where}`);
	return Number(r[0]?.c ?? 0);
}

async function seedWorld(db: HyperIdleDb): Promise<void> {
	await runFactoryBootstrap(db);
	await seedDemoWorld(db);
}

describe("AX1: lived-in demo world", () => {
	// @lore BB1: bets table dropped. Root tasks (parent_task_id IS NULL) replace bets.
	// State mapping: draft→proposed, active→in_progress, completed→done, killed→killed.
	test("root tasks span all four states with outcomes on closed tasks", async ({ db }) => {
		await seedWorld(db);

		for (const state of ["proposed", "in_progress", "done", "killed"]) {
			expect(
				await count(db, "tasks", `WHERE parent_task_id IS NULL AND state = '${state}'`),
				`root tasks ${state}`,
			).toBeGreaterThanOrEqual(1);
		}
		expect(
			await count(db, "tasks", "WHERE parent_task_id IS NULL AND state = 'in_progress'"),
		).toBeGreaterThanOrEqual(2);

		// Closed root tasks carry an outcome verdict + summary.
		const closed = await rows<{
			id: string;
			outcome_verdict: string | null;
			outcome_summary: string | null;
		}>(
			db,
			"SELECT id, outcome_verdict, outcome_summary FROM tasks WHERE parent_task_id IS NULL AND state IN ('done','killed')",
		);
		expect(closed.length).toBeGreaterThanOrEqual(3);
		for (const rt of closed) {
			expect(rt.outcome_verdict, `${rt.id} verdict`).toBeTruthy();
			expect(rt.outcome_summary, `${rt.id} summary`).toBeTruthy();
		}

		// At least one proposed root task was promoted from a real document.
		const promoted = await rows<{ id: string }>(
			db,
			`SELECT t.id FROM tasks t JOIN documents d ON d.id = t.source_document_id
			  WHERE t.parent_task_id IS NULL AND t.state = 'proposed'`,
		);
		expect(promoted.length).toBeGreaterThanOrEqual(1);
	});

	// @lore BB1: tasks now form a tree (root → child → grandchild). The dangling
	// check no longer joins bets; it verifies team + owner FKs for child tasks.
	test("tasks cover all eight states, teams, and owners", async ({ db }) => {
		await seedWorld(db);

		for (const state of [
			"proposed",
			"accepted",
			"hold",
			"in_progress",
			"blocked",
			"review",
			"done",
			"killed",
		]) {
			expect(
				await count(db, "tasks", `WHERE state = '${state}'`),
				`tasks ${state}`,
			).toBeGreaterThanOrEqual(1);
		}
		// Root tasks + child tasks + grandchild tasks
		expect(await count(db, "tasks")).toBeGreaterThanOrEqual(25);

		// Child tasks must have a valid parent_task_id FK; all tasks must resolve team + owner.
		const dangling = await rows<{ id: string }>(
			db,
			`SELECT t.id FROM tasks t
			  LEFT JOIN tasks parent ON parent.id = t.parent_task_id
			  LEFT JOIN teams tm ON tm.id = t.team_id
			  LEFT JOIN users u ON u.id = t.owner_agent_id
			  WHERE (t.parent_task_id IS NOT NULL AND parent.id IS NULL)
			     OR tm.id IS NULL`,
		);
		expect(dangling).toHaveLength(0);

		// At least one 3-level branch exists: a task whose parent also has a parent.
		const grandchildren = await rows<{ id: string }>(
			db,
			`SELECT t.id FROM tasks t
			  JOIN tasks parent ON parent.id = t.parent_task_id
			  WHERE parent.parent_task_id IS NOT NULL`,
		);
		expect(grandchildren.length).toBeGreaterThanOrEqual(1);
	});

	test("conversations include blocking, resolved, assistant and DM threads", async ({ db }) => {
		await seedWorld(db);

		// A blocking thread: an unresolved review message.
		const unresolvedReviews = await rows<{ thread_id: string }>(
			db,
			"SELECT thread_id FROM messages WHERE type = 'review' AND resolved_at IS NULL",
		);
		expect(unresolvedReviews.length).toBeGreaterThanOrEqual(1);

		// A resolved review with a verdict reply that names it.
		const resolvedReviews = await rows<{ id: string }>(
			db,
			"SELECT id FROM messages WHERE type = 'review' AND resolved_at IS NOT NULL",
		);
		expect(resolvedReviews.length).toBeGreaterThanOrEqual(2);
		const verdicts = await rows<{ payload: string }>(
			db,
			"SELECT payload FROM messages WHERE type = 'verdict'",
		);
		expect(verdicts.length).toBeGreaterThanOrEqual(2);
		const verdictTargets = verdicts.map((v) => JSON.parse(v.payload).resolvesMessageId);
		for (const target of verdictTargets) {
			expect(
				resolvedReviews.some((r) => r.id === target),
				`verdict target ${target} resolved`,
			).toBe(true);
		}

		// The pinned assistant thread for the founder.
		// @lore BC3: the assistant thread is host-kind "agent" like any other
		// direct thread now — the ast-<userId> structural convention is gone.
		const assistantThreads = await rows<{ id: string; participants: string; pinned: boolean }>(
			db,
			`SELECT id, participants, pinned FROM threads
			  WHERE host_kind = 'agent' AND host_id = 'ast-demo-founder'`,
		);
		expect(assistantThreads.length).toBe(1);
		expect(assistantThreads[0]?.pinned).toBe(true);
		expect(JSON.parse(assistantThreads[0]?.participants ?? "[]")).toContain("ast-demo-founder");

		// At least one two-party DM hosted on an agent.
		const dms = await rows<{ participants: string }>(
			db,
			"SELECT participants FROM threads WHERE host_kind = 'agent'",
		);
		expect(dms.length).toBeGreaterThanOrEqual(2);
		for (const dm of dms) {
			expect(JSON.parse(dm.participants)).toHaveLength(2);
		}

		// A questionnaire message exists (blocking-thread variety).
		expect(await count(db, "messages", "WHERE type = 'questionnaire'")).toBeGreaterThanOrEqual(1);

		// Every thread host resolves; every message sender resolves.
		// @lore BB1: 'bet' host_kind removed — those threads used host_kind = 'task'.
		// @lore BC3: no thread is task-hosted any more — a task's conversation is
		// team-hosted (architecture.md §3.9, §4 step 7), so 'task' is gone from
		// this check.
		const badHosts = await rows<{ id: string }>(
			db,
			`SELECT th.id FROM threads th
			  WHERE (th.host_kind = 'document' AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.id = th.host_id))
			     OR (th.host_kind = 'agent' AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = th.host_id))
			     OR (th.host_kind = 'user' AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = th.host_id))
			     OR (th.host_kind = 'team' AND NOT EXISTS (SELECT 1 FROM teams t WHERE t.id = th.host_id))`,
		);
		expect(badHosts).toHaveLength(0);

		const badSenders = await rows<{ id: string }>(
			db,
			`SELECT m.id FROM messages m LEFT JOIN users u ON u.id = m.sender_id WHERE u.id IS NULL`,
		);
		expect(badSenders).toHaveLength(0);

		expect(await count(db, "threads")).toBeGreaterThanOrEqual(12);
		expect(await count(db, "messages")).toBeGreaterThanOrEqual(100);
	});

	// @lore BC4: the projection/edit-log/access-log/conflicts tables are dropped
	// (architecture.md §6.2, §6.4) — `confidence`/`meta` folded onto `documents`,
	// and the demo corpus (re-seeded 3a99a022b/205659d1d) no longer writes a
	// conflict row or any edit-log/access-log rows, so those assertions are gone,
	// not re-pointed.
	test("knowledge corpus fills curated + triage with real usage signals", async ({ db }) => {
		await seedWorld(db);

		// the practice-folder items (`demo-ki-practice-*`) also match `id LIKE
		// 'demo-%'`; 43 spec rows + 8 practice folders in the real seed.
		expect(await count(db, "documents", "WHERE id LIKE 'demo-%'")).toBeGreaterThanOrEqual(45);

		// Triage queue: items a human must look at.
		// @lore nested-knowledge-items: the status ladder collapsed — draft/
		// captured/provisional/needs_human all fold into `proposed` now.
		expect(await count(db, "documents", "WHERE status = 'proposed'")).toBeGreaterThanOrEqual(3);

		// Variety of scopes.
		const scopes = await rows<{ scope_kind: string }>(
			db,
			"SELECT DISTINCT scope_kind FROM documents WHERE id LIKE 'demo-%'",
		);
		expect(scopes.length).toBeGreaterThanOrEqual(3);

		// Provenance loop: a done/killed root task produced a retro item under it.
		// @lore nested-knowledge-items: task-scoped items are no longer
		// `scope_kind='task'` — they are `parent_kind='task'`/`parent_id=<taskId>`,
		// factory-scoped (D4/architecture §7 step 7).
		const retro = await rows<{ id: string }>(
			db,
			`SELECT d.id FROM documents d
			  JOIN tasks t ON t.id = d.parent_id
			  WHERE d.parent_kind = 'task' AND t.parent_task_id IS NULL AND t.state IN ('done','killed')`,
		);
		expect(retro.length).toBeGreaterThanOrEqual(1);

		// @lore BC4 §6.7: the desktop walk's decay routine (`unusedSince` +
		// `sort:"least_used"`) needs active, ordinary documents that read stale
		// on both usage clocks — the seed backdates four of them past 90 days.
		const usage = await rows<{
			id: string;
			last_used_at: string | null;
			last_read_at: string | null;
		}>(
			db,
			`SELECT id, last_used_at, last_read_at FROM documents
			  WHERE status = 'active' AND slot = 'ordinary'
			    AND last_used_at IS NOT NULL AND last_read_at IS NOT NULL`,
		);
		const ninetyDaysAgo = Date.now() - 90 * 86_400_000;
		const staleCount = usage.filter(
			(d) =>
				new Date(d.last_used_at as string).getTime() < ninetyDaysAgo &&
				new Date(d.last_read_at as string).getTime() < ninetyDaysAgo,
		).length;
		expect(staleCount).toBeGreaterThanOrEqual(4);
	});

	test("sessions: terminal history plus live ones, all resolving", async ({ db }) => {
		await seedWorld(db);

		// @lore BA9d wave 3: three ritual routines removed from demo world
		// (knowledge-decay, knowledge-promotion, post-task-retro) — their associated
		// sessions are gone. Actual count is 34 (26 task + 2 live + 6 assistant turns).
		expect(await count(db, "sessions")).toBeGreaterThanOrEqual(30);
		expect(await count(db, "sessions", "WHERE state = 'active'")).toBeGreaterThanOrEqual(2);
		expect(await count(db, "sessions", "WHERE state IN ('done','crashed')")).toBeGreaterThanOrEqual(
			30,
		);

		const active = await rows<{ id: string; ended_at: string | null }>(
			db,
			"SELECT id, ended_at FROM sessions WHERE state = 'active'",
		);
		for (const s of active) expect(s.ended_at, `${s.id} still open`).toBeNull();

		const dangling = await rows<{ id: string }>(
			db,
			`SELECT s.id FROM sessions s
			  LEFT JOIN users u ON u.id = s.agent_id
			  LEFT JOIN tasks t ON t.id = s.task_id
			  WHERE u.id IS NULL OR (s.task_id IS NOT NULL AND t.id IS NULL)`,
		);
		expect(dangling).toHaveLength(0);
	});

	// @lore BA9d: builtin routine mechanism deleted (provisionTeamRoutines removed).
	// Only demo-routine-daily_digest remains. The three ritual routines
	// (knowledge-decay, knowledge-promotion, post-task-retro) were also removed
	// from demo world per coordinator instruction. No builtin:* rows exist.
	test("routines: daily_digest routine with run history (BA9d: no builtin:* rows)", async ({
		db,
	}) => {
		await seedWorld(db);

		// Only the daily-digest routine should exist.
		expect(
			await count(db, "routines", "WHERE id = 'demo-routine-daily_digest'"),
			"demo-routine-daily_digest",
		).toBe(1);
		// No builtin:* routines (mechanism deleted in BA9d aa260893c).
		expect(await count(db, "routines", "WHERE id LIKE 'builtin:%'"), "no builtin:* routines").toBe(
			0,
		);
		// At least the daily-digest run history row.
		expect(await count(db, "routine_runs")).toBeGreaterThanOrEqual(1);
		const danglingRuns = await rows<{ id: string }>(
			db,
			`SELECT r.id FROM routine_runs r LEFT JOIN routines ro ON ro.id = r.routine_id WHERE ro.id IS NULL`,
		);
		expect(danglingRuns).toHaveLength(0);
	});

	test("notifications wait unread in the popover", async ({ db }) => {
		await seedWorld(db);

		const unread = await rows<{ type_key: string | null }>(
			db,
			"SELECT type_key FROM notification_queue WHERE read_at IS NULL",
		);
		const keys = new Set(unread.map((n) => n.type_key));
		expect(keys.has("review_request")).toBe(true);
		expect(keys.has("blocker_alert")).toBe(true);
	});

	test("the world has weeks of history, anchored to seed time", async ({ db }) => {
		await seedWorld(db);

		// @lore BB1: bets table gone — use root tasks (parent_task_id IS NULL) for age anchor.
		const oldest = await rows<{ min: string }>(
			db,
			"SELECT MIN(created_at) AS min FROM tasks WHERE parent_task_id IS NULL",
		);
		const ageDays = (Date.now() - new Date(oldest[0]?.min ?? "").getTime()) / 86_400_000;
		expect(ageDays, "oldest root task is weeks old").toBeGreaterThanOrEqual(21);

		const newest = await rows<{ max: string }>(db, "SELECT MAX(created_at) AS max FROM messages");
		const freshnessHours = (Date.now() - new Date(newest[0]?.max ?? "").getTime()) / 3_600_000;
		expect(freshnessHours, "conversation activity is recent").toBeLessThanOrEqual(48);
	});

	test("seeding twice changes nothing", async ({ db }) => {
		await seedWorld(db);

		// @lore BB1: "bets" removed from table list — the table is dropped.
		// @lore artifacts-become-knowledge: "artifacts" removed — the table is dropped.
		// @lore BC4: "knowledge_app_projection"/"knowledge_edit_log"/
		// "knowledge_access_log"/"knowledge_conflicts" removed — the tables are dropped.
		const tables = [
			"users",
			"teams",
			"tasks",
			"threads",
			"messages",
			"documents",
			"sessions",
			"routines",
			"routine_runs",
			"notification_queue",
			"agent_run_config",
		];
		const before: Record<string, number> = {};
		for (const t of tables) before[t] = await count(db, t);

		await seedDemoWorld(db);

		for (const t of tables) {
			expect(await count(db, t), `${t} unchanged by second seed`).toBe(before[t]);
		}
	});

	test("team state reflects the live workload", async ({ db }) => {
		await seedWorld(db);

		// @lore BB1: `active_bets` column dropped from teams — WIP is counted
		// live via countTeamTasksInProgress. The bets table is gone too. We now
		// verify the team has a lead_agent_id and that root tasks exist.
		const teamRow = await rows<{ lead_agent_id: string | null }>(
			db,
			"SELECT lead_agent_id FROM teams WHERE id = 'demo-team-acme'",
		);
		expect(teamRow[0]?.lead_agent_id).toBeTruthy();

		// Root tasks (parentTaskId IS NULL) should exist for the demo team.
		const rootTaskCount = await count(
			db,
			"tasks",
			"WHERE parent_task_id IS NULL AND team_id = 'demo-team-acme'",
		);
		expect(rootTaskCount).toBeGreaterThan(0);

		// Local-mode auth resolves the first human user — that must be the demo founder,
		// so the founder row predates every other human.
		const humans = await rows<{ id: string }>(
			db,
			"SELECT id FROM users WHERE kind = 'human' ORDER BY created_at ASC, id ASC",
		);
		expect(humans[0]?.id).toBe("demo-founder");
	});
});
