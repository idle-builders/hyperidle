/**
 * Brownfield migration test for 0094 (drop invite codes and login sessions).
 *
 * Nothing can create an invite code or a login session any more, so the two
 * tables go. Seeds both with rows pointing at people — a claimed invite, an
 * open one, a live and a revoked session — and asserts both tables are gone
 * while the people survive.
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
const PRE_MIGRATION_IDX = 93;
const MIGRATION_IDX = 94;
const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-02-01T00:00:00.000Z";

function makeTempMigrationsFolder(upToIdx: number): string {
	const tmpDir = mkdtempSync(join(tmpdir(), "drizzle-brownfield-0094-"));
	cpSync(DRIZZLE_FOLDER, tmpDir, { recursive: true });
	const journal = JSON.parse(readFileSync(join(DRIZZLE_FOLDER, "meta/_journal.json"), "utf-8")) as {
		entries: Array<{ idx: number }>;
	};
	journal.entries = journal.entries.filter((e) => e.idx <= upToIdx);
	writeFileSync(join(tmpDir, "meta/_journal.json"), JSON.stringify(journal, null, 2));
	return tmpDir;
}

describe("migration 0094: drop invite codes and login sessions — brownfield", () => {
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
			INSERT INTO users (id, kind, name, role, status, created_at) VALUES
				('u-admin', 'human', 'Admin', 'founder', 'active', ${NOW}),
				('u-member', 'human', 'Member', 'member', 'active', ${NOW})
		`);
		await db.execute(sql`
			INSERT INTO invite_codes (id, code, created_by, claimed_by, role, expires_at, created_at) VALUES
				('inv-claimed', 'code-claimed', 'u-admin', 'u-member', 'member', ${LATER}, ${NOW}),
				('inv-open', 'code-open', 'u-admin', NULL, 'admin', ${LATER}, ${NOW})
		`);
		await db.execute(sql`
			INSERT INTO login_sessions (id, user_id, token_hash, expires_at, created_at, revoked_at) VALUES
				('ls-live', 'u-member', 'hash-live', ${LATER}, ${NOW}, NULL),
				('ls-revoked', 'u-admin', 'hash-revoked', ${LATER}, ${NOW}, ${NOW})
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

	it("drops the invite codes and login sessions tables", async () => {
		expect(await tableExists("invite_codes")).toBe(false);
		expect(await tableExists("login_sessions")).toBe(false);
	});

	it("keeps every person the dropped rows pointed at", async () => {
		const rows = (await db.execute(sql`SELECT id FROM users ORDER BY id`)).rows as Array<{
			id: string;
		}>;
		expect(rows).toEqual([{ id: "u-admin" }, { id: "u-member" }]);
	});
});
