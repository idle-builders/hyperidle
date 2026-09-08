/**
 * Brownfield migration test for 0078 (BA2's review return half).
 *
 * The verdict on a review arrives after the session that filed it has ended, so
 * three facts have to outlive that session: which native session to resume, which
 * review a gate actually caused, and that "session_resume" is a kind of agent work.
 *
 * Applies 0..77 against a database that already holds a session and an intent,
 * then applies 0078 and checks the existing rows survived and the new shapes hold.
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
	const tmpDir = mkdtempSync(join(tmpdir(), "drizzle-brownfield-0078-"));
	cpSync(DRIZZLE_FOLDER, tmpDir, { recursive: true });
	const journal = JSON.parse(readFileSync(join(DRIZZLE_FOLDER, "meta/_journal.json"), "utf-8")) as {
		entries: Array<{ idx: number }>;
	};
	journal.entries = journal.entries.filter((e) => e.idx <= upToIdx);
	writeFileSync(join(tmpDir, "meta/_journal.json"), JSON.stringify(journal, null, 2));
	return tmpDir;
}

const NOW = "2026-01-01T00:00:00.000Z";

describe("migration 0078: the gate return half — brownfield", () => {
	const clients: PGlite[] = [];
	const tempDirs: string[] = [];

	afterAll(async () => {
		await Promise.allSettled(clients.map((c) => c.close()));
		for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
	});

	it("carries an existing session across, and holds the new gate facts", {
		timeout: 120_000,
	}, async () => {
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);

		const folderBefore = makeTempMigrationsFolder(77);
		tempDirs.push(folderBefore);
		await migrate(db, { migrationsFolder: folderBefore });

		// A session that already existed before the gate had anywhere to record
		// a harness id. It must survive, and it must read as unresumable rather
		// than as an error.
		await db.execute(sql`
				INSERT INTO users (id, name, kind, role, status, created_at)
				VALUES ('agent-1', 'Agent', 'agent', 'member', 'active', ${NOW})
			`);
		await db.execute(sql`
				INSERT INTO sessions (id, agent_id, model_tier, started_at, state)
				VALUES ('sess-old', 'agent-1', 'balanced', ${NOW}, 'completed')
			`);

		const folderAfter = makeTempMigrationsFolder(78);
		tempDirs.push(folderAfter);
		await migrate(db, { migrationsFolder: folderAfter });

		const carried = await db.execute(sql`
				SELECT id, harness_session_id FROM sessions WHERE id = 'sess-old'
			`);
		expect(carried.rows).toHaveLength(1);
		expect((carried.rows[0] as { harness_session_id: string | null }).harness_session_id).toBe(
			null,
		);

		// One session per review. A second row for the same review message is the
		// shape of the bug where one verdict resumes more than one session.
		await db.execute(sql`
				INSERT INTO review_sessions (id, review_message_id, session_id, created_at)
				VALUES ('gr-1', 'msg-1', 'sess-old', ${NOW})
			`);
		await expect(
			db.execute(sql`
					INSERT INTO review_sessions (id, review_message_id, session_id, created_at)
					VALUES ('gr-2', 'msg-1', 'sess-old', ${NOW})
				`),
		).rejects.toThrow();
	});

	it("drops the action rules table, which no longer has a consumer", async () => {
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);
		const folder = makeTempMigrationsFolder(78);
		tempDirs.push(folder);
		await migrate(db, { migrationsFolder: folder });

		await expect(
			db.execute(sql`SELECT 1 FROM action_rules`),
			"interception is gone, so the rule list it read has no reason to exist",
		).rejects.toThrow();
	});

	it("accepts session_resume as agent work, and still refuses a kind nobody drains", async () => {
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);

		const folder = makeTempMigrationsFolder(78);
		tempDirs.push(folder);
		await migrate(db, { migrationsFolder: folder });

		await db.execute(sql`
			INSERT INTO agent_work_intents
				(id, kind, source_kind, source_id, idempotency_key, created_at, updated_at)
			VALUES ('intent-1', 'session_resume', 'review_verdict', 'msg-1', 'resume:msg-1', ${NOW}, ${NOW})
		`);
		const stored = await db.execute(sql`SELECT kind FROM agent_work_intents WHERE id = 'intent-1'`);
		expect((stored.rows[0] as { kind: string }).kind).toBe("session_resume");

		await expect(
			db.execute(sql`
				INSERT INTO agent_work_intents
					(id, kind, source_kind, source_id, idempotency_key, created_at, updated_at)
				VALUES ('intent-2', 'reengagement', 'review_verdict', 'msg-2', 'x', ${NOW}, ${NOW})
			`),
		).rejects.toThrow();
	});
});
