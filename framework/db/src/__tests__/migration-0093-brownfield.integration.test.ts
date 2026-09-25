/**
 * Brownfield migration test for 0093 (drop the opinion-era storage).
 *
 * Before 0093 an install still carries storage nothing reads any more: the
 * `plugin_configuration_defaults` and `configuration_overrides` tables, the
 * reserved `builtin` plugins row, `configuration_default` rows in
 * `plugin_contributions`, and `users.email`. Seeds all of them beside live
 * rows — a team install with agent, subscription and document
 * contributions, and a person with an email — and asserts the dead storage
 * is gone while every live row survives.
 *
 * Asserts with raw `sql` only, like the neighbouring brownfield tests.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DIRNAME = fileURLToPath(new URL(".", import.meta.url));
const DRIZZLE_FOLDER = resolve(DIRNAME, "../../drizzle");
const PRE_MIGRATION_IDX = 92;
const MIGRATION_IDX = 93;
const NOW = "2026-01-01T00:00:00.000Z";

function makeTempMigrationsFolder(upToIdx: number): string {
	const tmpDir = mkdtempSync(join(tmpdir(), "drizzle-brownfield-0093-"));
	cpSync(DRIZZLE_FOLDER, tmpDir, { recursive: true });
	const journal = JSON.parse(readFileSync(join(DRIZZLE_FOLDER, "meta/_journal.json"), "utf-8")) as {
		entries: Array<{ idx: number }>;
	};
	journal.entries = journal.entries.filter((e) => e.idx <= upToIdx);
	writeFileSync(join(tmpDir, "meta/_journal.json"), JSON.stringify(journal, null, 2));
	return tmpDir;
}

describe("migration 0093: drop the opinion-era storage — brownfield", () => {
	const tempDirs: string[] = [];
	let client: PGlite;
	let db: ReturnType<typeof drizzle>;

	beforeAll(async () => {
		client = new PGlite();
		await client.waitReady;
		db = drizzle(client);

		const before = makeTempMigrationsFolder(PRE_MIGRATION_IDX);
		tempDirs.push(before);
		await migrate(db, { migrationsFolder: before });

		await db.execute(sql`
			INSERT INTO users (id, kind, name, role, status, created_at, email) VALUES
				('u-person', 'human', 'Person', 'founder', 'active', ${NOW}, 'person@example.com')
		`);
		await db.execute(sql`
			INSERT INTO plugins (id, name, version, state, scope_kind, scope_team_id, installed_at, updated_at) VALUES
				('role-personas@team-a', 'role-personas', '1.0.0', 'enabled', 'team', 'team-a', ${NOW}, ${NOW})
		`);
		await db.execute(sql`
			INSERT INTO plugin_contributions (id, plugin_id, kind, entity_id, created_at) VALUES
				('pc-agent', 'role-personas@team-a', 'agent', 'agent-builder', ${NOW}),
				('pc-sub', 'role-personas@team-a', 'subscription', 'sub-builder', ${NOW}),
				('pc-doc', 'role-personas@team-a', 'document', 'doc-guide', ${NOW}),
				('pc-default', 'role-personas@team-a', 'configuration_default', 'pcd-team', ${NOW})
		`);
		await db.execute(sql`
			INSERT INTO plugin_configuration_defaults
				(id, plugin_id, kind, key, default_value_json, default_version_hash, created_at, updated_at)
			VALUES
				('pcd-builtin', 'builtin', 'agent', 'builtin/assistant', '{}', 'h1', ${NOW}, ${NOW}),
				('pcd-team', 'role-personas@team-a', 'mcp_server', 'role-personas/server', '{}', 'h2', ${NOW}, ${NOW})
		`);
		await db.execute(sql`
			INSERT INTO configuration_overrides
				(id, default_id, kind, key, user_value_json, state, created_by_user_id, created_at, updated_at)
			VALUES
				('co-builtin', 'pcd-builtin', 'agent', 'builtin/assistant', '{"prompt":"mine"}', 'active', 'u-person', ${NOW}, ${NOW}),
				('co-loose', NULL, 'tool', 'some-tool', '{}', 'deleted', NULL, ${NOW}, ${NOW})
		`);

		const after = makeTempMigrationsFolder(MIGRATION_IDX);
		tempDirs.push(after);
		await migrate(db, { migrationsFolder: after });
	});

	afterAll(async () => {
		await client.close();
		for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
	});

	async function tableExists(name: string): Promise<boolean> {
		const rows = (
			await db.execute(
				sql`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${name}`,
			)
		).rows;
		return rows.length > 0;
	}

	it("drops the configuration defaults and overrides tables", async () => {
		expect(await tableExists("configuration_overrides")).toBe(false);
		expect(await tableExists("plugin_configuration_defaults")).toBe(false);
	});

	it("removes the reserved builtin plugins row and keeps every real install", async () => {
		const rows = (await db.execute(sql`SELECT id FROM plugins ORDER BY id`)).rows as Array<{
			id: string;
		}>;
		expect(rows).toEqual([{ id: "role-personas@team-a" }]);
	});

	it("deletes configuration_default contributions and keeps every agent, subscription and document one", async () => {
		const rows = (
			await db.execute(
				sql`SELECT id, plugin_id, kind, entity_id FROM plugin_contributions ORDER BY id`,
			)
		).rows;
		expect(rows).toEqual([
			{
				id: "pc-agent",
				plugin_id: "role-personas@team-a",
				kind: "agent",
				entity_id: "agent-builder",
			},
			{ id: "pc-doc", plugin_id: "role-personas@team-a", kind: "document", entity_id: "doc-guide" },
			{
				id: "pc-sub",
				plugin_id: "role-personas@team-a",
				kind: "subscription",
				entity_id: "sub-builder",
			},
		]);
	});

	it("refuses a configuration_default contribution from now on", async () => {
		let constraint: string | undefined;
		try {
			await db.execute(sql`
				INSERT INTO plugin_contributions (id, plugin_id, kind, entity_id, created_at)
				VALUES ('pc-late', 'role-personas@team-a', 'configuration_default', 'x', ${NOW})
			`);
		} catch (error) {
			constraint = (error as { cause?: { constraint?: string } }).cause?.constraint;
		}
		expect(constraint).toBe("plugin_contributions_kind_ck");
	});

	it("drops users.email and keeps the person", async () => {
		const columns = (
			await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email'`,
			)
		).rows;
		expect(columns).toEqual([]);
		const people = (await db.execute(sql`SELECT id, name FROM users WHERE id = 'u-person'`)).rows;
		expect(people).toEqual([{ id: "u-person", name: "Person" }]);
	});
});
