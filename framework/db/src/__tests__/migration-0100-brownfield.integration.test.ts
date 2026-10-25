/**
 * Brownfield migration test for 0100 (a user's teams become a set).
 *
 * Seeds people and agents with the old single team column at 0099, runs 0100,
 * and checks every team landed in user_teams — owned agents in their owner's.
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
const PRE_MIGRATION_IDX = 99;
const MIGRATION_IDX = 100;
const NOW = "2026-01-01T00:00:00.000Z";

function makeTempMigrationsFolder(upToIdx: number): string {
	const tmpDir = mkdtempSync(join(tmpdir(), "drizzle-brownfield-0100-"));
	cpSync(DRIZZLE_FOLDER, tmpDir, { recursive: true });
	const journal = JSON.parse(readFileSync(join(DRIZZLE_FOLDER, "meta/_journal.json"), "utf-8")) as {
		entries: Array<{ idx: number }>;
	};
	journal.entries = journal.entries.filter((e) => e.idx <= upToIdx);
	writeFileSync(join(tmpDir, "meta/_journal.json"), JSON.stringify(journal, null, 2));
	return tmpDir;
}

type Db = ReturnType<typeof drizzle>;

interface OldUser {
	readonly id: string;
	readonly kind: "human" | "ai";
	readonly teamId: string | null;
	readonly ownerUserId: string | null;
}

const PEOPLE_AND_AGENTS: readonly OldUser[] = [
	{ id: "u-maya", kind: "human", teamId: "t-support", ownerUserId: null },
	{ id: "u-teamless", kind: "human", teamId: null, ownerUserId: null },
	{ id: "a-builder", kind: "ai", teamId: "t-product", ownerUserId: null },
	{ id: "a-designer", kind: "ai", teamId: null, ownerUserId: "u-maya" },
	{ id: "a-factory", kind: "ai", teamId: null, ownerUserId: null },
];

describe("migration 0100: a user's teams become a set — brownfield", () => {
	const clients: PGlite[] = [];
	const tempDirs: string[] = [];

	afterAll(async () => {
		await Promise.allSettled(clients.map((c) => c.close()));
		for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
	});

	async function seedAt0099(): Promise<Db> {
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);
		const folder = makeTempMigrationsFolder(PRE_MIGRATION_IDX);
		tempDirs.push(folder);
		await migrate(db, { migrationsFolder: folder });

		for (const team of ["t-support", "t-product"]) {
			await db.execute(
				sql`INSERT INTO teams (id, name, created_at) VALUES (${team}, ${team}, ${NOW})`,
			);
		}
		for (const u of PEOPLE_AND_AGENTS) {
			await db.execute(
				sql`INSERT INTO users (id, kind, name, role, status, created_at, team_id, owner_user_id)
					VALUES (${u.id}, ${u.kind}, ${u.id}, 'member', 'active', ${NOW}, ${u.teamId}, ${u.ownerUserId})`,
			);
		}
		return db;
	}

	async function migrateTo0100(db: Db): Promise<void> {
		const folder = makeTempMigrationsFolder(MIGRATION_IDX);
		tempDirs.push(folder);
		await migrate(db, { migrationsFolder: folder });
	}

	async function teamsOf(db: Db, userId: string): Promise<string[]> {
		const result = (await db.execute(
			sql`SELECT team_id FROM user_teams WHERE user_id = ${userId} ORDER BY team_id`,
		)) as { rows: Array<{ team_id: string }> };
		return result.rows.map((r) => r.team_id);
	}

	it.each([
		{ userId: "u-maya", expected: ["t-support"] },
		{ userId: "u-teamless", expected: [] },
		{ userId: "a-builder", expected: ["t-product"] },
		{ userId: "a-designer", expected: ["t-support"] },
		{ userId: "a-factory", expected: [] },
	])("$userId lands in $expected", async ({ userId, expected }) => {
		const db = await seedAt0099();
		await migrateTo0100(db);
		expect(await teamsOf(db, userId)).toEqual(expected);
	});
});
