/**
 * Brownfield migration test for 0072 (the plugin ownership registry).
 *
 * Every installed plugin out there has its provenance spread across five
 * places: `users.plugin_id`, `routines.plugin_id`,
 * `plugin_configuration_defaults.plugin_id`, `knowledge_items.topic =
 * 'plugin:<id>'` and `knowledge_items.updated_by = 'plugin:<id>'`. The migration
 * has to collect all of it into one table, or uninstalling a plugin stops
 * finding what it installed.
 *
 * The `updated_by` case carries a second meaning that must survive: a document
 * whose `updated_by` no longer names its plugin is one a person edited, and a
 * reinstall must leave their version alone. That becomes `detached_at`.
 *
 * Applies 0..71, seeds a plugin with one of everything, applies 0072.
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
	const tmpDir = mkdtempSync(join(tmpdir(), "drizzle-brownfield-0072-"));
	cpSync(DRIZZLE_FOLDER, tmpDir, { recursive: true });
	const journal = JSON.parse(readFileSync(join(DRIZZLE_FOLDER, "meta/_journal.json"), "utf-8")) as {
		entries: Array<{ idx: number }>;
	};
	journal.entries = journal.entries.filter((e) => e.idx <= upToIdx);
	writeFileSync(join(tmpDir, "meta/_journal.json"), JSON.stringify(journal, null, 2));
	return tmpDir;
}

const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-02-02T00:00:00.000Z";

describe("migration 0072: the plugin ownership registry — brownfield", () => {
	const clients: PGlite[] = [];
	const tempDirs: string[] = [];

	afterAll(async () => {
		await Promise.allSettled(clients.map((c) => c.close()));
		for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
	});

	it("collects provenance from all five places into one table", { timeout: 120_000 }, async () => {
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);

		const folderBefore = makeTempMigrationsFolder(71);
		tempDirs.push(folderBefore);
		await migrate(db, { migrationsFolder: folderBefore });

		await db.execute(sql`
				INSERT INTO plugins (id, name, version, state, scope_kind, installed_at, updated_at)
				VALUES ('acme-pack', 'Acme Pack', '1.0.0', 'enabled', 'factory', ${NOW}, ${NOW})
			`);
		// An agent and a routine the plugin materialised, plus one of each that
		// nobody's plugin owns — those must NOT end up in the registry.
		await db.execute(sql`
				INSERT INTO users (id, name, role, kind, status, created_at, plugin_id)
				VALUES
					('agent-from-plugin', 'Packbot', 'builder', 'ai', 'active', ${NOW}, 'acme-pack'),
					('agent-of-nobody', 'Local', 'builder', 'ai', 'active', ${NOW}, NULL)
			`);
		await db.execute(sql`
				INSERT INTO routines (id, name, owner_agent_id, trigger_type, active, state, created_at, plugin_id)
				VALUES
					('routine-from-plugin', 'Sweep', 'agent-from-plugin', 'calendar', true, 'active', ${NOW}, 'acme-pack'),
					('routine-of-nobody', 'Mine', 'agent-of-nobody', 'calendar', true, 'active', ${NOW}, NULL)
			`);
		// Two contributed documents: one still the plugin's, one a person edited.
		await db.execute(sql`
				INSERT INTO knowledge_items
					(id, scope_kind, scope_id, topic, title, body, format, status, version, role, updated_by, created_at, updated_at)
				VALUES
					('ki-untouched', 'factory', NULL, 'plugin:acme-pack', 'Sweeping', 'As shipped.',
					 'markdown', 'active', 1, 'skill', 'plugin:acme-pack', ${NOW}, ${NOW}),
					('ki-edited', 'factory', NULL, 'plugin:acme-pack', 'Reviewing', 'My own version.',
					 'markdown', 'active', 2, 'skill', 'u-founder', ${NOW}, ${LATER}),
					('ki-of-nobody', 'factory', NULL, 'weekly-rhythm', 'Mine', 'Not a plugin.',
					 'markdown', 'active', 1, 'ordinary', 'u-founder', ${NOW}, ${NOW})
			`);
		// Kernel row and projection travel together, as knowledge always writes
		// them — a document with no projection is a state production cannot
		// produce, and `list()` would never see it.
		await db.execute(sql`
				INSERT INTO knowledge_app_projection (id, knowledge_item_id, layer, scope_id)
				VALUES
					('kp-untouched', 'ki-untouched', 'L4', NULL),
					('kp-edited', 'ki-edited', 'L4', NULL),
					('kp-of-nobody', 'ki-of-nobody', 'L4', NULL)
			`);
		await db.execute(sql`
				INSERT INTO plugin_configuration_defaults
					(id, plugin_id, kind, key, default_value_json, default_version_hash, created_at, updated_at)
				VALUES ('pcd-1', 'acme-pack', 'mcp_server', 'acme-pack/server', '{}', 'hash', ${NOW}, ${NOW})
			`);

		const folderAfter = makeTempMigrationsFolder(72);
		tempDirs.push(folderAfter);
		await migrate(db, { migrationsFolder: folderAfter });

		const rows = await db.execute<{
			kind: string;
			entity_id: string;
			plugin_id: string;
			detached_at: string | null;
		}>(sql`
				SELECT kind, entity_id, plugin_id, detached_at
				FROM plugin_contributions ORDER BY kind, entity_id
			`);
		const byEntity = new Map(rows.rows.map((r) => [r.entity_id, r]));

		// One row per contributed thing, and nothing else: the agent, the
		// routine, BOTH knowledge documents (the edited one is still the
		// plugin's contribution, just detached) and the configuration default.
		expect(rows.rows).toHaveLength(5);
		expect(byEntity.get("agent-from-plugin")?.kind).toBe("agent");
		expect(byEntity.get("routine-from-plugin")?.kind).toBe("routine");
		expect(byEntity.get("ki-untouched")?.kind).toBe("knowledge");
		expect(byEntity.get("ki-edited")?.kind).toBe("knowledge");
		expect(byEntity.get("pcd-1")?.kind).toBe("configuration_default");
		for (const r of rows.rows) expect(r.plugin_id).toBe("acme-pack");

		// Rows nobody's plugin owns stay out of it.
		expect(byEntity.has("agent-of-nobody")).toBe(false);
		expect(byEntity.has("routine-of-nobody")).toBe(false);
		expect(byEntity.has("ki-of-nobody")).toBe(false);

		// The edited document is recorded as the person's, so a reinstall
		// leaves their body alone.
		expect(byEntity.get("ki-edited")?.detached_at).toBe(LATER);
		expect(byEntity.get("ki-untouched")?.detached_at).toBeNull();

		// `topic` goes back to meaning a topic; a real one is untouched.
		const topics = await db.execute<{ id: string; topic: string | null }>(sql`
				SELECT id, topic FROM knowledge_items ORDER BY id
			`);
		const topicById = new Map(topics.rows.map((r) => [r.id, r.topic]));
		expect(topicById.get("ki-untouched")).toBeNull();
		expect(topicById.get("ki-edited")).toBeNull();
		expect(topicById.get("ki-of-nobody")).toBe("weekly-rhythm");

		// `updated_by` goes back to naming a person. It used to render in the
		// knowledge view as a raw `plugin:<id>` string.
		const authors = await db.execute<{ id: string; updated_by: string }>(sql`
				SELECT id, updated_by FROM knowledge_items ORDER BY id
			`);
		const authorById = new Map(authors.rows.map((r) => [r.id, r.updated_by]));
		expect(authorById.get("ki-untouched")).toBe("plugin");
		expect(authorById.get("ki-edited")).toBe("u-founder");

		// The two columns that were the plugin service's provenance sitting in
		// tables it does not own are gone.
		const cols = await db.execute<{ table_name: string }>(sql`
				SELECT table_name FROM information_schema.columns
				WHERE column_name = 'plugin_id' AND table_name IN ('users', 'routines')
			`);
		expect(cols.rows).toHaveLength(0);
	});

	it("a database with no plugins migrates to an empty registry", { timeout: 120_000 }, async () => {
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);

		const folderBefore = makeTempMigrationsFolder(71);
		tempDirs.push(folderBefore);
		await migrate(db, { migrationsFolder: folderBefore });

		await db.execute(sql`
				INSERT INTO users (id, name, role, kind, status, created_at)
				VALUES ('agent-plain', 'Plain', 'builder', 'ai', 'active', ${NOW})
			`);

		const folderAfter = makeTempMigrationsFolder(72);
		tempDirs.push(folderAfter);
		await migrate(db, { migrationsFolder: folderAfter });

		const rows = await db.execute<{ count: string }>(
			sql`SELECT count(*) AS count FROM plugin_contributions`,
		);
		expect(Number(rows.rows[0]?.count)).toBe(0);
	});
});
