/**
 * Brownfield migration test for 0086 (document as a module).
 *
 * Renames `knowledge_items` to `documents` and `role` to `slot`, folds
 * `knowledge_app_projection`'s two live columns (`confidence`, `meta`) onto the
 * row and adds four real usage columns starting empty, drops the three other
 * knowledge extension tables, backfills the scope owner off `updated_by`'s six
 * shapes, and flips every stored value naming the old vocabulary
 * (`tasks.source_knowledge_item_id`, `threads.host_kind`, message `refs`,
 * `plugin_contributions.kind`, a `changes` row's JSON diff, a baked work
 * intent's `contextBundle`).
 *
 * Asserts with raw `sql` only — no `@hyperidle/db` schema import — because it
 * must run while `npm run check` is red for the whole B2 window.
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
const PRE_MIGRATION_IDX = 85;
const MIGRATION_IDX = 86;

function makeTempMigrationsFolder(upToIdx: number): string {
	const tmpDir = mkdtempSync(join(tmpdir(), "drizzle-brownfield-0086-"));
	cpSync(DRIZZLE_FOLDER, tmpDir, { recursive: true });
	const journal = JSON.parse(readFileSync(join(DRIZZLE_FOLDER, "meta/_journal.json"), "utf-8")) as {
		entries: Array<{ idx: number }>;
	};
	journal.entries = journal.entries.filter((e) => e.idx <= upToIdx);
	writeFileSync(join(tmpDir, "meta/_journal.json"), JSON.stringify(journal, null, 2));
	return tmpDir;
}

const NOW = "2026-01-01T00:00:00.000Z";

describe("migration 0086: document as a module — brownfield", () => {
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

		await db.execute(sql`
			INSERT INTO teams (id, name, phase, created_at) VALUES ('team-1', 'Team One', 'build', ${NOW})
		`);
		await db.execute(sql`
			INSERT INTO users (id, name, kind, role, status, team_id, created_at) VALUES
				('human-1', 'Human One', 'human', 'founder', 'active', 'team-1', ${NOW}),
				('agent-1', 'Agent One', 'ai', 'builder', 'active', 'team-1', ${NOW}),
				('agent-session', 'Session Agent', 'ai', 'builder', 'active', 'team-1', ${NOW})
		`);
		await db.execute(sql`
			INSERT INTO sessions (id, agent_id, model_tier, started_at, state)
			VALUES ('sess-1', 'agent-session', 'workhorse', ${NOW}, 'active')
		`);

		// threads: one to host task-1 (its own thread_id is NOT NULL), one
		// hosted BY a knowledge item — step 8's subject.
		await db.execute(sql`
			INSERT INTO threads (id, host_kind, host_id, initiator_id, participants, last_active_at, created_at)
			VALUES
				('thread-task-1', 'team', 'team-1', 'human-1', '[]', ${NOW}, ${NOW}),
				('thread-hosted-by-item', 'knowledge_item', 'doc-root', 'human-1', '[]', ${NOW}, ${NOW})
		`);

		// knowledge_items: a root, a knowledge_item-parented child, a
		// role='prompt' routine slot, a role='agent_file' identity, five
		// owner-backfill/memory cases, and a team-scoped negative control.
		await db.execute(sql`
			INSERT INTO knowledge_items
				(id, scope_kind, scope_id, title, body, format, status, version, role, parent_kind, parent_id, updated_by, created_at, updated_at)
			VALUES
				('doc-root', 'factory', NULL, 'Root', 'Root body', 'markdown', 'draft', 1, 'ordinary', NULL, NULL, 'human-1', ${NOW}, ${NOW}),
				('doc-child', 'factory', NULL, 'Child', 'Child body', 'markdown', 'draft', 1, 'ordinary', 'knowledge_item', 'doc-root', 'human-1', ${NOW}, ${NOW}),
				('doc-prompt', 'factory', NULL, 'Prompt', 'Prompt body', 'markdown', 'active', 1, 'prompt', 'routine', 'routine-xyz', 'human-1', ${NOW}, ${NOW}),
				('doc-identity', 'factory', NULL, 'Identity', 'Identity body', 'markdown', 'active', 1, 'agent_file', 'agent', 'agent-1', 'human-1', ${NOW}, ${NOW}),
				('doc-case-i', 'user', NULL, 'Case i', 'Body', 'markdown', 'draft', 1, 'ordinary', NULL, NULL, 'human-1', ${NOW}, ${NOW}),
				('doc-case-ii', 'user', NULL, 'Case ii', 'Body', 'markdown', 'draft', 1, 'ordinary', NULL, NULL, 'agent:agent-1', ${NOW}, ${NOW}),
				('doc-case-iii', 'user', 'team-1', 'Case iii', 'Body', 'markdown', 'draft', 1, 'ordinary', NULL, NULL, 'user:human-1', ${NOW}, ${NOW}),
				('doc-case-iv', 'user', NULL, 'Case iv', 'Body', 'markdown', 'draft', 1, 'ordinary', NULL, NULL, 'session:sess-1', ${NOW}, ${NOW}),
				('doc-case-v', 'user', NULL, 'Case v', 'Body', 'markdown', 'draft', 1, 'ordinary', NULL, NULL, 'plugin', ${NOW}, ${NOW}),
				('doc-team-scoped', 'team', 'team-1', 'Team scoped', 'Body', 'markdown', 'draft', 1, 'ordinary', NULL, NULL, 'human-1', ${NOW}, ${NOW})
		`);

		// knowledge_app_projection: the citation_count:9 row (nothing carried
		// over), the confidence+meta+non-null-scope_id row (reconciliation
		// wins), and the all-null row (folding a no-op).
		await db.execute(sql`
			INSERT INTO knowledge_app_projection
				(id, knowledge_item_id, scope_id, relevance_score, confidence, citation_count, last_cited_at, meta)
			VALUES
				('proj-citation', 'doc-root', NULL, '0.42', NULL, 9, ${NOW}, NULL),
				('proj-confidence-meta', 'doc-child', 'team-1', NULL, '0.87', NULL, NULL, '{"tags":["upload"]}'),
				('proj-allnull', 'doc-identity', NULL, NULL, NULL, NULL, NULL, NULL)
		`);

		// the three other dropped tables, one row each, referencing doc-root —
		// proves the DROPs are not blocked by their own outward FKs.
		await db.execute(sql`
			INSERT INTO knowledge_edit_log (id, item_id, editor, field, old_value, new_value, edit_type, created_at)
			VALUES ('kel-1', 'doc-root', 'human-1', 'title', 'Old', 'Root', 'update', ${NOW})
		`);
		await db.execute(sql`
			INSERT INTO knowledge_access_log (id, item_id, accessor_kind, accessor_id, accessed_at)
			VALUES ('kal-1', 'doc-root', 'human', 'human-1', ${NOW})
		`);
		await db.execute(sql`
			INSERT INTO knowledge_conflicts (id, item_id, version_base, version_current, proposed_body, proposed_by, created_at)
			VALUES ('kc-1', 'doc-root', 1, 1, 'Proposed body', 'human-1', ${NOW})
		`);

		// a task naming its source knowledge item — step 7's subject.
		await db.execute(sql`
			INSERT INTO tasks (id, team_id, title, state, thread_id, source_knowledge_item_id, created_at, updated_at)
			VALUES ('task-1', 'team-1', 'Task One', 'in_progress', 'thread-task-1', 'doc-root', ${NOW}, ${NOW})
		`);

		// a message whose payload carries refs of both kinds — step 9's subject.
		await db.execute(sql`
			INSERT INTO messages (id, sender_id, thread_id, type, payload, client_key, created_at)
			VALUES (
				'msg-refs', 'human-1', 'thread-hosted-by-item', 'plain',
				'{"text":"see","refs":[{"kind":"knowledge_item","id":"doc-root"},{"kind":"task","id":"task-1"}]}',
				'ck-msg-refs', ${NOW}
			)
		`);

		// a plugin contribution of kind 'knowledge' — step 10's subject.
		await db.execute(sql`
			INSERT INTO plugins (id, name, version, state, scope_kind, installed_at, updated_at)
			VALUES ('plugin-1', 'Plugin One', '1.0.0', 'enabled', 'factory', ${NOW}, ${NOW})
		`);
		await db.execute(sql`
			INSERT INTO plugin_contributions (id, plugin_id, kind, entity_id, created_at)
			VALUES ('pc-1', 'plugin-1', 'knowledge', 'doc-root', ${NOW})
		`);

		// a changes row whose JSON diff names the pre-rename task column —
		// step 11's subject.
		await db.execute(sql`
			INSERT INTO changes (id, object, object_id, kind, actor, before, after, at)
			VALUES (
				'chg-1', 'task', 'task-1', 'changed', 'human-1',
				'{"id":"task-1","sourceKnowledgeItemId":null}',
				'{"id":"task-1","sourceKnowledgeItemId":"doc-root"}',
				${NOW}
			)
		`);

		// a pending intent whose baked request still carries contextBundle.knowledge —
		// step 12's subject.
		await db.execute(sql`
			INSERT INTO agent_work_intents
				(id, kind, source_kind, source_id, idempotency_key, status, baked_request_json, created_at, updated_at)
			VALUES (
				'intent-1', 'routine_run', 'routine_run', 'src-1', 'idem-1', 'pending',
				'{"contextBundle":{"knowledge":[{"id":"doc-root","role":"ordinary"}]}}',
				${NOW}, ${NOW}
			)
		`);

		const folderAfter = makeTempMigrationsFolder(MIGRATION_IDX);
		tempDirs.push(folderAfter);
		await migrate(db, { migrationsFolder: folderAfter });

		return db;
	}

	it("renames knowledge_items to documents and role to slot, re-pointing parent_kind", async () => {
		const db = await seedAndMigrate();

		const [child] = (
			await db.execute(sql`SELECT parent_kind, slot FROM documents WHERE id = 'doc-child'`)
		).rows as Array<{ parent_kind: string; slot: string }>;
		expect(child?.parent_kind).toBe("document");
		expect(child?.slot).toBe("ordinary");

		const [prompt] = (await db.execute(sql`SELECT slot FROM documents WHERE id = 'doc-prompt'`))
			.rows as Array<{ slot: string }>;
		expect(prompt?.slot).toBe("prompt");
	});

	it("folds confidence and meta onto the row, and the projection's scope_id wins the reconcile", async () => {
		const db = await seedAndMigrate();

		const [child] = (
			await db.execute(sql`SELECT confidence, meta, scope_id FROM documents WHERE id = 'doc-child'`)
		).rows as Array<{ confidence: string; meta: string; scope_id: string }>;
		expect(child?.confidence).toBe("0.87");
		expect(child?.meta).toBe('{"tags":["upload"]}');
		expect(child?.scope_id).toBe("team-1");

		const [identity] = (
			await db.execute(sql`SELECT confidence, meta FROM documents WHERE id = 'doc-identity'`)
		).rows as Array<{ confidence: string | null; meta: string | null }>;
		expect(identity?.confidence).toBeNull();
		expect(identity?.meta).toBeNull();
	});

	it("drops the three knowledge extension tables and the projection table", async () => {
		const db = await seedAndMigrate();

		const rows = (
			await db.execute(sql`
				SELECT to_regclass('knowledge_app_projection') AS projection,
				       to_regclass('knowledge_conflicts') AS conflicts,
				       to_regclass('knowledge_access_log') AS access_log,
				       to_regclass('knowledge_edit_log') AS edit_log
			`)
		).rows as Array<{
			projection: string | null;
			conflicts: string | null;
			access_log: string | null;
			edit_log: string | null;
		}>;
		expect(rows[0]?.projection).toBeNull();
		expect(rows[0]?.conflicts).toBeNull();
		expect(rows[0]?.access_log).toBeNull();
		expect(rows[0]?.edit_log).toBeNull();
	});

	it("renames tasks.source_knowledge_item_id to source_document_id, holding the id", async () => {
		const db = await seedAndMigrate();

		const [task] = (await db.execute(sql`SELECT source_document_id FROM tasks WHERE id = 'task-1'`))
			.rows as Array<{ source_document_id: string }>;
		expect(task?.source_document_id).toBe("doc-root");
	});

	it("flips threads.host_kind from knowledge_item to document", async () => {
		const db = await seedAndMigrate();

		const [thread] = (
			await db.execute(sql`SELECT host_kind FROM threads WHERE id = 'thread-hosted-by-item'`)
		).rows as Array<{ host_kind: string }>;
		expect(thread?.host_kind).toBe("document");
	});

	it("flips the knowledge_item ref kind inside a message payload, leaving the task ref untouched", async () => {
		const db = await seedAndMigrate();

		const [message] = (await db.execute(sql`SELECT payload FROM messages WHERE id = 'msg-refs'`))
			.rows as Array<{ payload: string }>;
		const payload = JSON.parse(message?.payload ?? "{}") as {
			refs: Array<{ kind: string; id: string }>;
		};
		expect(payload.refs.map((r) => r.kind)).toEqual(["document", "task"]);
		expect(payload.refs[1]?.id).toBe("task-1");
	});

	it("flips plugin_contributions.kind from knowledge to document", async () => {
		const db = await seedAndMigrate();

		const [contribution] = (
			await db.execute(sql`SELECT kind FROM plugin_contributions WHERE id = 'pc-1'`)
		).rows as Array<{ kind: string }>;
		expect(contribution?.kind).toBe("document");
	});

	it("rewrites sourceKnowledgeItemId to sourceDocumentId inside a stored changes row", async () => {
		const db = await seedAndMigrate();

		const [change] = (await db.execute(sql`SELECT after FROM changes WHERE id = 'chg-1'`))
			.rows as Array<{ after: string }>;
		expect(change?.after).toContain("sourceDocumentId");
		expect(change?.after).not.toContain("sourceKnowledgeItemId");
	});

	it("fails a pending intent whose baked request predates the document vocabulary", async () => {
		const db = await seedAndMigrate();

		const [intent] = (
			await db.execute(
				sql`SELECT status, last_error_code FROM agent_work_intents WHERE id = 'intent-1'`,
			)
		).rows as Array<{ status: string; last_error_code: string }>;
		expect(intent?.status).toBe("failed");
		expect(intent?.last_error_code).toBe("STALE_BAKED_CONTEXT");
	});

	it("starts every usage column empty, including the row whose projection held citation_count: 9", async () => {
		const db = await seedAndMigrate();

		const rows = (
			await db.execute(
				sql`SELECT id, read_count, last_read_at, session_use_count, last_used_at FROM documents`,
			)
		).rows as Array<{
			id: string;
			read_count: number;
			last_read_at: string | null;
			session_use_count: number;
			last_used_at: string | null;
		}>;
		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) {
			expect(row.read_count).toBe(0);
			expect(row.session_use_count).toBe(0);
			expect(row.last_read_at).toBeNull();
			expect(row.last_used_at).toBeNull();
		}
		const root = rows.find((r) => r.id === "doc-root");
		expect(root?.read_count).toBe(0);
	});

	it("creates doc_last_used_idx", async () => {
		const db = await seedAndMigrate();

		const [row] = (await db.execute(sql`SELECT to_regclass('doc_last_used_idx') AS idx`))
			.rows as Array<{ idx: string | null }>;
		expect(row?.idx).not.toBeNull();
	});

	it("backfills the scope owner off updated_by's ladder — five cases, one residue, one negative control", async () => {
		const db = await seedAndMigrate();

		const rows = (
			await db.execute(sql`
				SELECT id, scope_kind, scope_id FROM documents
				WHERE id IN ('doc-case-i','doc-case-ii','doc-case-iii','doc-case-iv','doc-case-v','doc-team-scoped')
			`)
		).rows as Array<{ id: string; scope_kind: string; scope_id: string | null }>;
		const byId = new Map(rows.map((r) => [r.id, r]));

		// (i) a bare user id.
		expect(byId.get("doc-case-i")?.scope_id).toBe("human-1");
		// (ii) `agent:<id>`.
		expect(byId.get("doc-case-ii")?.scope_id).toBe("agent-1");
		// (iii) a stale scope_id naming a team, replaced by `user:<id>`.
		expect(byId.get("doc-case-iii")?.scope_id).toBe("human-1");
		// (iv) `session:<id>` whose session names an agent.
		expect(byId.get("doc-case-iv")?.scope_id).toBe("agent-session");
		// (v) residue — left exactly as it is, still scope_kind='user'.
		expect(byId.get("doc-case-v")?.scope_id).toBeNull();
		expect(byId.get("doc-case-v")?.scope_kind).toBe("user");
		// negative control — a team-scoped row is untouched by every ladder step.
		expect(byId.get("doc-team-scoped")?.scope_id).toBe("team-1");
		expect(byId.get("doc-team-scoped")?.scope_kind).toBe("team");
	});
});
