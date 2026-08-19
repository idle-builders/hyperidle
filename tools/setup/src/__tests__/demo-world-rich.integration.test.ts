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
	test("bets span all four lifecycles with outcomes on closed bets", async ({ db }) => {
		await seedWorld(db);

		for (const status of ["draft", "active", "completed", "killed"]) {
			expect(
				await count(db, "bets", `WHERE status = '${status}'`),
				`bets ${status}`,
			).toBeGreaterThanOrEqual(1);
		}
		expect(await count(db, "bets", "WHERE status = 'active'")).toBeGreaterThanOrEqual(2);

		// Closed bets carry an outcome verdict + summary + timestamp.
		const closed = await rows<{
			id: string;
			outcome_verdict: string | null;
			outcome_summary: string | null;
		}>(
			db,
			"SELECT id, outcome_verdict, outcome_summary FROM bets WHERE status IN ('completed','killed')",
		);
		expect(closed.length).toBeGreaterThanOrEqual(3);
		for (const bet of closed) {
			expect(bet.outcome_verdict, `${bet.id} verdict`).toBeTruthy();
			expect(bet.outcome_summary, `${bet.id} summary`).toBeTruthy();
		}

		// At least one draft bet was promoted from a real knowledge item.
		const promoted = await rows<{ id: string }>(
			db,
			`SELECT b.id FROM bets b JOIN knowledge_items k ON k.id = b.source_knowledge_item_id
			  WHERE b.status = 'draft'`,
		);
		expect(promoted.length).toBeGreaterThanOrEqual(1);
	});

	test("tasks cover all eight states and resolve to bets, teams, owners", async ({ db }) => {
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
		expect(await count(db, "tasks")).toBeGreaterThanOrEqual(25);

		const dangling = await rows<{ id: string }>(
			db,
			`SELECT t.id FROM tasks t
			  LEFT JOIN bets b ON b.id = t.bet_id
			  LEFT JOIN teams tm ON tm.id = t.team_id
			  LEFT JOIN users u ON u.id = t.owner_agent_id
			  WHERE b.id IS NULL OR tm.id IS NULL OR u.id IS NULL`,
		);
		expect(dangling).toHaveLength(0);
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
		const assistantThreads = await rows<{ id: string; participants: string; pinned: boolean }>(
			db,
			`SELECT id, participants, pinned FROM threads
			  WHERE host_kind = 'user' AND host_id = 'demo-founder'`,
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
		const badHosts = await rows<{ id: string }>(
			db,
			`SELECT th.id FROM threads th
			  WHERE (th.host_kind = 'bet' AND NOT EXISTS (SELECT 1 FROM bets b WHERE b.id = th.host_id))
			     OR (th.host_kind = 'task' AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = th.host_id))
			     OR (th.host_kind = 'knowledge_item' AND NOT EXISTS (SELECT 1 FROM knowledge_items k WHERE k.id = th.host_id))
			     OR (th.host_kind = 'artifact' AND NOT EXISTS (SELECT 1 FROM artifacts a WHERE a.id = th.host_id))
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

	test("every review message resolves to a real artifact", async ({ db }) => {
		await seedWorld(db);

		const reviews = await rows<{ payload: string }>(
			db,
			"SELECT payload FROM messages WHERE type = 'review'",
		);
		expect(reviews.length).toBeGreaterThanOrEqual(3);
		for (const review of reviews) {
			const payload = JSON.parse(review.payload) as { artifactRef?: { id?: string } };
			const artifactId = payload.artifactRef?.id;
			expect(artifactId, "review carries artifactRef").toBeTruthy();
			const found = await count(db, "artifacts", `WHERE id = '${artifactId}'`);
			expect(found, `artifact ${artifactId} exists`).toBe(1);
		}

		// Artifact kind coverage for a varied Work view.
		const kinds = await rows<{ kind: string }>(db, "SELECT DISTINCT kind FROM artifacts");
		const kindSet = new Set(kinds.map((k) => k.kind));
		for (const expected of ["code", "text", "data", "url"]) {
			expect(kindSet.has(expected), `artifact kind ${expected}`).toBe(true);
		}
	});

	test("knowledge corpus fills curated + triage with provenance and logs", async ({ db }) => {
		await seedWorld(db);

		expect(await count(db, "knowledge_items", "WHERE id LIKE 'demo-%'")).toBeGreaterThanOrEqual(35);

		// Triage queue: items a human must look at (the triage query counts
		// draft + needs_human — the kernel statuses a facilitator triages).
		expect(
			await count(db, "knowledge_items", "WHERE status IN ('draft','needs_human')"),
		).toBeGreaterThanOrEqual(3);

		// Variety of scopes and kinds.
		const scopes = await rows<{ scope_kind: string }>(
			db,
			"SELECT DISTINCT scope_kind FROM knowledge_items WHERE id LIKE 'demo-%'",
		);
		expect(scopes.length).toBeGreaterThanOrEqual(4);
		const kinds = await rows<{ kind: string }>(
			db,
			`SELECT DISTINCT p.kind FROM knowledge_app_projection p
			  JOIN knowledge_items k ON k.id = p.knowledge_item_id WHERE k.id LIKE 'demo-%'`,
		);
		expect(kinds.length).toBeGreaterThanOrEqual(5);

		// Every demo item has a projection row; at least one open conflict; edit + access logs.
		const missingProjection = await rows<{ id: string }>(
			db,
			`SELECT k.id FROM knowledge_items k
			  LEFT JOIN knowledge_app_projection p ON p.knowledge_item_id = k.id
			  WHERE k.id LIKE 'demo-%' AND p.id IS NULL`,
		);
		expect(missingProjection).toHaveLength(0);
		expect(await count(db, "knowledge_conflicts", "WHERE status = 'open'")).toBeGreaterThanOrEqual(
			1,
		);
		expect(await count(db, "knowledge_edit_log")).toBeGreaterThanOrEqual(3);
		expect(await count(db, "knowledge_access_log")).toBeGreaterThanOrEqual(5);

		// Provenance loop: a completed bet produced a retro item scoped to it.
		const retro = await rows<{ id: string }>(
			db,
			`SELECT k.id FROM knowledge_items k
			  JOIN bets b ON b.id = k.scope_id
			  WHERE k.scope_kind = 'bet' AND b.status IN ('completed','killed')`,
		);
		expect(retro.length).toBeGreaterThanOrEqual(1);
	});

	test("sessions: terminal history plus live ones, all resolving", async ({ db }) => {
		await seedWorld(db);

		expect(await count(db, "sessions")).toBeGreaterThanOrEqual(40);
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

	test("routines: the four builtins plus history", async ({ db }) => {
		await seedWorld(db);

		for (const id of [
			"builtin:post-bet-retro",
			"builtin:portfolio-retro",
			"builtin:knowledge-decay",
			"builtin:knowledge-promotion",
		]) {
			expect(await count(db, "routines", `WHERE id = '${id}'`), id).toBe(1);
		}
		expect(await count(db, "routine_runs")).toBeGreaterThanOrEqual(10);
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

		const oldest = await rows<{ min: string }>(db, "SELECT MIN(created_at) AS min FROM bets");
		const ageDays = (Date.now() - new Date(oldest[0]?.min ?? "").getTime()) / 86_400_000;
		expect(ageDays, "oldest bet is weeks old").toBeGreaterThanOrEqual(21);

		const newest = await rows<{ max: string }>(db, "SELECT MAX(created_at) AS max FROM messages");
		const freshnessHours = (Date.now() - new Date(newest[0]?.max ?? "").getTime()) / 3_600_000;
		expect(freshnessHours, "conversation activity is recent").toBeLessThanOrEqual(48);
	});

	test("seeding twice changes nothing", async ({ db }) => {
		await seedWorld(db);

		const tables = [
			"users",
			"teams",
			"bets",
			"tasks",
			"threads",
			"messages",
			"knowledge_items",
			"knowledge_app_projection",
			"knowledge_edit_log",
			"knowledge_access_log",
			"knowledge_conflicts",
			"artifacts",
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

		const members = await rows<{ active_bets: number; lead_agent_id: string | null }>(
			db,
			// @lore AU44 B1: team_members folded into teams; active_bets/lead_agent_id now on teams
			"SELECT active_bets, lead_agent_id FROM teams WHERE id = 'demo-team-acme'",
		);
		const activeBets = await count(
			db,
			"bets",
			"WHERE status = 'active' AND team_id = 'demo-team-acme'",
		);
		expect(members[0]?.active_bets).toBe(activeBets);
		expect(members[0]?.lead_agent_id).toBeTruthy();

		// Local-mode auth resolves the first human user — that must be the demo founder,
		// so the founder row predates every other human.
		const humans = await rows<{ id: string }>(
			db,
			"SELECT id FROM users WHERE kind = 'human' ORDER BY created_at ASC, id ASC",
		);
		expect(humans[0]?.id).toBe("demo-founder");
	});
});
