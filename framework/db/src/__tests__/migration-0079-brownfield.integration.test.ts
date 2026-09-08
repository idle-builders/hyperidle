/**
 * Brownfield migration test for 0079 (artifacts become knowledge items).
 *
 * A database seeded before this carries an `artifacts` table, a dead
 * `tasks.artifacts` column, and threads hosted on an artifact. The migration
 * drops all three.
 *
 * The trap this exists for: `threads.id` has THREE inbound foreign keys, every
 * one `ON DELETE RESTRICT` — `messages`, `items`, and `tasks.thread_id`. A
 * migration that clears only `messages` aborts on a foreign-key violation the
 * moment a real database has an `items` row (a proposal posted in an artifact's
 * discussion) or a task pointing at that thread — and it aborts AFTER the
 * messages are already deleted, leaving a destructive migration half applied.
 * The first version of this migration did exactly that. Every child is seeded
 * here, so a regression fails rather than waiting for someone's real data to
 * find it.
 *
 * @lore artifacts-become-knowledge: same trap `migration-0076-brownfield` and
 * `-0077` name — a hand-rolled pre-migration schema can pass while every real
 * upgrade aborts. The pre-state here is produced by running the REAL migrations
 * 0..78, never hand-rolled DDL.
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
	const tmpDir = mkdtempSync(join(tmpdir(), "drizzle-brownfield-0079-"));
	cpSync(DRIZZLE_FOLDER, tmpDir, { recursive: true });
	const journal = JSON.parse(readFileSync(join(DRIZZLE_FOLDER, "meta/_journal.json"), "utf-8")) as {
		entries: Array<{ idx: number }>;
	};
	journal.entries = journal.entries.filter((e) => e.idx <= upToIdx);
	writeFileSync(join(tmpDir, "meta/_journal.json"), JSON.stringify(journal, null, 2));
	return tmpDir;
}

const NOW = "2026-01-01T00:00:00.000Z";

describe("migration 0079: artifacts become knowledge items — brownfield", () => {
	const clients: PGlite[] = [];
	const tempDirs: string[] = [];

	afterAll(async () => {
		await Promise.allSettled(clients.map((c) => c.close()));
		for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
	});

	it("drops the table and its threads even when every restrict-FK child exists", {
		timeout: 180_000,
	}, async () => {
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);

		const folderBefore = makeTempMigrationsFolder(78);
		tempDirs.push(folderBefore);
		await migrate(db, { migrationsFolder: folderBefore });

		await db.execute(sql`
					INSERT INTO teams (id, name, phase, capacity, created_at)
					VALUES ('team-1', 'Team One', 'build', 5, ${NOW})
				`);
		await db.execute(sql`
					INSERT INTO users (id, name, role, kind, status, team_id, created_at)
					VALUES ('agent-1', 'Agent One', 'builder', 'ai', 'active', NULL, ${NOW}),
					       ('human-1', 'Founder', 'founder', 'human', 'active', NULL, ${NOW})
				`);
		await db.execute(sql`
					INSERT INTO tasks (id, parent_task_id, team_id, title, state, created_at, updated_at)
					VALUES ('task-1', NULL, 'team-1', 'Produce something', 'in_progress', ${NOW}, ${NOW})
				`);

		// An artifact, and a thread hosted on it.
		await db.execute(sql`
					INSERT INTO artifacts (id, producing_task_id, kind, label, preview_json, created_at)
					VALUES ('art-1', 'task-1', 'text', 'a_label', '{"kind":"text","body":"hi"}', ${NOW})
				`);
		await db.execute(sql`
					INSERT INTO threads (id, host_kind, host_id, initiator_id, participants, last_active_at, created_at)
					VALUES ('thr-art', 'artifact', 'art-1', 'human-1', '["human-1"]', ${NOW}, ${NOW})
				`);

		// All THREE restrict-FK children of that thread. Each one alone is
		// enough to abort the thread delete if the migration misses it.
		await db.execute(sql`
					INSERT INTO messages (id, thread_id, sender_id, type, payload, client_key, created_at)
					VALUES ('msg-1', 'thr-art', 'human-1', 'plain', '{"text":"about this artifact"}', 'ck-msg-1', ${NOW})
				`);
		await db.execute(sql`
					INSERT INTO items (id, title, thread_id, created_at)
					VALUES ('item-1', 'A proposal in the artifact thread', 'thr-art', ${NOW})
				`);
		await db.execute(sql`UPDATE tasks SET thread_id = 'thr-art' WHERE id = 'task-1'`);

		// A thread that is NOT artifact-hosted, with its own children, to
		// prove the migration takes only what it should.
		await db.execute(sql`
					INSERT INTO threads (id, host_kind, host_id, initiator_id, participants, last_active_at, created_at)
					VALUES ('thr-task', 'task', 'task-1', 'human-1', '["human-1"]', ${NOW}, ${NOW})
				`);
		await db.execute(sql`
					INSERT INTO messages (id, thread_id, sender_id, type, payload, client_key, created_at)
					VALUES ('msg-keep', 'thr-task', 'human-1', 'plain', '{"text":"unrelated"}', 'ck-msg-keep', ${NOW})
				`);
		await db.execute(sql`
					INSERT INTO items (id, title, thread_id, created_at)
					VALUES ('item-keep', 'Unrelated proposal', 'thr-task', ${NOW})
				`);

		// The upgrade must complete, not abort partway.
		const folderAfter = makeTempMigrationsFolder(79);
		tempDirs.push(folderAfter);
		await migrate(db, { migrationsFolder: folderAfter });

		// The artifacts table is gone.
		const tables = await db.execute(sql`
					SELECT table_name FROM information_schema.tables
					WHERE table_schema = 'public' AND table_name = 'artifacts'
				`);
		expect(tables.rows).toHaveLength(0);

		// So is the dead column.
		const cols = await db.execute(sql`
					SELECT column_name FROM information_schema.columns
					WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'artifacts'
				`);
		expect(cols.rows).toHaveLength(0);

		// The artifact-hosted thread and its children are gone with it.
		const threadsLeft = await db.execute(sql`SELECT id FROM threads ORDER BY id`);
		expect(threadsLeft.rows.map((r) => (r as { id: string }).id)).toEqual(["thr-task"]);

		const messagesLeft = await db.execute(sql`SELECT id FROM messages ORDER BY id`);
		expect(messagesLeft.rows.map((r) => (r as { id: string }).id)).toEqual(["msg-keep"]);

		const itemsLeft = await db.execute(sql`SELECT id FROM items ORDER BY id`);
		expect(itemsLeft.rows.map((r) => (r as { id: string }).id)).toEqual(["item-keep"]);

		// The task survives, with its dangling thread pointer cleared rather
		// than left pointing at a row that no longer exists.
		const taskRow = await db.execute(sql`SELECT id, thread_id FROM tasks WHERE id = 'task-1'`);
		expect(taskRow.rows).toHaveLength(1);
		expect((taskRow.rows[0] as { thread_id: string | null }).thread_id).toBeNull();
	});
});
