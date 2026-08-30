/**
 * Brownfield migration test for 0068 (a routine's prompt becomes a document).
 *
 * Every routine already out there carries its instruction in `routines.prompt`.
 * The migration has to move each one into a knowledge document and point the
 * routine at it, or those routines start firing with no instruction at all.
 *
 * Applies 0..67, seeds routines with and without prompts, applies 0068, and
 * asserts the text survived, the link exists, and a routine that never had a
 * prompt is left pointing at nothing.
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
	const tmpDir = mkdtempSync(join(tmpdir(), "drizzle-brownfield-0068-"));
	cpSync(DRIZZLE_FOLDER, tmpDir, { recursive: true });
	const journal = JSON.parse(readFileSync(join(DRIZZLE_FOLDER, "meta/_journal.json"), "utf-8")) as {
		entries: Array<{ idx: number }>;
	};
	journal.entries = journal.entries.filter((e) => e.idx <= upToIdx);
	writeFileSync(join(tmpDir, "meta/_journal.json"), JSON.stringify(journal, null, 2));
	return tmpDir;
}

const NOW = "2026-01-01T00:00:00.000Z";

describe("migration 0068: a routine's prompt becomes a document — brownfield", () => {
	const clients: PGlite[] = [];
	const tempDirs: string[] = [];

	afterAll(async () => {
		await Promise.allSettled(clients.map((c) => c.close()));
		for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
	});

	it("moves every existing prompt into a document the routine points at", {
		timeout: 120_000,
	}, async () => {
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);

		const folder67 = makeTempMigrationsFolder(67);
		tempDirs.push(folder67);
		await migrate(db, { migrationsFolder: folder67 });

		await db.execute(sql`
			INSERT INTO users (id, name, role, kind, status, created_at)
			VALUES ('agent-owner', 'Owner', 'builder', 'ai', 'active', ${NOW})
		`);
		await db.execute(sql`
			INSERT INTO routines (id, name, prompt, owner_agent_id, trigger_type, active, state, created_at)
			VALUES
				('r-with-prompt', 'Weekly sweep', 'Sweep the stale items.', 'agent-owner', 'calendar', true, 'active', ${NOW}),
				('r-empty-prompt', 'Empty', '', 'agent-owner', 'calendar', true, 'active', ${NOW}),
				('r-no-prompt', 'No prompt', NULL, 'agent-owner', 'calendar', true, 'active', ${NOW})
		`);

		const folder68 = makeTempMigrationsFolder(68);
		tempDirs.push(folder68);
		await migrate(db, { migrationsFolder: folder68 });

		const rows = await db.execute<{ id: string; prompt_knowledge_id: string | null }>(sql`
			SELECT id, prompt_knowledge_id FROM routines ORDER BY id
		`);
		const byRoutine = new Map(rows.rows.map((r) => [r.id, r.prompt_knowledge_id]));

		// The one with an instruction now points at a document.
		const docId = byRoutine.get("r-with-prompt");
		expect(docId).toBeTruthy();
		// The two without one point at nothing — an empty string is not an instruction.
		expect(byRoutine.get("r-empty-prompt")).toBeNull();
		expect(byRoutine.get("r-no-prompt")).toBeNull();

		const docs = await db.execute<{
			body: string;
			title: string;
			role: string;
			status: string;
		}>(sql`
			SELECT body, title, role, status FROM knowledge_items WHERE id = ${String(docId)}
		`);
		const doc = docs.rows[0];
		expect(doc?.body).toBe("Sweep the stale items.");
		expect(doc?.status).toBe("active");
		// Ordinary knowledge — what makes it a prompt is the routine pointing at it.
		expect(doc?.role).toBe("ordinary");
		// Named after the routine so it is findable in the knowledge view.
		expect(doc?.title).toContain("Weekly sweep");

		// The projection row `list()` reads — without it the document would be
		// invisible in the knowledge view it now lives in.
		const proj = await db.execute<{ count: string }>(sql`
			SELECT count(*) AS count FROM knowledge_app_projection WHERE knowledge_item_id = ${String(docId)}
		`);
		expect(Number(proj.rows[0]?.count)).toBe(1);

		// The column is gone.
		const cols = await db.execute<{ column_name: string }>(sql`
			SELECT column_name FROM information_schema.columns
			WHERE table_name = 'routines' AND column_name = 'prompt'
		`);
		expect(cols.rows).toHaveLength(0);
	});
});
