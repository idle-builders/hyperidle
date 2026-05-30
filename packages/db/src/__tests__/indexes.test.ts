import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { HyperIdleDb } from "../connection.js";
import { createTestDb } from "../test-utils.js";

/**
 * I3 — secondary index acceptance tests.
 *
 * Each test runs `EXPLAIN QUERY PLAN` for a representative query against the
 * indexed column and asserts the planner picked an index (the plan output
 * mentions `USING INDEX`) rather than a full table scan (`SCAN TABLE`).
 *
 * SQLite EXPLAIN QUERY PLAN docs:
 *   https://www.sqlite.org/eqp.html
 *
 * Plan rows have shape `{ id, parent, notused, detail }`. We only assert on
 * `detail`. Examples:
 *   "SEARCH tasks USING INDEX tasks_bet_id_idx (bet_id=?)"
 *   "SCAN TABLE tasks"
 */

interface ExplainRow {
	id: number;
	parent: number;
	notused: number;
	detail: string;
}

function explainPlan(db: HyperIdleDb, query: string): ExplainRow[] {
	return db.all<ExplainRow>(sql.raw(`EXPLAIN QUERY PLAN ${query}`));
}

function assertUsesIndex(rows: ExplainRow[], hint: string): void {
	const detailJoined = rows.map((r) => r.detail).join("\n");
	expect(detailJoined, `expected query plan to USE INDEX (${hint}), got:\n${detailJoined}`).toMatch(
		/USING INDEX/i,
	);
	expect(
		detailJoined,
		`expected query plan NOT to be a full SCAN TABLE (${hint}), got:\n${detailJoined}`,
	).not.toMatch(/SCAN\s+TABLE\s+\w/i);
}

describe("I3: secondary index coverage", () => {
	let db: HyperIdleDb;

	beforeEach(() => {
		db = createTestDb();
	});

	it("uses an index for tasks lookup by bet_id", () => {
		const plan = explainPlan(db, "SELECT * FROM tasks WHERE bet_id = 'b1'");
		assertUsesIndex(plan, "tasks.bet_id");
	});

	// @lore U1: tasks.product_id dropped; tasks.team_id now references `teams` (formerly `products`).
	// The tasks_team_id_idx covers queries by both team_id and the former product_id lookup path.
	it("uses an index for tasks lookup by team_id (covers both team_id and former product_id)", () => {
		const plan = explainPlan(db, "SELECT * FROM tasks WHERE team_id = 't1'");
		assertUsesIndex(plan, "tasks.team_id");
	});

	it("uses an index for sessions lookup by task_id", () => {
		const plan = explainPlan(db, "SELECT * FROM sessions WHERE task_id = 'task-1'");
		assertUsesIndex(plan, "sessions.task_id");
	});

	it("uses an index for sessions lookup by agent_id", () => {
		const plan = explainPlan(db, "SELECT * FROM sessions WHERE agent_id = 'agent-1'");
		assertUsesIndex(plan, "sessions.agent_id");
	});

	it("uses an index for sessions lookup by state", () => {
		const plan = explainPlan(db, "SELECT * FROM sessions WHERE state = 'active'");
		assertUsesIndex(plan, "sessions.state");
	});

	it("uses an index for items lookup by thread_id", () => {
		const plan = explainPlan(db, "SELECT * FROM items WHERE thread_id = 'thread-1'");
		assertUsesIndex(plan, "items.thread_id");
	});

	it("uses an index for messages lookup by thread_id", () => {
		const plan = explainPlan(db, "SELECT * FROM messages WHERE thread_id = 'thread-1'");
		assertUsesIndex(plan, "messages.thread_id");
	});

	// @lore U1: bets.product_id dropped; bets.team_id now references `teams` (formerly `products`).
	// The bets_team_id_idx covers this query path.
	it("uses an index for bets lookup by team_id (formerly product_id)", () => {
		const plan = explainPlan(db, "SELECT * FROM bets WHERE team_id = 'p1'");
		assertUsesIndex(plan, "bets.team_id");
	});

	it("uses an index for bets lookup by status", () => {
		const plan = explainPlan(db, "SELECT * FROM bets WHERE status = 'committed'");
		assertUsesIndex(plan, "bets.status");
	});
});
