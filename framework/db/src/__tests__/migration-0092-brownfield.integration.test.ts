/**
 * Brownfield migration test for 0092 (one plugins row per install).
 *
 * Before 0092 a plugin is one `plugins` row keyed by its manifest name,
 * whatever scope it was installed for. After it, the row id is the install
 * id: the manifest name for a factory install, `<name>@<teamId>` for a team
 * install, so two teams can each hold their own install of one plugin.
 * Seeds a factory row, a team row with its contributions and configuration
 * defaults, and a team row with no team id. Asserts the team row is renamed
 * with its child rows following, the other two are untouched, and the new
 * unique index admits a second team's install but not a duplicate one.
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
const PRE_MIGRATION_IDX = 91;
const MIGRATION_IDX = 92;
const NOW = "2026-01-01T00:00:00.000Z";

function makeTempMigrationsFolder(upToIdx: number): string {
	const tmpDir = mkdtempSync(join(tmpdir(), "drizzle-brownfield-0092-"));
	cpSync(DRIZZLE_FOLDER, tmpDir, { recursive: true });
	const journal = JSON.parse(readFileSync(join(DRIZZLE_FOLDER, "meta/_journal.json"), "utf-8")) as {
		entries: Array<{ idx: number }>;
	};
	journal.entries = journal.entries.filter((e) => e.idx <= upToIdx);
	writeFileSync(join(tmpDir, "meta/_journal.json"), JSON.stringify(journal, null, 2));
	return tmpDir;
}

describe("migration 0092: one plugins row per install — brownfield", () => {
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
			INSERT INTO plugins (id, name, version, state, scope_kind, scope_team_id, installed_at, updated_at) VALUES
				('document-management', 'document-management', '1.0.0', 'enabled', 'factory', NULL, ${NOW}, ${NOW}),
				('role-personas', 'role-personas', '1.0.0', 'enabled', 'team', 'team-a', ${NOW}, ${NOW}),
				('half-scoped', 'half-scoped', '1.0.0', 'enabled', 'team', NULL, ${NOW}, ${NOW})
		`);
		await db.execute(sql`
			INSERT INTO plugin_contributions (id, plugin_id, kind, entity_id, created_at) VALUES
				('pc-agent', 'role-personas', 'agent', 'agent-builder', ${NOW}),
				('pc-sub', 'role-personas', 'subscription', 'sub-builder', ${NOW}),
				('pc-factory', 'document-management', 'agent', 'agent-librarian', ${NOW})
		`);
		await db.execute(sql`
			INSERT INTO plugin_configuration_defaults
				(id, plugin_id, kind, key, default_value_json, default_version_hash, created_at, updated_at)
			VALUES ('pcd-builder', 'role-personas', 'agent', 'role-personas/builder', '{}', 'h1', ${NOW}, ${NOW})
		`);

		const after = makeTempMigrationsFolder(MIGRATION_IDX);
		tempDirs.push(after);
		await migrate(db, { migrationsFolder: after });
	});

	afterAll(async () => {
		await client.close();
		for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
	});

	/** The constraint a failing statement tripped, read off the driver error drizzle wraps. */
	async function constraintTripped(run: () => Promise<unknown>): Promise<string | undefined> {
		try {
			await run();
		} catch (error) {
			return ((error as { cause?: { constraint?: string } }).cause ?? {}).constraint;
		}
		return undefined;
	}

	async function pluginIds(): Promise<Array<{ id: string; name: string }>> {
		return (await db.execute(sql`SELECT id, name FROM plugins ORDER BY id`)).rows as Array<{
			id: string;
			name: string;
		}>;
	}

	it("renames a team install to <name>@<teamId> and leaves the factory, built-in and team-less rows alone", async () => {
		expect(await pluginIds()).toEqual([
			{ id: "builtin", name: "HyperIdle Built-ins" },
			{ id: "document-management", name: "document-management" },
			{ id: "half-scoped", name: "half-scoped" },
			{ id: "role-personas@team-a", name: "role-personas" },
		]);
	});

	it("carries the team install's contributions and configuration defaults to the new id", async () => {
		const contributions = (
			await db.execute(sql`SELECT id, plugin_id FROM plugin_contributions ORDER BY id`)
		).rows as Array<{ id: string; plugin_id: string }>;
		expect(contributions).toEqual([
			{ id: "pc-agent", plugin_id: "role-personas@team-a" },
			{ id: "pc-factory", plugin_id: "document-management" },
			{ id: "pc-sub", plugin_id: "role-personas@team-a" },
		]);
		const defaults = (
			await db.execute(sql`SELECT id, plugin_id FROM plugin_configuration_defaults ORDER BY id`)
		).rows as Array<{ id: string; plugin_id: string }>;
		expect(defaults).toEqual([{ id: "pcd-builder", plugin_id: "role-personas@team-a" }]);
	});

	it("lets a second team hold its own install of the same plugin", async () => {
		await db.execute(sql`
			INSERT INTO plugins (id, name, version, state, scope_kind, scope_team_id, installed_at, updated_at)
			VALUES ('role-personas@team-b', 'role-personas', '1.0.0', 'enabled', 'team', 'team-b', ${NOW}, ${NOW})
		`);
		const rows = (
			await db.execute(sql`SELECT id FROM plugins WHERE name = 'role-personas' ORDER BY id`)
		).rows as Array<{ id: string }>;
		expect(rows.map((r) => r.id)).toEqual(["role-personas@team-a", "role-personas@team-b"]);
	});

	it("refuses a second row for the same plugin, scope and team", async () => {
		const tripped = await constraintTripped(() =>
			db.execute(sql`
				INSERT INTO plugins (id, name, version, state, scope_kind, scope_team_id, installed_at, updated_at)
				VALUES ('role-personas-again', 'role-personas', '1.0.0', 'enabled', 'team', 'team-a', ${NOW}, ${NOW})
			`),
		);
		expect(tripped).toBe("plugins_name_scope_uq");
	});

	it("still refuses to delete a plugin whose configuration defaults remain, and cascades its contributions", async () => {
		const tripped = await constraintTripped(() =>
			db.execute(sql`DELETE FROM plugins WHERE id = 'role-personas@team-a'`),
		);
		expect(tripped).toBe("plugin_configuration_defaults_plugin_id_plugins_id_fk");
		await db.execute(sql`DELETE FROM plugins WHERE id = 'document-management'`);
		const rows = (
			await db.execute(sql`SELECT id FROM plugin_contributions WHERE id = 'pc-factory'`)
		).rows as Array<{ id: string }>;
		expect(rows).toEqual([]);
	});
});
