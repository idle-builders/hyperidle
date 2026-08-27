/**
 * Brownfield migration test for 0065 (BA9d purge strategy).
 *
 * Migration 0065 does two things on a live database:
 *   1. Soft-deletes all `routines` rows with id LIKE 'builtin:%'
 *      (sets active=false, deleted_at=NOW()).
 *   2. Migrates every `users` row with agent_category='strategy'
 *      to agent_category='individual'.
 *
 * Sanity-break: apply 0..64, seed strategy agents and builtin routines,
 * apply 0065, assert the expected data transformations.
 *
 * The green path ONLY passes if the migration actually runs. It goes red
 * if the WHERE clause is wrong, or if the soft-delete columns are missing.
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
	const tmpDir = mkdtempSync(join(tmpdir(), "drizzle-brownfield-0065-"));
	cpSync(DRIZZLE_FOLDER, tmpDir, { recursive: true });
	const journal = JSON.parse(readFileSync(join(DRIZZLE_FOLDER, "meta/_journal.json"), "utf-8")) as {
		entries: Array<{ idx: number }>;
	};
	journal.entries = journal.entries.filter((e) => e.idx <= upToIdx);
	writeFileSync(join(tmpDir, "meta/_journal.json"), JSON.stringify(journal, null, 2));
	return tmpDir;
}

const NOW = "2026-01-01T00:00:00.000Z";

describe("migration 0065: BA9d purge strategy — brownfield", () => {
	const clients: PGlite[] = [];
	const tempDirs: string[] = [];

	afterAll(async () => {
		await Promise.allSettled(clients.map((c) => c.close()));
		for (const d of tempDirs) {
			rmSync(d, { recursive: true, force: true });
		}
	});

	it("soft-deletes builtin routines and migrates strategy agents to individual", {
		timeout: 120_000,
	}, async () => {
		// Arrange: fresh PGlite at migration 0064 state
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);

		const folder64 = makeTempMigrationsFolder(64);
		tempDirs.push(folder64);
		await migrate(db, { migrationsFolder: folder64 });

		// Seed: system:propagation required by FK (users.id → messages.sender_id etc.)
		await db.execute(sql`
				INSERT INTO users (id, name, role, kind, status, created_at)
				VALUES ('system:propagation', 'Propagation System', 'system', 'ai', 'active', ${NOW})
			`);

		// Seed: two strategy agents
		await db.execute(sql`
				INSERT INTO users (id, name, role, kind, status, agent_category, created_at)
				VALUES
					('seed-agent-pf-facilitation', 'Facilitation Facilitator', 'facilitator', 'ai', 'active', 'strategy', ${NOW}),
					('seed-agent-scout-global', 'Global Scout', 'scout', 'ai', 'active', 'strategy', ${NOW})
			`);

		// Seed: one individual agent (must NOT be migrated)
		await db.execute(sql`
				INSERT INTO users (id, name, role, kind, status, agent_category, created_at)
				VALUES ('seed-agent-cos', 'System Agent', 'assistant', 'ai', 'active', 'individual', ${NOW})
			`);

		// Seed: one team agent (must NOT be migrated)
		await db.execute(sql`
				INSERT INTO teams (id, name, phase, created_at)
				VALUES ('team-demo', 'Demo Team', 'build', ${NOW})
			`);
		await db.execute(sql`
				INSERT INTO users (id, name, role, kind, status, agent_category, team_id, created_at)
				VALUES ('agent-builder-1', 'Demo Builder', 'builder', 'ai', 'active', 'team', 'team-demo', ${NOW})
			`);

		// Seed: two builtin routines (must be soft-deleted)
		await db.execute(sql`
				INSERT INTO routines (id, name, trigger_type, trigger_config, active, owner_agent_id, created_at)
				VALUES
					('builtin:post-bet-retro:team-demo', 'Post-Bet Retro', 'event', '{}', true, 'seed-agent-cos', ${NOW}),
					('builtin:knowledge-promotion', 'Knowledge Promotion', 'calendar', '{"cron":"0 3 * * *"}', true, 'seed-agent-cos', ${NOW})
			`);

		// Seed: one non-builtin routine (must NOT be soft-deleted)
		await db.execute(sql`
				INSERT INTO routines (id, name, trigger_type, trigger_config, active, owner_agent_id, created_at)
				VALUES ('user-routine-daily', 'Daily Standup', 'calendar', '{"cron":"0 9 * * 1-5"}', true, 'seed-agent-cos', ${NOW})
			`);

		// Seed: routine_runs referencing the builtin routines.
		// The migration does UPDATE (soft-delete), NOT DELETE, so the
		// onDelete:"restrict" FK on routine_runs.routine_id must NOT block it.
		await db.execute(sql`
				INSERT INTO routine_runs (id, routine_id, started_at, outcome)
				VALUES
					('run-post-bet-retro-1', 'builtin:post-bet-retro:team-demo', ${NOW}, 'success'),
					('run-knowledge-promotion-1', 'builtin:knowledge-promotion', ${NOW}, 'success')
			`);

		// Act: apply migration 0065
		const folder65 = makeTempMigrationsFolder(65);
		tempDirs.push(folder65);
		await migrate(db, { migrationsFolder: folder65 });

		// Assert 1: builtin routines are soft-deleted
		const builtinRoutines = await db.execute(sql`
				SELECT id, active, deleted_at
				FROM routines
				WHERE id LIKE 'builtin:%'
			`);
		for (const row of builtinRoutines.rows as Array<{
			id: string;
			active: boolean;
			deleted_at: string | null;
		}>) {
			expect(row.active, `${row.id} should be inactive`).toBe(false);
			expect(row.deleted_at, `${row.id} should have deleted_at set`).not.toBeNull();
		}
		expect(builtinRoutines.rows).toHaveLength(2);

		// Assert 2: non-builtin routine is untouched
		const userRoutine = await db.execute(sql`
				SELECT id, active, deleted_at FROM routines WHERE id = 'user-routine-daily'
			`);
		const ur = (
			userRoutine.rows as Array<{ id: string; active: boolean; deleted_at: string | null }>
		)[0];
		expect(ur?.active).toBe(true);
		expect(ur?.deleted_at).toBeNull();

		// Assert 3: strategy agents migrated to individual
		const strategyAgents = await db.execute(sql`
				SELECT id, agent_category FROM users WHERE id IN ('seed-agent-pf-facilitation', 'seed-agent-scout-global')
			`);
		for (const row of strategyAgents.rows as Array<{ id: string; agent_category: string }>) {
			expect(row.agent_category, `${row.id} should be individual`).toBe("individual");
		}

		// Assert 4: non-strategy agents untouched
		const unchanged = await db.execute(sql`
				SELECT id, agent_category FROM users WHERE id IN ('seed-agent-cos', 'agent-builder-1')
			`);
		const unchangedRows = unchanged.rows as Array<{ id: string; agent_category: string }>;
		expect(unchangedRows.find((r) => r.id === "seed-agent-cos")?.agent_category).toBe("individual");
		expect(unchangedRows.find((r) => r.id === "agent-builder-1")?.agent_category).toBe("team");
	});
});
