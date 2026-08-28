/**
 * Brownfield migration test for 0066 (BA9d plugin_id columns).
 *
 * Migration 0066 adds a nullable `plugin_id` column to `routines` and `users`.
 *
 * Sanity-break: apply 0..65, seed rows without plugin_id, apply 0066, assert:
 *   - existing rows survive with plugin_id = NULL (no backfill)
 *   - new rows can be written with a plugin_id value
 *
 * The green path ONLY passes if the migration actually runs. It goes red
 * if either ALTER TABLE is missing or if the breakpoint separator is absent
 * (PGlite rejects two ALTER TABLE statements in one prepared statement).
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
	const tmpDir = mkdtempSync(join(tmpdir(), "drizzle-brownfield-0066-"));
	cpSync(DRIZZLE_FOLDER, tmpDir, { recursive: true });
	const journal = JSON.parse(readFileSync(join(DRIZZLE_FOLDER, "meta/_journal.json"), "utf-8")) as {
		entries: Array<{ idx: number }>;
	};
	journal.entries = journal.entries.filter((e) => e.idx <= upToIdx);
	writeFileSync(join(tmpDir, "meta/_journal.json"), JSON.stringify(journal, null, 2));
	return tmpDir;
}

const NOW = "2026-01-01T00:00:00.000Z";

describe("migration 0066: BA9d plugin_id columns — brownfield", () => {
	const clients: PGlite[] = [];
	const tempDirs: string[] = [];

	afterAll(async () => {
		await Promise.allSettled(clients.map((c) => c.close()));
		for (const d of tempDirs) {
			rmSync(d, { recursive: true, force: true });
		}
	});

	it("adds plugin_id to routines and users; existing rows survive with NULL", {
		timeout: 120_000,
	}, async () => {
		// Arrange: fresh PGlite at migration 0065 state
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);

		const folder65 = makeTempMigrationsFolder(65);
		tempDirs.push(folder65);
		await migrate(db, { migrationsFolder: folder65 });

		// Seed: required system user
		await db.execute(sql`
				INSERT INTO users (id, name, role, kind, status, created_at)
				VALUES ('system:propagation', 'Propagation System', 'system', 'ai', 'active', ${NOW})
			`);

		// Seed: a pre-existing agent (no plugin_id column yet)
		await db.execute(sql`
				INSERT INTO users (id, name, role, kind, status, agent_category, created_at)
				VALUES ('pre-existing-agent', 'Legacy Agent', 'assistant', 'ai', 'active', 'individual', ${NOW})
			`);

		// Seed: a pre-existing routine (no plugin_id column yet)
		await db.execute(sql`
				INSERT INTO routines (id, name, trigger_type, trigger_config, active, owner_agent_id, created_at)
				VALUES ('pre-existing-routine', 'Daily Digest', 'calendar', '{"cron":"0 9 * * 1-5"}', true, 'pre-existing-agent', ${NOW})
			`);

		// Act: apply migration 0066
		const folder66 = makeTempMigrationsFolder(66);
		tempDirs.push(folder66);
		await migrate(db, { migrationsFolder: folder66 });

		// Assert 1: existing user row survives with plugin_id = NULL
		const agentRows = await db.execute(sql`
				SELECT id, plugin_id FROM users WHERE id = 'pre-existing-agent'
			`);
		const agentRow = (agentRows.rows as Array<{ id: string; plugin_id: string | null }>)[0];
		expect(agentRow).toBeDefined();
		expect(agentRow?.plugin_id).toBeNull();

		// Assert 2: existing routine row survives with plugin_id = NULL
		const routineRows = await db.execute(sql`
				SELECT id, plugin_id FROM routines WHERE id = 'pre-existing-routine'
			`);
		const routineRow = (routineRows.rows as Array<{ id: string; plugin_id: string | null }>)[0];
		expect(routineRow).toBeDefined();
		expect(routineRow?.plugin_id).toBeNull();

		// Assert 3: new rows can set plugin_id
		await db.execute(sql`
				INSERT INTO users (id, name, role, kind, status, agent_category, plugin_id, created_at)
				VALUES ('plugin-agent-km', 'Knowledge Librarian', 'knowledge-librarian', 'ai', 'active', 'individual', 'knowledge-management', ${NOW})
			`);
		await db.execute(sql`
				INSERT INTO routines (id, name, trigger_type, trigger_config, active, owner_agent_id, plugin_id, created_at)
				VALUES ('km-decay', 'Knowledge Decay', 'calendar', '{"cron":"0 3 * * 0"}', true, 'plugin-agent-km', 'knowledge-management', ${NOW})
			`);

		const pluginAgent = await db.execute(sql`
				SELECT plugin_id FROM users WHERE id = 'plugin-agent-km'
			`);
		expect((pluginAgent.rows as Array<{ plugin_id: string | null }>)[0]?.plugin_id).toBe(
			"knowledge-management",
		);

		const pluginRoutine = await db.execute(sql`
				SELECT plugin_id FROM routines WHERE id = 'km-decay'
			`);
		expect((pluginRoutine.rows as Array<{ plugin_id: string | null }>)[0]?.plugin_id).toBe(
			"knowledge-management",
		);
	});
});
