/**
 * Brownfield migration test for 0097 (discipline clusters knowledge; role
 * becomes RBAC only).
 *
 * Seeds pre-0097 state honestly, at real column names as they existed right
 * before this migration (`users.role`, `org_edges.mechanism`, the
 * `documents` slot/parent_kind/parent_id shape migration 0086 left behind):
 * an AI agent whose role is a craft, the person's own agent still carrying
 * the dead 'assistant' role, an AI system user, a human founder, a human
 * whose role is a craft (Maya's 'operations'), an org edge whose mechanism
 * is 'function', and an upgraded-install practice tree from migration 0080
 * — a practice folder and topic item 0080 itself created (scope_id NULL,
 * exactly as 0080 inserted them) plus the original leaf document 0080
 * reparented under them, still carrying the stale practice `scope_id` 0080
 * never cleared — alongside an unrelated factory document.
 *
 * Asserts: every craft moved off role onto discipline; role holds only
 * founder/member/agent/system; the assistant row is role='agent' with a
 * NULL discipline; Maya kept her craft as a discipline and became 'member';
 * the org edge's mechanism changed; the leaf document's stale scope_id
 * became its discipline and was cleared, the folder/topic items 0080 built
 * (which never carried a scope_id) stay untagged, a task-writeback row
 * (0080 §7's OTHER leftover-scope_id path — scope_id there is a task id,
 * never a craft) has its scope_id cleared with no discipline invented for
 * it, and the unrelated document stayed NULL; no factory row carries a
 * scope_id afterwards; the factory-scope_id and agent_file parent
 * constraints are enforced.
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
import { describe as fixtureDescribe, test as fixtureTest } from "../__testing__/test-fixtures.js";

const DIRNAME = fileURLToPath(new URL(".", import.meta.url));
const DRIZZLE_FOLDER = resolve(DIRNAME, "../../drizzle");
const PRE_MIGRATION_IDX = 96;
const MIGRATION_IDX = 97;

function makeTempMigrationsFolder(upToIdx: number): string {
	const tmpDir = mkdtempSync(join(tmpdir(), "drizzle-brownfield-0097-"));
	cpSync(DRIZZLE_FOLDER, tmpDir, { recursive: true });
	const journal = JSON.parse(readFileSync(join(DRIZZLE_FOLDER, "meta/_journal.json"), "utf-8")) as {
		entries: Array<{ idx: number }>;
	};
	journal.entries = journal.entries.filter((e) => e.idx <= upToIdx);
	writeFileSync(join(tmpDir, "meta/_journal.json"), JSON.stringify(journal, null, 2));
	return tmpDir;
}

const NOW = "2026-01-01T00:00:00.000Z";

describe("migration 0097: discipline clusters knowledge; role becomes RBAC only — brownfield", () => {
	const clients: PGlite[] = [];
	const tempDirs: string[] = [];

	afterAll(async () => {
		await Promise.allSettled(clients.map((c) => c.close()));
		for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
	});

	async function seedAndMigrate(): Promise<ReturnType<typeof drizzle>> {
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);

		const folderBefore = makeTempMigrationsFolder(PRE_MIGRATION_IDX);
		tempDirs.push(folderBefore);
		await migrate(db, { migrationsFolder: folderBefore });

		// Users: an AI agent whose role is a craft, the person's own agent
		// still carrying the dead 'assistant' role, an AI system user, an AI
		// user already shaped like a bare agent, a human founder (untouched),
		// and a human whose role is a craft — Maya's 'operations'.
		await db.execute(sql`
			INSERT INTO users (id, kind, name, role, status, created_at) VALUES
				('human-founder', 'human', 'Founder', 'founder', 'active', ${NOW}),
				('human-maya', 'human', 'Maya', 'operations', 'active', ${NOW}),
				('agent-designer', 'ai', 'Designer Agent', 'designer', 'active', ${NOW}),
				('agent-system', 'ai', 'System Agent', 'system', 'active', ${NOW}),
				('agent-plain', 'ai', 'Plain Agent', 'agent', 'active', ${NOW})
		`);
		await db.execute(sql`
			INSERT INTO users (id, kind, name, role, status, owner_user_id, created_at) VALUES
				('agent-assistant', 'ai', 'Founder''s Agent', 'assistant', 'active', 'human-founder', ${NOW})
		`);

		// Org edges: one carrying the pre-rename mechanism, one that must stay
		// untouched.
		await db.execute(sql`
			INSERT INTO org_edges (id, from_user_id, mechanism, target, created_at) VALUES
				('edge-function', 'human-founder', 'function', 'designer', ${NOW}),
				('edge-direct', 'human-founder', 'direct', 'agent-designer', ${NOW})
		`);

		// An upgraded install's practice tree from migration 0080: the folder
		// and topic item 0080 itself inserted (scope_id NULL, exactly as 0080
		// created them — see its §4a/4b) beneath which sits the ORIGINAL leaf
		// document 0080 reparented (its §4c UPDATE rewrites scope_kind and
		// parent_id but never scope_id) — still carrying the stale practice
		// name that is this bug — plus 0080's OTHER leftover-scope_id path
		// (§7: a task-scoped row reparented under its task, scope_id left
		// holding the task id, never a craft) and an unrelated factory
		// document with no relation to either.
		await db.execute(sql`
			INSERT INTO documents
				(id, scope_kind, scope_id, title, body, format, status, version, slot, parent_kind, parent_id, position, updated_by, created_at, updated_at)
			VALUES
				('ki-mig-practice-designer', 'factory', NULL, 'Designer', 'Knowledge for the Designer practice.', 'markdown', 'active', 1, 'ordinary', NULL, NULL, 0, 'system', ${NOW}, ${NOW}),
				('ki-mig-topic-practice-designer-abc123', 'factory', NULL, 'Layout basics', 'Layout basics', 'markdown', 'active', 1, 'ordinary', 'document', 'ki-mig-practice-designer', 0, 'system', ${NOW}, ${NOW}),
				('doc-under-topic', 'factory', 'designer', 'Grid system', 'Grid system notes', 'markdown', 'active', 1, 'ordinary', 'document', 'ki-mig-topic-practice-designer-abc123', 0, 'system', ${NOW}, ${NOW}),
				('doc-task-writeback', 'factory', 'demo-task-mobile', 'Postmortem', 'Postmortem notes', 'markdown', 'active', 1, 'ordinary', 'task', 'demo-task-mobile', 0, 'system', ${NOW}, ${NOW}),
				('doc-factory-unrelated', 'factory', NULL, 'Unrelated note', 'Nothing to do with any practice', 'markdown', 'active', 1, 'ordinary', NULL, NULL, 1, 'system', ${NOW}, ${NOW})
		`);

		const folderAfter = makeTempMigrationsFolder(MIGRATION_IDX);
		tempDirs.push(folderAfter);
		await migrate(db, { migrationsFolder: folderAfter });

		return db;
	}

	it("moves an AI agent's craft to discipline and collapses its role to 'agent'", async () => {
		const db = await seedAndMigrate();
		const [row] = (
			await db.execute(sql`SELECT role, discipline FROM users WHERE id = 'agent-designer'`)
		).rows as Array<{ role: string; discipline: string | null }>;
		expect(row).toEqual({ role: "agent", discipline: "designer" });
	});

	it("collapses the person's own agent's dead 'assistant' role to 'agent' with no discipline", async () => {
		const db = await seedAndMigrate();
		const [row] = (
			await db.execute(sql`SELECT role, discipline FROM users WHERE id = 'agent-assistant'`)
		).rows as Array<{ role: string; discipline: string | null }>;
		expect(row).toEqual({ role: "agent", discipline: null });
	});

	it("leaves an AI system user's role and discipline alone", async () => {
		const db = await seedAndMigrate();
		const [row] = (
			await db.execute(sql`SELECT role, discipline FROM users WHERE id = 'agent-system'`)
		).rows as Array<{ role: string; discipline: string | null }>;
		expect(row).toEqual({ role: "system", discipline: null });
	});

	it("keeps a human founder's role and discipline unchanged", async () => {
		const db = await seedAndMigrate();
		const [row] = (
			await db.execute(sql`SELECT role, discipline FROM users WHERE id = 'human-founder'`)
		).rows as Array<{ role: string; discipline: string | null }>;
		expect(row).toEqual({ role: "founder", discipline: null });
	});

	it("moves a human's craft (Maya's 'operations') to discipline and collapses her role to 'member'", async () => {
		const db = await seedAndMigrate();
		const [row] = (
			await db.execute(sql`SELECT role, discipline FROM users WHERE id = 'human-maya'`)
		).rows as Array<{ role: string; discipline: string | null }>;
		expect(row).toEqual({ role: "member", discipline: "operations" });
	});

	it("leaves role holding only founder, member, agent, system", async () => {
		const db = await seedAndMigrate();
		const rows = (await db.execute(sql`SELECT DISTINCT role FROM users ORDER BY role`))
			.rows as Array<{ role: string }>;
		expect(rows.map((r) => r.role)).toEqual(["agent", "founder", "member", "system"]);
	});

	it("renames org_edges.mechanism from 'function' to 'discipline', leaving other mechanisms untouched", async () => {
		const db = await seedAndMigrate();
		const rows = (await db.execute(sql`SELECT id, mechanism FROM org_edges ORDER BY id`))
			.rows as Array<{ id: string; mechanism: string }>;
		expect(rows).toEqual([
			{ id: "edge-direct", mechanism: "direct" },
			{ id: "edge-function", mechanism: "discipline" },
		]);
	});

	it("recovers a leftover practice scope_id as discipline and clears scope_id", async () => {
		const db = await seedAndMigrate();
		const [row] = (
			await db.execute(sql`SELECT scope_id, discipline FROM documents WHERE id = 'doc-under-topic'`)
		).rows as Array<{ scope_id: string | null; discipline: string | null }>;
		expect(row).toEqual({ scope_id: null, discipline: "designer" });
	});

	it("leaves the practice folder/topic items 0080 built (never carrying a scope_id) untagged", async () => {
		const db = await seedAndMigrate();
		const rows = (
			await db.execute(sql`
				SELECT id, scope_id, discipline FROM documents
				WHERE id IN ('ki-mig-practice-designer', 'ki-mig-topic-practice-designer-abc123')
				ORDER BY id
			`)
		).rows as Array<{ id: string; scope_id: string | null; discipline: string | null }>;
		expect(rows).toEqual([
			{ id: "ki-mig-practice-designer", scope_id: null, discipline: null },
			{ id: "ki-mig-topic-practice-designer-abc123", scope_id: null, discipline: null },
		]);
	});

	it("clears a task-writeback row's leftover scope_id (0080's other leak) without inventing a discipline", async () => {
		const db = await seedAndMigrate();
		const [row] = (
			await db.execute(
				sql`SELECT scope_id, discipline FROM documents WHERE id = 'doc-task-writeback'`,
			)
		).rows as Array<{ scope_id: string | null; discipline: string | null }>;
		expect(row).toEqual({ scope_id: null, discipline: null });
	});

	it("leaves an unrelated document's discipline NULL", async () => {
		const db = await seedAndMigrate();
		const [row] = (
			await db.execute(sql`SELECT discipline FROM documents WHERE id = 'doc-factory-unrelated'`)
		).rows as Array<{ discipline: string | null }>;
		expect(row?.discipline).toBeNull();
	});

	it("leaves no factory-scoped document carrying a scope_id", async () => {
		const db = await seedAndMigrate();
		const [row] = (
			await db.execute(
				sql`SELECT count(*)::int AS count FROM documents WHERE scope_kind = 'factory' AND scope_id IS NOT NULL`,
			)
		).rows as Array<{ count: number }>;
		expect(row?.count).toBe(0);
	});

	it("rejects a factory-scoped document carrying a scope_id", async () => {
		const db = await seedAndMigrate();
		await expect(
			db.execute(sql`
				INSERT INTO documents
					(id, scope_kind, scope_id, title, body, format, status, version, slot, parent_kind, parent_id, position, updated_by, created_at, updated_at)
				VALUES
					('doc-factory-with-scope-id', 'factory', 'designer', 'Stray', 'body', 'markdown', 'active', 1, 'ordinary', NULL, NULL, 0, 'system', ${NOW}, ${NOW})
			`),
		).rejects.toThrow();
	});

	it("enforces the agent_file parent constraint: rejects an unbound agent_file", async () => {
		const db = await seedAndMigrate();
		await expect(
			db.execute(sql`
				INSERT INTO documents
					(id, scope_kind, title, body, format, status, version, slot, parent_kind, parent_id, position, updated_by, created_at, updated_at)
				VALUES
					('doc-unbound-agent-file', 'factory', 'Stray rule', 'body', 'markdown', 'active', 1, 'agent_file', NULL, NULL, 0, 'system', ${NOW}, ${NOW})
			`),
		).rejects.toThrow();
	});

	it("accepts an agent_file bound to its agent parent", async () => {
		const db = await seedAndMigrate();
		await db.execute(sql`
			INSERT INTO documents
				(id, scope_kind, title, body, format, status, version, slot, parent_kind, parent_id, position, updated_by, created_at, updated_at)
			VALUES
				('doc-bound-agent-file', 'factory', 'Identity', 'body', 'markdown', 'active', 1, 'agent_file', 'agent', 'agent-designer', 0, 'system', ${NOW}, ${NOW})
		`);
		const [row] = (
			await db.execute(sql`SELECT slot FROM documents WHERE id = 'doc-bound-agent-file'`)
		).rows as Array<{ slot: string }>;
		expect(row?.slot).toBe("agent_file");
	});
});

// Fresh-path proof: every migration from empty leaves the columns present,
// with no rows and no error. `db` here is a pooled instance already
// migrated to the current head (see test-fixtures.ts) — no brownfield seed.
fixtureDescribe("migration 0097: fresh install", () => {
	fixtureTest("adds users.discipline and documents.discipline, both empty", async ({ db }) => {
		const userCols = (
			(await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'discipline'`,
			)) as { rows: Array<{ column_name: string }> }
		).rows;
		expect(userCols).toHaveLength(1);

		const docCols = (
			(await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'discipline'`,
			)) as { rows: Array<{ column_name: string }> }
		).rows;
		expect(docCols).toHaveLength(1);

		const userDiscipline = (
			(await db.execute(sql`SELECT discipline FROM users WHERE discipline IS NOT NULL`)) as {
				rows: unknown[];
			}
		).rows;
		expect(userDiscipline).toHaveLength(0);

		const docDiscipline = (
			(await db.execute(sql`SELECT discipline FROM documents WHERE discipline IS NOT NULL`)) as {
				rows: unknown[];
			}
		).rows;
		expect(docDiscipline).toHaveLength(0);
	});

	fixtureTest("the agent_file parent constraint exists", async ({ db }) => {
		const rows = (
			(await db.execute(
				sql`SELECT conname FROM pg_constraint WHERE conname = 'doc_agent_file_parent_ck'`,
			)) as { rows: Array<{ conname: string }> }
		).rows;
		expect(rows).toHaveLength(1);
	});

	fixtureTest("the factory-scope_id constraint exists", async ({ db }) => {
		const rows = (
			(await db.execute(
				sql`SELECT conname FROM pg_constraint WHERE conname = 'doc_factory_scope_id_ck'`,
			)) as { rows: Array<{ conname: string }> }
		).rows;
		expect(rows).toHaveLength(1);
	});
});
