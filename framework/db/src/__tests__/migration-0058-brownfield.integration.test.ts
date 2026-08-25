/**
 * Regression test for the 0058 migration ordering defect.
 *
 * The defect: step 3 (re-point users.team_id → teams.id) ran BEFORE step 4
 * (drop the FK users.team_id → team_members). Writing a teams.id into a column
 * still constrained to hold a team_members.id caused Postgres to reject the
 * UPDATE with a FK violation, aborting the migration on every populated database.
 *
 * The fix: step 4 (FK drop) now runs first. This test seeds a database to the
 * pre-0058 real-world shape — a team, a team_members row, and users whose
 * team_id points at the team_members row — and asserts the full migration set
 * applies cleanly.
 *
 * Why a brownfield test: the pooled fixture always runs all migrations before
 * any test, so the pool cannot expose the pre-0058 schema. This test creates
 * its own raw PGlite instance, applies 0..57 only, seeds the fixture, then
 * runs the remaining migrations.
 *
 * Sanity-break: this test goes RED against the original (unreordered) 0058
 * because the UPDATE on users.team_id fires the FK violation while the
 * team_members constraint is still in place. It goes GREEN against the fixed
 * version where the FK is dropped first.
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

/**
 * Create a temp migrations folder whose journal contains only entries 0..upToIdx.
 * Returns the temp directory path; caller must clean it up.
 */
function makeTempMigrationsFolder(upToIdx: number): string {
	const tmpDir = mkdtempSync(join(tmpdir(), "drizzle-brownfield-"));
	cpSync(DRIZZLE_FOLDER, tmpDir, { recursive: true });
	const journal = JSON.parse(readFileSync(join(DRIZZLE_FOLDER, "meta/_journal.json"), "utf-8")) as {
		entries: Array<{ idx: number }>;
	};
	journal.entries = journal.entries.filter((e) => e.idx <= upToIdx);
	writeFileSync(join(tmpDir, "meta/_journal.json"), JSON.stringify(journal, null, 2));
	return tmpDir;
}

describe("migration 0058: brownfield upgrade with team_members data", () => {
	const clients: PGlite[] = [];
	const tempDirs: string[] = [];

	afterAll(async () => {
		await Promise.allSettled(clients.map((c) => c.close()));
		for (const d of tempDirs) {
			rmSync(d, { recursive: true, force: true });
		}
	});

	it("completes on a database seeded with a team, a team_members row, and users belonging to it", {
		timeout: 120_000,
	}, async () => {
		// Arrange: fresh PGlite at migration 0057 state
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);

		const folder57 = makeTempMigrationsFolder(57);
		tempDirs.push(folder57);
		await migrate(db, { migrationsFolder: folder57 });

		// Seed: one team (teams table at 0057 has no capacity/formed_at yet)
		await db.execute(sql`
				INSERT INTO teams (id, name, phase, created_at)
				VALUES ('demo-team-acme', 'Acme Corp', 'build', '2024-01-01T00:00:00Z')
			`);

		// Seed: one team_members row pointing at the team
		// (team_members at 0057: id, team_id, members, lead_agent_id, capacity NOT NULL, active_bets NOT NULL, formed_at NOT NULL, dissolved_at)
		await db.execute(sql`
				INSERT INTO team_members (id, team_id, capacity, active_bets, formed_at)
				VALUES ('demo-team-members-acme', 'demo-team-acme', 5, 0, '2024-01-01T00:00:00Z')
			`);

		// Seed: two users whose team_id references team_members.id
		// (users at 0057: id, name, team_id, role NOT NULL, status NOT NULL, created_at NOT NULL, kind)
		await db.execute(sql`
				INSERT INTO users (id, name, role, status, created_at, team_id)
				VALUES
					('agent-alice', 'Alice', 'member', 'active', '2024-01-01T00:00:00Z', 'demo-team-members-acme'),
					('agent-bob',   'Bob',   'member', 'active', '2024-01-01T00:00:00Z', 'demo-team-members-acme')
			`);

		// Verify FK is live before running 0058 — this is what causes the defect
		const fkCheck = await db.execute(sql`
				SELECT con.conname
				FROM pg_constraint con
				JOIN pg_class ref ON ref.oid = con.confrelid
				WHERE ref.relname = 'team_members' AND con.contype = 'f'
			`);
		expect(
			(fkCheck as unknown as { rows: Array<{ conname: string }> }).rows.length,
			"FK from users → team_members must be in place before 0058 runs",
		).toBeGreaterThan(0);

		// Act: apply the remaining migrations (0058..0061)
		// With the broken 0058 (step 3 before step 4), this throws:
		//   "insert or update on table "users" violates foreign key constraint
		//    "agents_team_id_teams_id_fk""
		let migrationError: unknown;
		try {
			await migrate(db, { migrationsFolder: DRIZZLE_FOLDER });
		} catch (e) {
			migrationError = e;
		}

		// Assert: no FK violation, migration completed
		expect(
			migrationError,
			"migration 0058 aborted with a FK constraint violation — the FK drop must run before the re-point UPDATE",
		).toBeUndefined();

		// Assert post-migration state: team_members dissolved
		const tables = await db.execute(
			sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
		);
		const tableNames = (tables as unknown as { rows: Array<{ tablename: string }> }).rows.map(
			(r) => r.tablename,
		);
		expect(tableNames).not.toContain("team_members");

		// Assert: users.team_id re-pointed from team_members.id to teams.id
		const users = await db.execute(sql`
				SELECT id, team_id FROM users
				WHERE id IN ('agent-alice', 'agent-bob')
				ORDER BY id
			`);
		const userRows = (users as unknown as { rows: Array<Record<string, string>> }).rows;
		expect(userRows).toHaveLength(2);
		for (const row of userRows) {
			expect(row["team_id"]).toBe("demo-team-acme");
		}

		// Assert: new FK from users.team_id → teams is in place
		const newFk = await db.execute(sql`
				SELECT con.conname
				FROM pg_constraint con
				JOIN pg_class src ON src.oid = con.conrelid
				JOIN pg_class ref ON ref.oid = con.confrelid
				WHERE src.relname = 'users' AND ref.relname = 'teams' AND con.contype = 'f'
			`);
		expect(
			(newFk as unknown as { rows: Array<{ conname: string }> }).rows.length,
			"new FK users.team_id → teams must be in place after 0058",
		).toBeGreaterThan(0);
	});

	it("also applies cleanly from a fully empty database (no regression on the fresh-install path)", {
		timeout: 120_000,
	}, async () => {
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);

		let migrationError: unknown;
		try {
			await migrate(db, { migrationsFolder: DRIZZLE_FOLDER });
		} catch (e) {
			migrationError = e;
		}

		expect(
			migrationError,
			"full migration set must apply cleanly from an empty database",
		).toBeUndefined();

		const tables = await db.execute(
			sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
		);
		const tableNames = (tables as unknown as { rows: Array<{ tablename: string }> }).rows.map(
			(r) => r.tablename,
		);
		expect(tableNames).not.toContain("team_members");
		expect(tableNames).toContain("teams");
		expect(tableNames).toContain("users");
	});
});
