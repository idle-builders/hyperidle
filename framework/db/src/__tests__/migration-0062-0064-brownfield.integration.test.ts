/**
 * Brownfield upgrade test for migrations 0062–0064.
 *
 * 0062 (agent_model_options): adds nullable model_options_json to agent_run_config.
 * 0063 (BA9b_knowledge_role): adds NOT NULL role text DEFAULT 'ordinary' to knowledge_items,
 *   with a CHECK constraint and an index.
 * 0064 (BA9b_plugin_install_path): adds nullable install_path to plugins.
 *
 * Brownfield concern: the 0063 column is NOT NULL with a DEFAULT. A fresh install works
 * trivially; the real risk is an existing database with populated knowledge_items rows —
 * the DEFAULT must apply to all of them without violating the NOT NULL constraint.
 *
 * Why a brownfield test: the pooled fixture runs all migrations before any test, so it
 * cannot expose the pre-0062 schema. This test creates a raw PGlite instance, applies
 * 0..61, seeds data in all three affected tables, then applies 62..64 and asserts the
 * columns appear with the expected values on the pre-existing rows.
 *
 * Sanity-break: if 0063 were written WITHOUT a DEFAULT (or as NOT NULL without backfill),
 * the migration would fail on the populated knowledge_items row, making this test red.
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

describe("migrations 0062-0064: brownfield upgrade with populated tables", () => {
	const clients: PGlite[] = [];
	const tempDirs: string[] = [];

	afterAll(async () => {
		await Promise.allSettled(clients.map((c) => c.close()));
		for (const d of tempDirs) {
			rmSync(d, { recursive: true, force: true });
		}
	});

	it("upgrades cleanly from a database seeded with agent_run_config, knowledge_items, and plugins rows", {
		timeout: 120_000,
	}, async () => {
		// Arrange: fresh PGlite at migration 0061 state (pre-BA9b)
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);

		const folder61 = makeTempMigrationsFolder(61);
		tempDirs.push(folder61);
		await migrate(db, { migrationsFolder: folder61 });

		// Seed: a user (team_id nullable — no team needed)
		await db.execute(sql`
				INSERT INTO users (id, name, role, status, created_at)
				VALUES ('user-arc', 'Arc', 'member', 'active', '2024-01-01T00:00:00Z')
			`);

		// Seed: agent_run_config row — will gain nullable model_options_json from 0062
		await db.execute(sql`
				INSERT INTO agent_run_config (agent_user_id)
				VALUES ('user-arc')
			`);

		// Seed: knowledge_items row — will gain NOT NULL role DEFAULT 'ordinary' from 0063
		// Note: layer/kind/attention_score/confidence/meta were dropped from knowledge_items in
		// migration 0011; scope_kind (NOT NULL DEFAULT 'factory') was added in 0012.
		// Companion knowledge_app_projection row required per Ruling 13's companion clause
		// (crossing-table-write governance rule).
		await db.execute(sql`
				INSERT INTO knowledge_items (id, title, body, format, status, updated_by, created_at, updated_at)
				VALUES ('ki-1', 'Test Doc', 'Body text', 'markdown', 'active', 'user-arc', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z')
			`);
		await db.execute(sql`
				INSERT INTO knowledge_app_projection (id, knowledge_item_id)
				VALUES ('kap-1', 'ki-1')
			`);

		// Seed: plugins row — will gain nullable install_path from 0064
		await db.execute(sql`
				INSERT INTO plugins (id, name, version, state, installed_at, updated_at)
				VALUES ('plg-1', 'test-plugin', '1.0.0', 'enabled', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z')
			`);

		// Act: apply the remaining migrations (0062..0064)
		let migrationError: unknown;
		try {
			await migrate(db, { migrationsFolder: DRIZZLE_FOLDER });
		} catch (e) {
			migrationError = e;
		}

		// Assert: no error
		expect(
			migrationError,
			"migrations 0062-0064 must apply cleanly to a populated database",
		).toBeUndefined();

		// Assert 0062: agent_run_config.model_options_json is NULL for pre-existing row
		const arcConfig = await db.execute(sql`
				SELECT model_options_json FROM agent_run_config WHERE agent_user_id = 'user-arc'
			`);
		const arcRow = (arcConfig as unknown as { rows: Array<Record<string, unknown>> }).rows[0];
		expect(arcRow, "agent_run_config row must survive migration").toBeDefined();
		expect(
			arcRow?.["model_options_json"],
			"pre-existing row gets NULL model_options_json",
		).toBeNull();

		// Assert 0063 (post-0086 rename): documents.slot is 'ordinary' for pre-existing row (DEFAULT applied)
		const kiResult = await db.execute(sql`
				SELECT slot FROM documents WHERE id = 'ki-1'
			`);
		const kiRow = (kiResult as unknown as { rows: Array<Record<string, unknown>> }).rows[0];
		expect(kiRow, "documents row must survive migration").toBeDefined();
		expect(kiRow?.["slot"], "pre-existing documents row gets DEFAULT slot 'ordinary'").toBe(
			"ordinary",
		);

		// Assert 0063 (post-0086 rename): the CHECK constraint is live — inserting an invalid slot must fail
		let checkViolation: unknown;
		try {
			await db.execute(sql`
					INSERT INTO documents (id, layer, kind, title, body, format, status, updated_by, created_at, updated_at, slot)
					VALUES ('ki-bad', 'team', 'document', 'Bad', 'Body', 'markdown', 'active', 'user-arc', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 'bogus')
				`);
		} catch (e) {
			checkViolation = e;
		}
		expect(
			checkViolation,
			"CHECK constraint doc_slot_ck must reject invalid slot values",
		).toBeDefined();

		// Assert 0064: plugins.install_path is NULL for pre-existing row
		const plgResult = await db.execute(sql`
				SELECT install_path FROM plugins WHERE id = 'plg-1'
			`);
		const plgRow = (plgResult as unknown as { rows: Array<Record<string, unknown>> }).rows[0];
		expect(plgRow, "plugins row must survive migration").toBeDefined();
		expect(plgRow?.["install_path"], "pre-existing plugins row gets NULL install_path").toBeNull();
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

		// Verify the new columns exist and accept correct values
		await db.execute(sql`
				INSERT INTO users (id, name, role, status, created_at)
				VALUES ('user-fresh', 'Fresh', 'member', 'active', '2024-01-01T00:00:00Z')
			`);

		// agent_run_config: model_options_json column exists and accepts text
		await db.execute(sql`
				INSERT INTO agent_run_config (agent_user_id, model_options_json)
				VALUES ('user-fresh', '{"temperature":0.7}')
			`);

		// documents (renamed from knowledge_items in 0086): slot column exists, defaults to
		// 'ordinary', accepts valid values. The projection table is gone — confidence/meta
		// now live on the row itself, so no companion insert is needed.
		await db.execute(sql`
				INSERT INTO documents (id, title, body, format, status, updated_by, created_at, updated_at)
				VALUES ('ki-fresh', 'Fresh', 'Body', 'markdown', 'active', 'user-fresh', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z')
			`);
		await db.execute(sql`
				INSERT INTO documents (id, title, body, format, status, updated_by, created_at, updated_at, slot)
				VALUES ('ki-skill', 'Skill', 'Body', 'markdown', 'active', 'user-fresh', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 'skill')
			`);

		const freshKiRows = await db.execute(sql`
				SELECT id, slot FROM documents WHERE id IN ('ki-fresh', 'ki-skill') ORDER BY id
			`);
		const freshRows = (freshKiRows as unknown as { rows: Array<Record<string, unknown>> }).rows;
		expect(freshRows).toHaveLength(2);
		expect(freshRows.find((r) => r["id"] === "ki-fresh")?.["slot"]).toBe("ordinary");
		expect(freshRows.find((r) => r["id"] === "ki-skill")?.["slot"]).toBe("skill");

		// plugins: install_path column exists and accepts text
		await db.execute(sql`
				INSERT INTO plugins (id, name, version, state, installed_at, updated_at, install_path)
				VALUES ('plg-fresh', 'fresh-plugin', '1.0.0', 'enabled', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', '/opt/plugins/fresh')
			`);

		const freshPlg = await db.execute(sql`
				SELECT install_path FROM plugins WHERE id = 'plg-fresh'
			`);
		const freshPlgRow = (freshPlg as unknown as { rows: Array<Record<string, unknown>> }).rows[0];
		expect(freshPlgRow?.["install_path"]).toBe("/opt/plugins/fresh");
	});
});
