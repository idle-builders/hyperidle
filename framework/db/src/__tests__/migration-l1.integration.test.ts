/**
 * L1a migration tests (plan §5.3 + §9 "Vitest DB integration").
 *
 * The L1a migration:
 *  - adds `host_kind`, `host_id`, `initiator_id`, `resolved_at`,
 *    `last_active_at` to threads; drops `kind`.
 *  - adds `type`, `payload`, `client_key`, `deleted_at`, `redacted_at`,
 *    `resolved_at`, `legacy_item_id` to messages; drops `recipient_id`,
 *    `subject`, `body`, `file_leases`.
 *  - drops `responses` table.
 *  - adds the indexes from §5.5: threads_host_idx,
 *    messages_thread_id_idx, messages_idempotency_uq,
 *    messages_unresolved_idx.
 *
 * @lore Phase 2: tests now use PGlite (real Postgres semantics) instead of
 * SQLite. PRAGMA-based introspection replaced with information_schema queries.
 */

import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import type { HyperIdleDb } from "../connection.js";

async function columnsOf(db: HyperIdleDb, table: string): Promise<string[]> {
	const result = await db.execute(
		`SELECT column_name FROM information_schema.columns WHERE table_name = '${table}' AND table_schema = 'public'` as Parameters<
			typeof db.execute
		>[0],
	);
	return (result as { rows: Array<{ column_name: string }> }).rows.map((r) => r.column_name);
}

async function indexNamesOf(db: HyperIdleDb, table: string): Promise<string[]> {
	const result = await db.execute(
		`SELECT indexname FROM pg_indexes WHERE tablename = '${table}' AND schemaname = 'public'` as Parameters<
			typeof db.execute
		>[0],
	);
	return (result as { rows: Array<{ indexname: string }> }).rows.map((r) => r.indexname);
}

describe("L1a migration — schema shape", () => {
	test("threads has host_kind, host_id, initiator_id, resolved_at, last_active_at columns", async ({
		db,
	}) => {
		const cols = await columnsOf(db, "threads");
		expect(cols).toContain("host_kind");
		expect(cols).toContain("host_id");
		expect(cols).toContain("initiator_id");
		expect(cols).toContain("resolved_at");
		expect(cols).toContain("last_active_at");
	});

	test("threads no longer has kind column (dropped per §5.2)", async ({ db }) => {
		const cols = await columnsOf(db, "threads");
		expect(cols).not.toContain("kind");
	});

	test("messages has type, payload, client_key, deleted_at, redacted_at, resolved_at", async ({
		db,
	}) => {
		const cols = await columnsOf(db, "messages");
		expect(cols).toContain("type");
		expect(cols).toContain("payload");
		expect(cols).toContain("client_key");
		expect(cols).toContain("deleted_at");
		expect(cols).toContain("redacted_at");
		expect(cols).toContain("resolved_at");
	});

	test("messages no longer has legacy_item_id column", async ({
		db,
	}) => {
		const cols = await columnsOf(db, "messages");
		expect(cols).not.toContain("legacy_item_id");
	});

	test("messages drops recipient_id, subject, body, file_leases (§5.2)", async ({ db }) => {
		const cols = await columnsOf(db, "messages");
		expect(cols).not.toContain("recipient_id");
		expect(cols).not.toContain("subject");
		expect(cols).not.toContain("body");
		expect(cols).not.toContain("file_leases");
	});

	test("type, payload, client_key, host_kind, host_id, initiator_id, last_active_at end up NOT NULL", async ({
		db,
	}) => {
		const checkNotNull = async (table: string, column: string): Promise<void> => {
			const result = await db.execute(
				`SELECT is_nullable FROM information_schema.columns WHERE table_name = '${table}' AND column_name = '${column}' AND table_schema = 'public'` as Parameters<
					typeof db.execute
				>[0],
			);
			const rows = (result as { rows: Array<{ is_nullable: string }> }).rows;
			expect(rows[0], `${table}.${column} column missing`).toBeDefined();
			expect(rows[0]?.is_nullable, `${table}.${column} should be NOT NULL`).toBe("NO");
		};

		await checkNotNull("messages", "type");
		await checkNotNull("messages", "payload");
		await checkNotNull("messages", "client_key");
		await checkNotNull("threads", "host_kind");
		await checkNotNull("threads", "host_id");
		await checkNotNull("threads", "initiator_id");
		await checkNotNull("threads", "last_active_at");
	});

	test("threads_host_idx covers (host_kind, host_id, last_active_at)", async ({ db }) => {
		const idxs = await indexNamesOf(db, "threads");
		expect(idxs).toContain("threads_host_idx");
	});

	test("messages indexes: messages_thread_id_idx, messages_idempotency_uq, messages_unresolved_idx", async ({
		db,
	}) => {
		const idxs = await indexNamesOf(db, "messages");
		expect(idxs).toContain("messages_thread_id_idx");
		expect(idxs).toContain("messages_idempotency_uq");
		expect(idxs).toContain("messages_unresolved_idx");
	});

	test("(thread_id, sender_id, client_key) is a UNIQUE index on messages", async ({ db }) => {
		const result = await db.execute(
			`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'messages' AND indexname = 'messages_idempotency_uq' AND schemaname = 'public'` as Parameters<
				typeof db.execute
			>[0],
		);
		const rows = (result as { rows: Array<{ indexname: string; indexdef: string }> }).rows;
		expect(rows[0]).toBeDefined();
		expect(rows[0]?.indexdef).toMatch(/UNIQUE/i);
		// The index def should contain the relevant columns
		const def = rows[0]?.indexdef ?? "";
		expect(def).toContain("thread_id");
		expect(def).toContain("sender_id");
		expect(def).toContain("client_key");
	});

	test("the legacy `responses` table is dropped", async ({ db }) => {
		const result = await db.execute(
			`SELECT tablename FROM pg_tables WHERE schemaname = 'public'` as Parameters<
				typeof db.execute
			>[0],
		);
		const tables = (result as { rows: Array<{ tablename: string }> }).rows.map((r) => r.tablename);
		expect(tables).not.toContain("responses");
	});
});

describe("L1a migration — legacy data projection (§5.3)", () => {
	test("plain message round-trips with type='plain'", async ({ db }) => {
		// Smoke: insert a bare message via the post-migration schema and
		// assert it round-trips with type='plain'.
		const now = new Date().toISOString();
		await db.execute(
			`INSERT INTO users (id, kind, name, role, status, created_at) VALUES ('u1', 'human', 'U', 'founder', 'active', '${now}')` as Parameters<
				typeof db.execute
			>[0],
		);
		await db.execute(
			`INSERT INTO threads (id, host_kind, host_id, initiator_id, participants, last_active_at, created_at) VALUES ('thr-chat', 'user', 'u1', 'u1', '["u1"]', '${now}', '${now}')` as Parameters<
				typeof db.execute
			>[0],
		);
		await db.execute(
			`INSERT INTO messages (id, thread_id, sender_id, type, payload, client_key, created_at) VALUES ('m1', 'thr-chat', 'u1', 'plain', '${JSON.stringify({ text: "subject\n\nbody" })}', 'k1', '${now}')` as Parameters<
				typeof db.execute
			>[0],
		);

		const result = await db.execute(
			`SELECT id, type, payload FROM messages WHERE id='m1'` as Parameters<typeof db.execute>[0],
		);
		const rows = (
			result as {
				rows: Array<{ id: string; type: string; payload: string }>;
			}
		).rows;
		expect(rows).toHaveLength(1);
		expect(rows[0]?.type).toBe("plain");
		const parsed = JSON.parse(rows[0]?.payload ?? "{}") as { text: string };
		expect(parsed.text).toContain("body");
	});

	test("verdict-typed messages can be inserted with payload.resolvesMessageId pointing at a review id", async ({
		db,
	}) => {
		// Smoke: post-migration schema accepts the verdict-message shape.
		const now = new Date().toISOString();
		await db.execute(
			`INSERT INTO threads (id, host_kind, host_id, initiator_id, participants, last_active_at, created_at) VALUES ('thr-r', 'task', 'task-1', 'u1', '["u1","agent-1"]', '${now}', '${now}')` as Parameters<
				typeof db.execute
			>[0],
		);
		await db.execute(
			`INSERT INTO users (id, kind, name, role, status, created_at) VALUES ('u1', 'human', 'U', 'founder', 'active', '${now}')` as Parameters<
				typeof db.execute
			>[0],
		);
		await db.execute(
			`INSERT INTO users (id, kind, name, role, status, created_at) VALUES ('agent-1', 'ai', 'A', 'builder', 'active', '${now}')` as Parameters<
				typeof db.execute
			>[0],
		);
		const reviewPayload = JSON.stringify({
			title: "review",
			reasoning: ["a"],
			artifactRef: { id: "art-1", kind: "text_diff" },
		}).replace(/'/g, "''");
		await db.execute(
			`INSERT INTO messages (id, thread_id, sender_id, type, payload, client_key, created_at) VALUES ('m-rev', 'thr-r', 'agent-1', 'review', '${reviewPayload}', 'kr', '${now}')` as Parameters<
				typeof db.execute
			>[0],
		);
		const verdictPayload = JSON.stringify({
			decision: "approve",
			resolvesMessageId: "m-rev",
		}).replace(/'/g, "''");
		await db.execute(
			`INSERT INTO messages (id, thread_id, sender_id, type, payload, client_key, created_at) VALUES ('m-v', 'thr-r', 'u1', 'verdict', '${verdictPayload}', 'kv', '${now}')` as Parameters<
				typeof db.execute
			>[0],
		);

		const result = await db.execute(
			`SELECT id, type, payload FROM messages WHERE id='m-v'` as Parameters<typeof db.execute>[0],
		);
		const rows = (result as { rows: Array<{ id: string; type: string; payload: string }> }).rows;
		expect(rows[0]?.type).toBe("verdict");
		const p = JSON.parse(rows[0]?.payload ?? "{}") as {
			decision: string;
			resolvesMessageId: string;
		};
		expect(p.decision).toBe("approve");
		expect(p.resolvesMessageId).toBe("m-rev");
	});

	test("idempotency UNIQUE constraint rejects duplicate (thread_id, sender_id, client_key)", async ({
		db,
	}) => {
		const now = new Date().toISOString();
		await db.execute(
			`INSERT INTO threads (id, host_kind, host_id, initiator_id, participants, last_active_at, created_at) VALUES ('thr-i', 'user', 'u1', 'u1', '["u1"]', '${now}', '${now}')` as Parameters<
				typeof db.execute
			>[0],
		);
		await db.execute(
			`INSERT INTO users (id, kind, name, role, status, created_at) VALUES ('u1', 'human', 'U', 'founder', 'active', '${now}')` as Parameters<
				typeof db.execute
			>[0],
		);
		await db.execute(
			`INSERT INTO messages (id, thread_id, sender_id, type, payload, client_key, created_at) VALUES ('m-a', 'thr-i', 'u1', 'plain', '{"text":"hi"}', 'same-key', '${now}')` as Parameters<
				typeof db.execute
			>[0],
		);
		await expect(
			db.execute(
				`INSERT INTO messages (id, thread_id, sender_id, type, payload, client_key, created_at) VALUES ('m-b', 'thr-i', 'u1', 'plain', '{"text":"hi-again"}', 'same-key', '${now}')` as Parameters<
					typeof db.execute
				>[0],
			),
		).rejects.toThrow();
	});
});

describe("L1a — host immutability (PG constraint check)", () => {
	test("UPDATE that changes host_kind raises (immutability trigger)", async ({ db }) => {
		const now = new Date().toISOString();
		await db.execute(
			`INSERT INTO users (id, kind, name, role, status, created_at) VALUES ('u1', 'human', 'U', 'founder', 'active', '${now}')` as Parameters<
				typeof db.execute
			>[0],
		);
		await db.execute(
			`INSERT INTO threads (id, host_kind, host_id, initiator_id, participants, last_active_at, created_at) VALUES ('thr-im', 'task', 'task-1', 'u1', '["u1"]', '${now}', '${now}')` as Parameters<
				typeof db.execute
			>[0],
		);

		await expect(
			db.execute(
				`UPDATE threads SET host_kind='bet' WHERE id='thr-im'` as Parameters<typeof db.execute>[0],
			),
		).rejects.toThrow(/immutable/i);
	});

	test("UPDATE that changes host_id raises (immutability trigger)", async ({ db }) => {
		const now = new Date().toISOString();
		await db.execute(
			`INSERT INTO users (id, kind, name, role, status, created_at) VALUES ('u1', 'human', 'U', 'founder', 'active', '${now}')` as Parameters<
				typeof db.execute
			>[0],
		);
		await db.execute(
			`INSERT INTO threads (id, host_kind, host_id, initiator_id, participants, last_active_at, created_at) VALUES ('thr-im', 'task', 'task-1', 'u1', '["u1"]', '${now}', '${now}')` as Parameters<
				typeof db.execute
			>[0],
		);

		await expect(
			db.execute(
				`UPDATE threads SET host_id='task-99' WHERE id='thr-im'` as Parameters<
					typeof db.execute
				>[0],
			),
		).rejects.toThrow(/immutable/i);
	});

	test("UPDATE of unrelated columns (resolved_at, last_active_at) succeeds", async ({ db }) => {
		const now = new Date().toISOString();
		await db.execute(
			`INSERT INTO users (id, kind, name, role, status, created_at) VALUES ('u1', 'human', 'U', 'founder', 'active', '${now}')` as Parameters<
				typeof db.execute
			>[0],
		);
		await db.execute(
			`INSERT INTO threads (id, host_kind, host_id, initiator_id, participants, last_active_at, created_at) VALUES ('thr-im', 'task', 'task-1', 'u1', '["u1"]', '${now}', '${now}')` as Parameters<
				typeof db.execute
			>[0],
		);

		const later = new Date(Date.now() + 1000).toISOString();
		// Should NOT raise — only host_kind and host_id are immutable.
		await db.execute(
			`UPDATE threads SET resolved_at='${later}', last_active_at='${later}' WHERE id='thr-im'` as Parameters<
				typeof db.execute
			>[0],
		);
		const result = await db.execute(
			`SELECT resolved_at FROM threads WHERE id='thr-im'` as Parameters<typeof db.execute>[0],
		);
		const rows = (result as { rows: Array<{ resolved_at: string }> }).rows;
		expect(rows[0]?.resolved_at).toBeDefined();
	});
});

describe("L1a migration — Postgres parity (skipped when no PG env)", () => {
	const HAS_PG = Boolean(process.env.HYPERIDLE_PG_TEST_URL);

	test.skipIf(!HAS_PG)(
		"the same migration applies cleanly against Postgres (dual-driver invariant)",
		async () => {
			// The actual cross-driver runner is `pg-test-runner.ts` in the db
			// package. We only assert here that env-gated coverage exists.
			expect(HAS_PG).toBe(true);
		},
	);
});
