/**
 * Brownfield migration test for 0118: global team, default runner, factory-scope plugin retirement.
 *
 * Guard: if factory-scope plugins exist and no global team can be found, the migration
 * raises rather than producing a NULL-pk plugin id. Only the guard path is tested here —
 * item 2b (rehashing entity ids) is blocked: localId is not stored in plugin_contributions
 * so the new hash cannot be computed in SQL. FK list that would need updating:
 *   users.id → user_teams (cascade), messages.sender_id (restrict), threads.started_by (set null),
 *              threads.initiator_id (restrict), tasks.owner_agent_id (restrict), inbox.user_id (cascade),
 *              changes.user_id (cascade), user_skills.user_id (cascade)
 *   documents.id → tasks.source_document_id (set null)
 *   subscriptions.id → inbox.subscription_id (set null)
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

describe("migration 0118: global team + factory plugin guard — brownfield", () => {
	const clients: PGlite[] = [];
	const tempDirs: string[] = [];
	afterAll(async () => {
		await Promise.allSettled(clients.map((c) => c.close()));
		for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
	});

	it("raises when factory-scope plugins exist but no team is present", async () => {
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);
		const before = migrationsUpTo(117);
		tempDirs.push(before);
		await migrate(db, { migrationsFolder: before });

		// Seed: factory-scope plugin with no teams — the dangerous case
		await db.execute(sql`
			INSERT INTO users (id, kind, name, role, status, created_at)
			VALUES ('system:propagation', 'ai', 'system', 'system', 'active', ${NOW})`);
		await db.execute(sql`
			INSERT INTO plugins (id, name, version, state, scope_kind, source_kind, source_address, installed_at, updated_at)
			VALUES ('role-personas@factory', 'role-personas', '1.0.0', 'enabled', 'factory', 'bundled', 'role-personas', ${NOW}, ${NOW})`);

		const after = migrationsUpTo(118);
		tempDirs.push(after);
		await expect(migrate(db, { migrationsFolder: after })).rejects.toThrow(
			/migration 0118: factory-scope plugins exist but no global team/,
		);
	});

	it("migrates factory-scope plugins to the global team when a team exists", async () => {
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);
		const before = migrationsUpTo(117);
		tempDirs.push(before);
		await migrate(db, { migrationsFolder: before });

		const teamId = "team-acme";
		await db.execute(sql`
			INSERT INTO users (id, kind, name, role, status, created_at)
			VALUES
				('system:propagation', 'ai', 'system', 'system', 'active', ${NOW}),
				('u-finn', 'human', 'Finn', 'founder', 'active', ${NOW})`);
		await db.execute(sql`
			INSERT INTO teams (id, name, created_at) VALUES (${teamId}, 'Acme', ${NOW})`);
		await db.execute(sql`
			INSERT INTO user_teams (user_id, team_id) VALUES ('u-finn', ${teamId})`);
		await db.execute(sql`
			INSERT INTO plugins (id, name, version, state, scope_kind, source_kind, source_address, installed_at, updated_at)
			VALUES ('role-personas@factory', 'role-personas', '1.0.0', 'enabled', 'factory', 'bundled', 'role-personas', ${NOW}, ${NOW})`);
		await db.execute(sql`
			INSERT INTO plugin_contributions (id, plugin_id, kind, entity_id, created_at)
			VALUES ('pc-agent-1', 'role-personas@factory', 'agent', 'pa_oldhash000000000000000', ${NOW})`);
		await db.execute(sql`
			INSERT INTO users (id, kind, name, role, status, created_at)
			VALUES ('pa_oldhash000000000000000', 'ai', 'Persona agent', 'member', 'active', ${NOW})`);

		const after = migrationsUpTo(118);
		tempDirs.push(after);
		await expect(migrate(db, { migrationsFolder: after })).resolves.not.toThrow();

		// Plugin was renamed to team-scoped id and moved to global team
		const rows = (await db.execute(sql`SELECT id, scope_kind, scope_team_id FROM plugins`)) as {
			rows: Array<{ id: string; scope_kind: string; scope_team_id: string }>;
		};
		expect(rows.rows).toHaveLength(1);
		expect(rows.rows[0]?.scope_kind).toBe("team");
		expect(rows.rows[0]?.id).toBe(`role-personas@${teamId}`);

		// Plugin agent joined the global team
		const membership = (await db.execute(
			sql`SELECT user_id FROM user_teams WHERE user_id = 'pa_oldhash000000000000000'`,
		)) as { rows: Array<{ user_id: string }> };
		expect(membership.rows).toHaveLength(1);
	});
});
