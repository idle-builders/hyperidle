/**
 * Brownfield migration test for 0108: the first agent's reasons to start on every change anywhere
 * go; a reason someone wrote for an agent, and a person's own notifications, stay.
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
const NOW = "2026-01-01T00:00:00.000Z";
const EVERY_CHANGE = [
	"task.created",
	"task.changed",
	"thread.created",
	"thread.message",
	"thread.changed",
	"document.created",
	"document.changed",
	"user.created",
	"user.changed",
];

function migrationsUpTo(idx: number): string {
	const tmpDir = mkdtempSync(join(tmpdir(), "drizzle-brownfield-0108-"));
	cpSync(DRIZZLE_FOLDER, tmpDir, { recursive: true });
	const journal = JSON.parse(readFileSync(join(DRIZZLE_FOLDER, "meta/_journal.json"), "utf-8")) as {
		entries: Array<{ idx: number }>;
	};
	journal.entries = journal.entries.filter((e) => e.idx <= idx);
	writeFileSync(join(tmpDir, "meta/_journal.json"), JSON.stringify(journal, null, 2));
	return tmpDir;
}

describe("migration 0108: the first agent no longer starts on every change — brownfield", () => {
	const clients: PGlite[] = [];
	const tempDirs: string[] = [];
	afterAll(async () => {
		await Promise.allSettled(clients.map((c) => c.close()));
		for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
	});

	it("removes the every-change set of an agent and keeps written reasons and a person's", async () => {
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);
		const before = migrationsUpTo(107);
		tempDirs.push(before);
		await migrate(db, { migrationsFolder: before });

		await db.execute(sql`
			INSERT INTO users (id, kind, name, role, status, created_at) VALUES
				('finn', 'human', 'Finn', 'founder', 'active', ${NOW}),
				('builder', 'ai', 'Builder', 'builder', 'active', ${NOW}),
				('growth', 'ai', 'Growth', 'builder', 'active', ${NOW})`);
		const add = (id: string, user: string, event: string) =>
			db.execute(sql`
				INSERT INTO subscriptions (id, user_id, event, created_at, updated_at)
				VALUES (${id}, ${user}, ${event}, ${NOW}, ${NOW})`);
		for (const event of EVERY_CHANGE) {
			await add(`builder-${event}`, "builder", event);
			await add(`finn-${event}`, "finn", event);
		}
		// Growth was given one reason with what to do written down.
		await add("growth-task", "growth", "task.created");
		await db.execute(sql`
			INSERT INTO documents (id, scope_kind, title, body, format, status, version, slot, parent_kind, parent_id, position, updated_by, created_at, updated_at)
			VALUES ('growth-task-prompt', 'factory', 'When a task is made', 'Look at it.', 'markdown', 'active', 1, 'ordinary', 'subscription', 'growth-task', 0, 'finn', ${NOW}, ${NOW})`);

		const after = migrationsUpTo(108);
		tempDirs.push(after);
		await migrate(db, { migrationsFolder: after });

		const left = (await db.execute(
			sql`SELECT user_id, count(*)::int AS n FROM subscriptions GROUP BY user_id ORDER BY user_id`,
		)) as {
			rows: Array<{ user_id: string; n: number }>;
		};
		expect(left.rows).toEqual([
			{ user_id: "finn", n: 9 },
			{ user_id: "growth", n: 1 },
		]);
	});
});
