/**
 * Brownfield migration test for 0067 (repair 'claude' harness type).
 *
 * Databases seeded before this carry `agent_run_config.harness_type = 'claude'`,
 * a value no adapter registers under — the Claude Code adapter registers as
 * 'claude-code'. Selection compares the string for exact equality, so those
 * agents could never be selected and every run of them failed at admission.
 *
 * Fixing the seed only helps databases created afterwards, so the migration has
 * to repair the rows already out there. This applies 0..66, seeds an agent with
 * the broken value alongside agents that must not be touched, applies 0067, and
 * asserts exactly the one row moved.
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
	const tmpDir = mkdtempSync(join(tmpdir(), "drizzle-brownfield-0067-"));
	cpSync(DRIZZLE_FOLDER, tmpDir, { recursive: true });
	const journal = JSON.parse(readFileSync(join(DRIZZLE_FOLDER, "meta/_journal.json"), "utf-8")) as {
		entries: Array<{ idx: number }>;
	};
	journal.entries = journal.entries.filter((e) => e.idx <= upToIdx);
	writeFileSync(join(tmpDir, "meta/_journal.json"), JSON.stringify(journal, null, 2));
	return tmpDir;
}

const NOW = "2026-01-01T00:00:00.000Z";

describe("migration 0067: repair 'claude' harness type — brownfield", () => {
	const clients: PGlite[] = [];
	const tempDirs: string[] = [];

	afterAll(async () => {
		await Promise.allSettled(clients.map((c) => c.close()));
		for (const d of tempDirs) {
			rmSync(d, { recursive: true, force: true });
		}
	});

	it("moves 'claude' to 'claude-code' and leaves every other pin alone", {
		timeout: 120_000,
	}, async () => {
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);

		const folder66 = makeTempMigrationsFolder(66);
		tempDirs.push(folder66);
		await migrate(db, { migrationsFolder: folder66 });

		await db.execute(sql`
				INSERT INTO users (id, name, role, kind, status, created_at)
				VALUES
					('agent-broken', 'Broken Builder', 'builder', 'ai', 'active', ${NOW}),
					('agent-builtin', 'Builtin Agent', 'assistant', 'ai', 'active', ${NOW}),
					('agent-codex', 'Codex Agent', 'builder', 'ai', 'active', ${NOW}),
					('agent-unpinned', 'Unpinned Agent', 'builder', 'ai', 'active', ${NOW})
			`);

		// The broken value, plus rows that must survive untouched: a valid
		// pin, a different valid pin, and an agent that pins nothing (NULL
		// means "any adapter" and is not a defect).
		await db.execute(sql`
				INSERT INTO agent_run_config (agent_user_id, harness_type, max_concurrent_sessions)
				VALUES
					('agent-broken', 'claude', 1),
					('agent-builtin', 'builtin', 1),
					('agent-codex', 'codex', 1),
					('agent-unpinned', NULL, 1)
			`);

		const folder67 = makeTempMigrationsFolder(67);
		tempDirs.push(folder67);
		await migrate(db, { migrationsFolder: folder67 });

		const rows = await db.execute<{ agent_user_id: string; harness_type: string | null }>(sql`
				SELECT agent_user_id, harness_type FROM agent_run_config ORDER BY agent_user_id
			`);
		const byAgent = new Map(rows.rows.map((r) => [r.agent_user_id, r.harness_type]));

		expect(byAgent.get("agent-broken")).toBe("claude-code");
		expect(byAgent.get("agent-builtin")).toBe("builtin");
		expect(byAgent.get("agent-codex")).toBe("codex");
		expect(byAgent.get("agent-unpinned")).toBeNull();

		// Nothing is left pinned to a value the pool cannot register.
		const stragglers = await db.execute<{ count: string }>(sql`
				SELECT count(*) AS count FROM agent_run_config WHERE harness_type = 'claude'
			`);
		expect(Number(stragglers.rows[0]?.count)).toBe(0);
	});
});
