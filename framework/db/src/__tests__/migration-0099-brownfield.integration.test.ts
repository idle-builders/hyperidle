/**
 * Brownfield migration test for 0099 (a verdict is approve or reject).
 *
 * Seeds verdict messages and their thread-history rows with every old decision
 * at 0098, runs 0099, and checks each one landed on approve or reject with its
 * note — and that a decision 0099 does not know stops the migration.
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
const PRE_MIGRATION_IDX = 98;
const MIGRATION_IDX = 99;
const NOW = "2026-01-01T00:00:00.000Z";

function makeTempMigrationsFolder(upToIdx: number): string {
	const tmpDir = mkdtempSync(join(tmpdir(), "drizzle-brownfield-0099-"));
	cpSync(DRIZZLE_FOLDER, tmpDir, { recursive: true });
	const journal = JSON.parse(readFileSync(join(DRIZZLE_FOLDER, "meta/_journal.json"), "utf-8")) as {
		entries: Array<{ idx: number }>;
	};
	journal.entries = journal.entries.filter((e) => e.idx <= upToIdx);
	writeFileSync(join(tmpDir, "meta/_journal.json"), JSON.stringify(journal, null, 2));
	return tmpDir;
}

type Db = ReturnType<typeof drizzle>;

async function payloadOf(db: Db, id: string): Promise<Record<string, unknown>> {
	const result = (await db.execute(sql`SELECT payload FROM messages WHERE id = ${id}`)) as {
		rows: Array<{ payload: string }>;
	};
	const row = result.rows[0];
	if (row === undefined) throw new Error(`no message ${id}`);
	return JSON.parse(row.payload) as Record<string, unknown>;
}

async function historyOf(
	db: Db,
	id: string,
): Promise<{
	after: { payload: Record<string, unknown> };
	before: { payload: Record<string, unknown> } | null;
}> {
	const result = (await db.execute(sql`SELECT after, before FROM changes WHERE id = ${id}`)) as {
		rows: Array<{ after: string; before: string | null }>;
	};
	const row = result.rows[0];
	if (row === undefined) throw new Error(`no change ${id}`);
	return {
		after: JSON.parse(row.after),
		before: row.before === null ? null : JSON.parse(row.before),
	};
}

const VERDICTS: ReadonlyArray<{
	readonly id: string;
	readonly payload: Record<string, unknown>;
	readonly expected: Record<string, unknown>;
}> = [
	{
		id: "v-awc",
		payload: { decision: "approve-with-comments", resolvesMessageId: "r", note: "Nice." },
		expected: { decision: "approve", resolvesMessageId: "r", note: "Nice." },
	},
	{
		id: "v-edit",
		payload: { decision: "edit", resolvesMessageId: "r", note: "Fixed a typo." },
		expected: { decision: "approve", resolvesMessageId: "r", note: "Fixed a typo." },
	},
	{
		id: "v-rc-note",
		payload: { decision: "request-changes", resolvesMessageId: "r", note: "Use config." },
		expected: { decision: "reject", resolvesMessageId: "r", note: "Use config." },
	},
	{
		id: "v-rc-bare",
		payload: { decision: "request-changes", resolvesMessageId: "r" },
		expected: { decision: "reject", resolvesMessageId: "r", note: "Changes requested." },
	},
	{
		id: "v-rc-blank",
		payload: { decision: "request-changes", resolvesMessageId: "r", note: "  " },
		expected: { decision: "reject", resolvesMessageId: "r", note: "Changes requested." },
	},
	{
		id: "v-approve",
		payload: { decision: "approve", resolvesMessageId: "r" },
		expected: { decision: "approve", resolvesMessageId: "r" },
	},
	{
		id: "v-reject",
		payload: { decision: "reject", resolvesMessageId: "r", note: "No." },
		expected: { decision: "reject", resolvesMessageId: "r", note: "No." },
	},
	{
		id: "v-redacted",
		payload: { redacted: true, redactedBy: "user-0099", redactedAt: NOW, reason: "oops" },
		expected: { redacted: true, redactedBy: "user-0099", redactedAt: NOW, reason: "oops" },
	},
];

describe("migration 0099: a verdict is approve or reject — brownfield", () => {
	const clients: PGlite[] = [];
	const tempDirs: string[] = [];

	afterAll(async () => {
		await Promise.allSettled(clients.map((c) => c.close()));
		for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
	});

	async function seedAt0098(verdicts: typeof VERDICTS): Promise<Db> {
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);
		const folder = makeTempMigrationsFolder(PRE_MIGRATION_IDX);
		tempDirs.push(folder);
		await migrate(db, { migrationsFolder: folder });

		await db.execute(
			sql`INSERT INTO users (id, name, role, status, created_at) VALUES ('user-0099', 'Seeder', 'founder', 'active', ${NOW})`,
		);
		await db.execute(
			sql`INSERT INTO threads (id, host_kind, host_id, initiator_id, participants, last_active_at, created_at)
				VALUES ('thr-0099', 'user', 'user-0099', 'user-0099', '["user-0099"]', ${NOW}, ${NOW})`,
		);
		for (const v of verdicts) {
			const message = JSON.stringify({ messageId: v.id, type: "verdict", payload: v.payload });
			await db.execute(
				sql`INSERT INTO messages (id, sender_id, thread_id, type, payload, client_key, created_at)
					VALUES (${v.id}, 'user-0099', 'thr-0099', 'verdict', ${JSON.stringify(v.payload)}, ${`ck-${v.id}`}, ${NOW})`,
			);
			await db.execute(
				sql`INSERT INTO changes (id, object, object_id, kind, actor, before, after, at)
					VALUES (${`ch-${v.id}`}, 'thread', 'thr-0099', 'message', 'user-0099', ${message}, ${message}, ${NOW})`,
			);
		}
		return db;
	}

	async function migrateTo0099(db: Db): Promise<void> {
		const folder = makeTempMigrationsFolder(MIGRATION_IDX);
		tempDirs.push(folder);
		await migrate(db, { migrationsFolder: folder });
	}

	it.each(VERDICTS)(
		"$id: the stored verdict and its history land on approve or reject",
		async (v) => {
			const db = await seedAt0098(VERDICTS);
			await migrateTo0099(db);

			expect(await payloadOf(db, v.id)).toEqual(v.expected);
			const history = await historyOf(db, `ch-${v.id}`);
			expect(history.after.payload).toEqual(v.expected);
			expect(history.before?.payload).toEqual(v.expected);
		},
	);

	it("a decision 0099 does not know stops the migration", async () => {
		const db = await seedAt0098([
			{
				id: "v-unknown",
				payload: { decision: "shrug", resolvesMessageId: "r" },
				expected: {},
			},
		]);
		await expect(migrateTo0099(db)).rejects.toThrow(/approve or reject/);
	});
});
