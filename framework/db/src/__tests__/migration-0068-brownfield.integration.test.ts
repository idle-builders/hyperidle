/**
 * BB1 AC9 — brownfield migration test for 0068 (one work primitive).
 *
 * A database seeded before this carries `bets` rows and `tasks.bet_id`. The
 * migration turns every bet into a ROOT task, reparents its tasks under it,
 * re-points the rows that referenced a bet by id, and drops the old shape. This
 * applies 0..67 against a populated database, applies 0068, and asserts the data
 * actually survived — counts, parentage, the derived title, the state and
 * verdict mappings, and zero orphans.
 *
 * @lore BB1: the trap this exists for is the one BA1 hit — a migration test that
 * hand-writes its own pre-migration schema can pass while every real upgrade
 * aborts. So the pre-state here is produced by running the REAL migrations 0..67,
 * never by hand-rolled DDL.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, describe, expect, it } from "vitest";

const DIRNAME = fileURLToPath(new URL(".", import.meta.url));
const DRIZZLE_FOLDER = resolve(DIRNAME, "../../drizzle");

function makeTempMigrationsFolder(upToIdx: number): string {
	const tmpDir = mkdtempSync(join(tmpdir(), "drizzle-brownfield-0068-"));
	cpSync(DRIZZLE_FOLDER, tmpDir, { recursive: true });
	const journal = JSON.parse(readFileSync(join(DRIZZLE_FOLDER, "meta/_journal.json"), "utf-8")) as {
		entries: Array<{ idx: number }>;
	};
	journal.entries = journal.entries.filter((e) => e.idx <= upToIdx);
	writeFileSync(join(tmpDir, "meta/_journal.json"), JSON.stringify(journal, null, 2));
	return tmpDir;
}

const NOW = "2026-01-01T00:00:00.000Z";

describe("migration 0068: bets become root tasks — brownfield", () => {
	const clients: PGlite[] = [];
	const tempDirs: string[] = [];

	afterAll(async () => {
		await Promise.allSettled(clients.map((c) => c.close()));
		for (const d of tempDirs) {
			rmSync(d, { recursive: true, force: true });
		}
	});

	it(
		"turns every bet into a root task and reparents its tasks under it",
		{ timeout: 180_000 },
		async () => {
			const client = new PGlite();
			clients.push(client);
			await client.waitReady;
			const db = drizzle(client);

			const folder67 = makeTempMigrationsFolder(67);
			tempDirs.push(folder67);
			await migrate(db, { migrationsFolder: folder67 });

			await db.execute(sql`
				INSERT INTO teams (id, name, phase, capacity, active_bets, created_at)
				VALUES ('team-1', 'Team One', 'build', 5, 2, ${NOW})
			`);

			// Four bets covering every status and every outcome verdict, plus the
			// two title shapes the derivation has to handle: a markdown heading,
			// and a description whose first line is blank.
			await db.execute(sql`
				INSERT INTO bets (id, team_id, description, done_condition, status, revision_log,
				                  outcome_verdict, outcome_summary, tokens_actual_json,
				                  at_risk, created_at, completed_at)
				VALUES
					('b-1', 'team-1', '# Ship the editor', 'Editor ships', 'active', 'rev-1',
					 NULL, NULL, '{"byTier":{"high":{"prompt":10,"completion":20}}}', 0, ${NOW}, NULL),
					('b-2', 'team-1', E'\n\nPlain first line here', NULL, 'completed', NULL,
					 'validated', 'It worked', NULL, 0, ${NOW}, ${NOW}),
					('b-3', 'team-1', '## Refuted idea', NULL, 'killed', NULL,
					 'refuted', NULL, NULL, 0, ${NOW}, NULL),
					('b-4', 'team-1', 'Inconclusive one', NULL, 'draft', NULL,
					 'inconclusive', NULL, NULL, 0, ${NOW}, NULL)
			`);

			await db.execute(sql`
				INSERT INTO tasks (id, bet_id, team_id, title, state, created_at, updated_at)
				VALUES
					('t-1', 'b-1', 'team-1', 'Design it', 'done', ${NOW}, ${NOW}),
					('t-2', 'b-1', 'team-1', 'Build it', 'in_progress', ${NOW}, ${NOW}),
					('t-3', 'b-2', 'team-1', 'Old task', 'done', ${NOW}, ${NOW})
			`);

			// A knowledge item scoped to a bet, and its projection row.
			await db.execute(sql`
				INSERT INTO knowledge_items (id, title, body, format, status, scope_kind, scope_id, created_at, updated_at, updated_by)
				VALUES ('k-1', 'Retro of b-1', 'body', 'markdown', 'active', 'bet', 'b-1', ${NOW}, ${NOW}, 'u-1')
			`);
			await db.execute(sql`
				INSERT INTO knowledge_app_projection (id, knowledge_item_id, scope_id)
				VALUES ('kp-1', 'k-1', 'b-1')
			`);

			// A thread hosted on a bet.
			await db.execute(sql`
				INSERT INTO threads (id, host_kind, host_id, initiator_id, participants, created_at, last_active_at)
				VALUES ('th-1', 'bet', 'b-1', 'u-1', '["u-1"]', ${NOW}, ${NOW})
			`);

			// --- apply 0068 ---
			const folder68 = makeTempMigrationsFolder(68);
			tempDirs.push(folder68);
			await migrate(db, { migrationsFolder: folder68 });

			// The old shape is gone entirely.
			const betsTable = await db.execute(sql`
				SELECT to_regclass('public.bets') AS reg
			`);
			expect((betsTable.rows[0] as { reg: string | null }).reg).toBeNull();

			const betIdCol = await db.execute(sql`
				SELECT column_name FROM information_schema.columns
				WHERE table_name = 'tasks' AND column_name = 'bet_id'
			`);
			expect(betIdCol.rows).toHaveLength(0);

			const activeBetsCol = await db.execute(sql`
				SELECT column_name FROM information_schema.columns
				WHERE table_name = 'teams' AND column_name = 'active_bets'
			`);
			expect(activeBetsCol.rows).toHaveLength(0);

			// Four bets produced four root tasks; the three original tasks are
			// still there and are no longer roots. Seven rows total.
			const counts = await db.execute(sql`
				SELECT
					count(*) FILTER (WHERE parent_task_id IS NULL) AS roots,
					count(*) AS total
				FROM tasks
			`);
			expect(counts.rows[0]).toMatchObject({ roots: 4, total: 7 });

			// Parentage: b-1's two tasks hang off b-1's root.
			const children = await db.execute(sql`
				SELECT id FROM tasks WHERE parent_task_id = 'b-1' ORDER BY id
			`);
			expect(children.rows.map((r) => (r as { id: string }).id)).toEqual(["t-1", "t-2"]);

			// Title derivation: heading stripped, blank first line skipped.
			const titles = await db.execute(sql`
				SELECT id, title FROM tasks WHERE parent_task_id IS NULL ORDER BY id
			`);
			expect(titles.rows).toEqual([
				{ id: "b-1", title: "Ship the editor" },
				{ id: "b-2", title: "Plain first line here" },
				{ id: "b-3", title: "Refuted idea" },
				{ id: "b-4", title: "Inconclusive one" },
			]);

			// Status -> state, and verdict -> the surviving task vocabulary.
			// `inconclusive` has no honest equivalent and becomes NULL.
			const mapped = await db.execute(sql`
				SELECT id, state, outcome_verdict FROM tasks WHERE parent_task_id IS NULL ORDER BY id
			`);
			expect(mapped.rows).toEqual([
				{ id: "b-1", state: "in_progress", outcome_verdict: null },
				{ id: "b-2", state: "done", outcome_verdict: "met" },
				{ id: "b-3", state: "killed", outcome_verdict: "not_met" },
				{ id: "b-4", state: "proposed", outcome_verdict: null },
			]);

			// The moved columns carried their values.
			const moved = await db.execute(sql`
				SELECT tokens_actual_json, notes, completed_at
				FROM tasks WHERE id = 'b-1'
			`);
			expect(moved.rows[0]).toMatchObject({
				tokens_actual_json: '{"byTier":{"high":{"prompt":10,"completion":20}}}',
				notes: "rev-1",
			});

			// Everything that referenced a bet by id now references its root task.
			const ki = await db.execute(sql`
				SELECT scope_kind, scope_id FROM knowledge_items WHERE id = 'k-1'
			`);
			expect(ki.rows[0]).toEqual({ scope_kind: "task", scope_id: "b-1" });

			const proj = await db.execute(sql`
				SELECT scope_id FROM knowledge_app_projection WHERE id = 'kp-1'
			`);
			expect(proj.rows[0]).toEqual({ scope_id: "b-1" });

			const thread = await db.execute(sql`
				SELECT host_kind, host_id FROM threads WHERE id = 'th-1'
			`);
			expect(thread.rows[0]).toEqual({ host_kind: "task", host_id: "b-1" });

			// Zero orphans: every non-root task's parent exists.
			const orphans = await db.execute(sql`
				SELECT count(*) AS n FROM tasks t
				WHERE t.parent_task_id IS NOT NULL
				  AND NOT EXISTS (SELECT 1 FROM tasks p WHERE p.id = t.parent_task_id)
			`);
			expect(orphans.rows[0]).toEqual({ n: 0 });
		},
	);

	it("is a no-op on a database with no bets", { timeout: 180_000 }, async () => {
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);

		const folder67 = makeTempMigrationsFolder(67);
		tempDirs.push(folder67);
		await migrate(db, { migrationsFolder: folder67 });

		const folder68 = makeTempMigrationsFolder(68);
		tempDirs.push(folder68);
		await migrate(db, { migrationsFolder: folder68 });

		const counts = await db.execute(sql`SELECT count(*) AS n FROM tasks`);
		expect(counts.rows[0]).toEqual({ n: 0 });
	});
});
