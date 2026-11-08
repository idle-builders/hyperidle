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

	it("sets global team on oldest, default runner on first person, adds humans to global team", async () => {
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);
		const before = migrationsUpTo(117);
		tempDirs.push(before);
		await migrate(db, { migrationsFolder: before });

		// Seed: system user + three humans + one agent
		await db.execute(sql`
			INSERT INTO users (id, kind, name, role, status, created_at)
			VALUES
				('system:propagation', 'ai', 'system', 'system', 'active', '2025-01-01T00:00:00.000Z'),
				('u-founder', 'human', 'Founder', 'founder', 'active', '2025-01-01T00:01:00.000Z'),
				('u-ada',     'human', 'Ada',     'member',  'active', '2025-01-01T00:02:00.000Z'),
				('u-bo',      'human', 'Bo',      'member',  'active', '2025-01-01T00:03:00.000Z'),
				('u-agent',   'ai',    'Bot',     'agent',   'active', '2025-01-01T00:04:00.000Z')`);

		// Seed: two teams — 'Oldest' created first (should become global)
		await db.execute(sql`
			INSERT INTO teams (id, name, created_at)
			VALUES
				('team-oldest', 'Oldest', '2025-01-01T00:00:00.000Z'),
				('team-newer',  'Newer',  '2025-01-02T00:00:00.000Z')`);

		// Memberships: founder in both; Ada only in Newer; agent in Newer only.
		// (Bo is not in any team — the global team step in 0118 must add them.)
		await db.execute(sql`
			INSERT INTO user_teams (user_id, team_id)
			VALUES
				('u-founder', 'team-oldest'),
				('u-founder', 'team-newer'),
				('u-ada',     'team-newer'),
				('u-agent',   'team-newer')`);

		const after = migrationsUpTo(118);
		tempDirs.push(after);
		await expect(migrate(db, { migrationsFolder: after })).resolves.not.toThrow();

		// Oldest team is the global team; newer is not.
		const globalRows = (await db.execute(sql`SELECT id FROM teams WHERE is_global = TRUE`)) as {
			rows: Array<{ id: string }>;
		};
		expect(globalRows.rows).toHaveLength(1);
		expect(globalRows.rows[0]?.id).toBe("team-oldest");

		// Bo (not in any team before migration) is now in the global team.
		const boMemberships = (await db.execute(
			sql`SELECT team_id FROM user_teams WHERE user_id = 'u-bo'`,
		)) as { rows: Array<{ team_id: string }> };
		expect(boMemberships.rows.map((r) => r.team_id)).toContain("team-oldest");

		// Exactly one default runner per team.
		const runnerRows = (await db.execute(
			sql`SELECT team_id, user_id FROM user_teams WHERE is_default_runner = TRUE`,
		)) as { rows: Array<{ team_id: string; user_id: string }> };
		const runnerByTeam = new Map(runnerRows.rows.map((r) => [r.team_id, r.user_id]));
		expect(runnerByTeam.size).toBe(2);
		// Oldest team's default runner is the founder (only human member).
		expect(runnerByTeam.get("team-oldest")).toBe("u-founder");
		// Newer team's default runner is the founder (joined first, by created_at).
		expect(runnerByTeam.get("team-newer")).toBe("u-founder");
	});

	it("unique index prevents a second team being marked global", async () => {
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);
		const before = migrationsUpTo(117);
		tempDirs.push(before);
		await migrate(db, { migrationsFolder: before });
		await db.execute(sql`
			INSERT INTO users (id, kind, name, role, status, created_at)
			VALUES ('system:propagation', 'ai', 'system', 'system', 'active', ${NOW}),
			       ('u-a', 'human', 'A', 'founder', 'active', ${NOW})`);
		await db.execute(sql`
			INSERT INTO teams (id, name, created_at)
			VALUES ('team-a', 'A', ${NOW}), ('team-b', 'B', ${NOW})`);
		await db.execute(sql`
			INSERT INTO user_teams (user_id, team_id) VALUES ('u-a', 'team-a')`);
		const after = migrationsUpTo(118);
		tempDirs.push(after);
		await migrate(db, { migrationsFolder: after });
		// After migration team-a is global (oldest). Attempting to set team-b global must fail.
		await expect(
			db.execute(sql`UPDATE teams SET is_global = TRUE WHERE id = 'team-b'`),
		).rejects.toThrow();
	});
});
