/**
 * Brownfield migration test for 0069 (an agent's persona becomes a document).
 *
 * Every agent already out there carries its identity in
 * `agent_run_config.system_prompt`. The migration has to move each one into an
 * `agent_file` knowledge document bound to that agent, or those agents start
 * running with no identity at all.
 *
 * Applies 0..68, seeds agents with and without a persona, applies 0069, and
 * asserts the text survived, the binding is right, and an agent that never had
 * a persona gets no document.
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
	const tmpDir = mkdtempSync(join(tmpdir(), "drizzle-brownfield-0069-"));
	cpSync(DRIZZLE_FOLDER, tmpDir, { recursive: true });
	const journal = JSON.parse(readFileSync(join(DRIZZLE_FOLDER, "meta/_journal.json"), "utf-8")) as {
		entries: Array<{ idx: number }>;
	};
	journal.entries = journal.entries.filter((e) => e.idx <= upToIdx);
	writeFileSync(join(tmpDir, "meta/_journal.json"), JSON.stringify(journal, null, 2));
	return tmpDir;
}

const NOW = "2026-01-01T00:00:00.000Z";

describe("migration 0069: an agent's persona becomes a document — brownfield", () => {
	const clients: PGlite[] = [];
	const tempDirs: string[] = [];

	afterAll(async () => {
		await Promise.allSettled(clients.map((c) => c.close()));
		for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
	});

	it("moves every existing persona into a document bound to its agent", {
		timeout: 120_000,
	}, async () => {
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);

		const folder68 = makeTempMigrationsFolder(68);
		tempDirs.push(folder68);
		await migrate(db, { migrationsFolder: folder68 });

		await db.execute(sql`
				INSERT INTO users (id, name, role, kind, status, created_at)
				VALUES
					('agent-with-persona', 'Atlas', 'builder', 'ai', 'active', ${NOW}),
					('agent-empty-persona', 'Empty', 'builder', 'ai', 'active', ${NOW}),
					('agent-no-persona', 'None', 'builder', 'ai', 'active', ${NOW})
			`);
		await db.execute(sql`
				INSERT INTO agent_run_config (agent_user_id, system_prompt, harness_type)
				VALUES
					('agent-with-persona', 'You are Atlas, a builder.', 'claude-code'),
					('agent-empty-persona', '', 'claude-code'),
					('agent-no-persona', NULL, 'claude-code')
			`);

		const folder69 = makeTempMigrationsFolder(69);
		tempDirs.push(folder69);
		await migrate(db, { migrationsFolder: folder69 });

		const docs = await db.execute<{
			id: string;
			body: string;
			title: string;
			role: string;
			status: string;
			scope_kind: string;
			scope_id: string;
		}>(sql`
				SELECT id, body, title, role, status, scope_kind, scope_id
				FROM knowledge_items WHERE role = 'agent_file' ORDER BY scope_id
			`);

		// Only the agent that had text gets a document. An empty string is not
		// an identity, and neither is NULL.
		expect(docs.rows).toHaveLength(1);
		const doc = docs.rows[0];
		expect(doc?.body).toBe("You are Atlas, a builder.");
		expect(doc?.status).toBe("active");
		// The binding context assembly reads: scope_kind='user' + scope_id=agent.
		expect(doc?.scope_kind).toBe("user");
		expect(doc?.scope_id).toBe("agent-with-persona");
		// Named after the agent so it is findable in the knowledge view.
		expect(doc?.title).toContain("Atlas");

		// The projection row `list()` reads — without it the document would be
		// invisible in the knowledge view it now lives in.
		const proj = await db.execute<{ count: string }>(sql`
				SELECT count(*) AS count FROM knowledge_app_projection
				WHERE knowledge_item_id = ${String(doc?.id)}
			`);
		expect(Number(proj.rows[0]?.count)).toBe(1);

		// The run config rows survive — only the persona left them.
		const cfg = await db.execute<{ agent_user_id: string; harness_type: string }>(sql`
				SELECT agent_user_id, harness_type FROM agent_run_config ORDER BY agent_user_id
			`);
		expect(cfg.rows).toHaveLength(3);
		expect(cfg.rows[0]?.harness_type).toBe("claude-code");

		// The column is gone.
		const cols = await db.execute<{ column_name: string }>(sql`
				SELECT column_name FROM information_schema.columns
				WHERE table_name = 'agent_run_config' AND column_name = 'system_prompt'
			`);
		expect(cols.rows).toHaveLength(0);
	});
});
