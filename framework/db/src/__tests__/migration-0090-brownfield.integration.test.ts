/**
 * Brownfield migration test for 0090 (team is a name).
 *
 * Seeds pre-0090 state: a human with no team plus an org edge whose target
 * is a real team (backfills from the edge), a human with no team and no
 * edge (backfills to the oldest team), an org edge whose target is a
 * pre-AU44 team_members id that names no team (skipped, not a special
 * case), a `routine_run` work intent, and history rows on
 * `sessions.source_kind`/`agent_session_requests.source_kind`/`prompt_mode`
 * carrying `'routine'`. Asserts the backfill, that org edges themselves are
 * untouched, that the `routine_run` intent is gone, and that the dropped
 * columns are actually gone from the schema.
 *
 * Asserts with raw `sql` only — no `@hyperidle/db` schema import — the same
 * reason 0089's own brownfield test gives: the `teams` schema export no
 * longer carries the columns this test seeds directly.
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
const PRE_MIGRATION_IDX = 89;
const MIGRATION_IDX = 90;

function makeTempMigrationsFolder(upToIdx: number): string {
	const tmpDir = mkdtempSync(join(tmpdir(), "drizzle-brownfield-0090-"));
	cpSync(DRIZZLE_FOLDER, tmpDir, { recursive: true });
	const journal = JSON.parse(readFileSync(join(DRIZZLE_FOLDER, "meta/_journal.json"), "utf-8")) as {
		entries: Array<{ idx: number }>;
	};
	journal.entries = journal.entries.filter((e) => e.idx <= upToIdx);
	writeFileSync(join(tmpDir, "meta/_journal.json"), JSON.stringify(journal, null, 2));
	return tmpDir;
}

const NOW = "2026-01-01T00:00:00.000Z";
const OLDER = "2025-12-01T00:00:00.000Z";
const NEWER = "2026-02-01T00:00:00.000Z";

describe("migration 0090: team is a name — brownfield", () => {
	const clients: PGlite[] = [];
	const tempDirs: string[] = [];

	afterAll(async () => {
		await Promise.allSettled(clients.map((c) => c.close()));
		for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
	});

	async function seedAndMigrate(): Promise<ReturnType<typeof drizzle>> {
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);

		const folderBefore = makeTempMigrationsFolder(PRE_MIGRATION_IDX);
		tempDirs.push(folderBefore);
		await migrate(db, { migrationsFolder: folderBefore });

		// Two real teams — "Oldest Team" is oldest by created_at, used as the
		// no-edge fallback.
		await db.execute(sql`
			INSERT INTO teams (id, name, phase, created_at) VALUES
				('team-oldest', 'Oldest Team', 'build', ${OLDER}),
				('team-newer', 'Newer Team', 'build', ${NEWER})
		`);

		// Human A: no team, one org edge (older) targeting a pre-fold
		// team_members id that names no team (skipped by construction), and a
		// second, newer edge targeting a real team — the oldest MATCHING edge
		// wins, not the oldest edge overall.
		await db.execute(sql`
			INSERT INTO users (id, name, kind, role, status, created_at) VALUES
				('human-a', 'Human A', 'human', 'founder', 'active', ${NOW})
		`);
		await db.execute(sql`
			INSERT INTO org_edges (id, from_user_id, mechanism, target, created_at) VALUES
				('edge-a-stale', 'human-a', 'team', 'team-members-pre-fold-id', ${OLDER}),
				('edge-a-real', 'human-a', 'team', 'team-newer', ${NEWER})
		`);

		// Human B: no team, no org edge at all — falls back to the oldest team.
		await db.execute(sql`
			INSERT INTO users (id, name, kind, role, status, created_at) VALUES
				('human-b', 'Human B', 'human', 'member', 'active', ${NOW})
		`);

		// An AI user with no team and no owner (a factory-scope agent) — never
		// backfilled; only kind='human' rows are.
		await db.execute(sql`
			INSERT INTO users (id, name, kind, role, status, created_at) VALUES
				('agent-factory', 'Factory Agent', 'ai', 'builder', 'active', ${NOW})
		`);

		// A dead routine_run work intent.
		await db.execute(sql`
			INSERT INTO agent_work_intents
				(id, kind, source_kind, source_id, idempotency_key, status, created_at, updated_at)
			VALUES
				('intent-routine-run', 'routine_run', 'routine_run', 'agent-factory', 'idem-1', 'pending', ${NOW}, ${NOW})
		`);

		// A history session/request row carrying the old 'routine' source_kind.
		await db.execute(sql`
			INSERT INTO threads (id, host_kind, host_id, initiator_id, participants, last_active_at, created_at)
			VALUES ('thr-1', 'team', 'team-oldest', 'agent-factory', '[]', ${NOW}, ${NOW})
		`);
		await db.execute(sql`
			INSERT INTO sessions (id, agent_id, source_kind, source_id, model_tier, started_at, state)
			VALUES ('session-1', 'agent-factory', 'routine', 'intent-routine-run', 'workhorse', ${NOW}, 'done')
		`);
		await db.execute(sql`
			INSERT INTO agent_session_requests
				(id, source_kind, source_id, stream_id, agent_id, prompt_mode, source_correlation_json, idempotency_key, status, created_at, updated_at)
			VALUES ('req-1', 'routine', 'src-1', 'thr-1', 'agent-factory', 'routine', '{}', 'idem-2', 'pending', ${NOW}, ${NOW})
		`);

		const folderAfter = makeTempMigrationsFolder(MIGRATION_IDX);
		tempDirs.push(folderAfter);
		await migrate(db, { migrationsFolder: folderAfter });

		return db;
	}

	it("backfills a human from the oldest org edge whose target is a real team, skipping a pre-fold target", async () => {
		const db = await seedAndMigrate();
		const [row] = (await db.execute(sql`SELECT team_id FROM users WHERE id = 'human-a'`)).rows as Array<{
			team_id: string | null;
		}>;
		expect(row?.team_id).toBe("team-newer");
	});

	it("backfills a human with no org edge to the oldest team", async () => {
		const db = await seedAndMigrate();
		const [row] = (await db.execute(sql`SELECT team_id FROM users WHERE id = 'human-b'`)).rows as Array<{
			team_id: string | null;
		}>;
		expect(row?.team_id).toBe("team-oldest");
	});

	it("never backfills an AI user (only kind='human' rows)", async () => {
		const db = await seedAndMigrate();
		const [row] = (
			await db.execute(sql`SELECT team_id FROM users WHERE id = 'agent-factory'`)
		).rows as Array<{ team_id: string | null }>;
		expect(row?.team_id).toBeNull();
	});

	it("leaves org edges themselves untouched", async () => {
		const db = await seedAndMigrate();
		const rows = (
			await db.execute(sql`SELECT id, target FROM org_edges ORDER BY id`)
		).rows as Array<{ id: string; target: string }>;
		expect(rows).toEqual([
			{ id: "edge-a-real", target: "team-newer" },
			{ id: "edge-a-stale", target: "team-members-pre-fold-id" },
		]);
	});

	it("deletes the routine_run work intent", async () => {
		const db = await seedAndMigrate();
		const rows = (
			await db.execute(sql`SELECT id FROM agent_work_intents WHERE kind = 'routine_run'`)
		).rows as Array<{ id: string }>;
		expect(rows).toHaveLength(0);
	});

	it("respells sessions.source_kind and agent_session_requests.source_kind/prompt_mode from routine to subscription", async () => {
		const db = await seedAndMigrate();
		const [session] = (
			await db.execute(sql`SELECT source_kind FROM sessions WHERE id = 'session-1'`)
		).rows as Array<{ source_kind: string }>;
		expect(session?.source_kind).toBe("subscription");
		const [request] = (
			await db.execute(
				sql`SELECT source_kind, prompt_mode FROM agent_session_requests WHERE id = 'req-1'`,
			)
		).rows as Array<{ source_kind: string; prompt_mode: string }>;
		expect(request?.source_kind).toBe("subscription");
		expect(request?.prompt_mode).toBe("subscription");
	});

	it("drops the team columns and sessions.routine_id", async () => {
		const db = await seedAndMigrate();
		const teamCols = (
			await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'teams'`,
			)
		).rows as Array<{ column_name: string }>;
		const teamColNames = teamCols.map((c) => c.column_name);
		expect(teamColNames.sort()).toEqual(["created_at", "id", "name"]);

		const sessionCols = (
			await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'sessions'`,
			)
		).rows as Array<{ column_name: string }>;
		expect(sessionCols.map((c) => c.column_name)).not.toContain("routine_id");
	});
});
