/**
 * Brownfield migration test for 0118: global team, default runner, factory-scope plugin deletion.
 *
 * Verifies that factory-scope plugin installs and everything they contributed
 * (agents, subscriptions, documents, plugin_contributions rows) are deleted.
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
const NOW = "2026-01-01T00:00:00.000Z";

function migrationsUpTo(idx: number): string {
	const tmpDir = mkdtempSync(join(tmpdir(), "drizzle-brownfield-0118-"));
	cpSync(DRIZZLE_FOLDER, tmpDir, { recursive: true });
	const journal = JSON.parse(readFileSync(join(DRIZZLE_FOLDER, "meta/_journal.json"), "utf-8")) as {
		entries: Array<{ idx: number }>;
	};
	journal.entries = journal.entries.filter((e) => e.idx <= idx);
	writeFileSync(join(tmpDir, "meta/_journal.json"), JSON.stringify(journal, null, 2));
	return tmpDir;
}

describe("migration 0118: global team + factory plugin deletion — brownfield", () => {
	const clients: PGlite[] = [];
	const tempDirs: string[] = [];
	afterAll(async () => {
		await Promise.allSettled(clients.map((c) => c.close()));
		for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
	});

	it("deletes factory install and all its contributions", async () => {
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);
		const before = migrationsUpTo(117);
		tempDirs.push(before);
		await migrate(db, { migrationsFolder: before });

		// Seed: human founder + a team (needed for the global-team step in 0118)
		const teamId = "team-acme";
		await db.execute(sql`
			INSERT INTO users (id, kind, name, role, status, created_at)
			VALUES
				('system:propagation', 'ai', 'system', 'system', 'active', ${NOW}),
				('u-finn', 'human', 'Finn', 'founder', 'active', ${NOW}),
				('pa_agent000000000000000', 'ai', 'Persona agent', 'member', 'active', ${NOW})`);
		await db.execute(sql`
			INSERT INTO teams (id, name, created_at) VALUES (${teamId}, 'Acme', ${NOW})`);
		await db.execute(sql`
			INSERT INTO user_teams (user_id, team_id) VALUES ('u-finn', ${teamId})`);

		// Seed: factory-scope plugin install
		await db.execute(sql`
			INSERT INTO plugins (id, name, version, state, scope_kind, source_kind, source_address, installed_at, updated_at)
			VALUES ('role-personas@factory', 'role-personas', '1.0.0', 'enabled', 'factory', 'bundled', 'role-personas', ${NOW}, ${NOW})`);

		// Seed: contributed agent
		await db.execute(sql`
			INSERT INTO plugin_contributions (id, plugin_id, kind, entity_id, created_at)
			VALUES ('pc-agent-1', 'role-personas@factory', 'agent', 'pa_agent000000000000000', ${NOW})`);

		// Seed: contributed subscription (owned by the contributed agent)
		await db.execute(sql`
			INSERT INTO subscriptions (id, user_id, event, created_at, updated_at)
			VALUES ('sub-factory-1', 'pa_agent000000000000000', 'task.created', ${NOW}, ${NOW})`);
		await db.execute(sql`
			INSERT INTO plugin_contributions (id, plugin_id, kind, entity_id, created_at)
			VALUES ('pc-sub-1', 'role-personas@factory', 'subscription', 'sub-factory-1', ${NOW})`);

		const after = migrationsUpTo(118);
		tempDirs.push(after);
		await expect(migrate(db, { migrationsFolder: after })).resolves.not.toThrow();

		// Factory plugin is gone
		const plugins = (await db.execute(
			sql`SELECT id FROM plugins WHERE scope_kind = 'factory'`,
		)) as { rows: Array<{ id: string }> };
		expect(plugins.rows).toHaveLength(0);

		// plugin_contributions for the factory plugin are gone (cascaded)
		const contributions = (await db.execute(sql`SELECT id FROM plugin_contributions`)) as {
			rows: Array<{ id: string }>;
		};
		expect(contributions.rows).toHaveLength(0);

		// Contributed agent is gone
		const agents = (await db.execute(
			sql`SELECT id FROM users WHERE id = 'pa_agent000000000000000'`,
		)) as { rows: Array<{ id: string }> };
		expect(agents.rows).toHaveLength(0);

		// Contributed subscription is gone
		const subs = (await db.execute(
			sql`SELECT id FROM subscriptions WHERE id = 'sub-factory-1'`,
		)) as { rows: Array<{ id: string }> };
		expect(subs.rows).toHaveLength(0);
	});
});
