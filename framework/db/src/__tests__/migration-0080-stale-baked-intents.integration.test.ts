/**
 * nested-knowledge-items architecture.md §7 / review.md B10 — migration
 * `0080` step 11 fails any pending/claimed `agent_work_intents` row whose
 * baked `contextBundle.knowledge` predates the `parentChain` contract,
 * instead of leaving it to crash the drain path with "undefined is not
 * iterable" (`writeOrdinaryItem` iterates `item.parentChain`
 * unconditionally, and the field is required as of this migration).
 *
 * Same brownfield discipline as migration-0080-nested-knowledge-brownfield:
 * real migrations 0..79, hand-seeded pre-state, then the real pending `0080`.
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
const NESTED_KNOWLEDGE_MIGRATION_IDX = 80;

function makeTempMigrationsFolder(upToIdx: number): string {
	const tmpDir = mkdtempSync(join(tmpdir(), "drizzle-brownfield-stale-intents-"));
	cpSync(DRIZZLE_FOLDER, tmpDir, { recursive: true });
	const journal = JSON.parse(readFileSync(join(DRIZZLE_FOLDER, "meta/_journal.json"), "utf-8")) as {
		entries: Array<{ idx: number }>;
	};
	journal.entries = journal.entries.filter((e) => e.idx <= upToIdx);
	writeFileSync(join(tmpDir, "meta/_journal.json"), JSON.stringify(journal, null, 2));
	return tmpDir;
}

const NOW = "2026-01-01T00:00:00.000Z";

describe("nested-knowledge-items migration: stale baked agent_work_intents (B10)", () => {
	const clients: PGlite[] = [];
	const tempDirs: string[] = [];

	afterAll(async () => {
		await Promise.allSettled(clients.map((c) => c.close()));
		for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
	});

	it(
		"fails a pending intent baked before the parentChain contract; leaves a fresh-shape pending intent untouched",
		{ timeout: 180_000 },
		async () => {
			const client = new PGlite();
			clients.push(client);
			await client.waitReady;
			const db = drizzle(client);

			const folder79 = makeTempMigrationsFolder(79);
			tempDirs.push(folder79);
			await migrate(db, { migrationsFolder: folder79 });

			// Pre-migration shape: a knowledge item with `layer`, no `parentChain`.
			const staleBundle = {
				contextBundle: {
					kind: "task",
					knowledge: [{ id: "k-1", title: "x", body: "b", format: "markdown", version: 1, layer: "L2", role: "ordinary" }],
				},
			};
			await db.execute(sql`
				INSERT INTO agent_work_intents
					(id, kind, source_kind, source_id, idempotency_key, status, baked_request_json, created_at, updated_at)
				VALUES
					('intent-stale', 'task_run', 'task_dispatch_attempt', 'src-stale', 'idem-stale', 'pending', ${JSON.stringify(staleBundle)}, ${NOW}, ${NOW})
			`);
			await db.execute(sql`
				INSERT INTO agent_work_intents
					(id, kind, source_kind, source_id, idempotency_key, status, claim_token, claim_expires_at, baked_request_json, created_at, updated_at)
				VALUES
					('intent-stale-claimed', 'task_run', 'task_dispatch_attempt', 'src-stale-2', 'idem-stale-2', 'claimed', 'tok-1', ${NOW}, ${JSON.stringify(staleBundle)}, ${NOW}, ${NOW})
			`);

			// Post-migration shape: every item carries parentChain (possibly empty).
			const freshBundle = {
				contextBundle: {
					kind: "task",
					knowledge: [
						{
							id: "k-2",
							title: "y",
							body: "b",
							format: "markdown",
							version: 1,
							parentChain: [],
							scopeKind: "factory",
							role: "ordinary",
						},
					],
				},
			};
			await db.execute(sql`
				INSERT INTO agent_work_intents
					(id, kind, source_kind, source_id, idempotency_key, status, baked_request_json, created_at, updated_at)
				VALUES
					('intent-fresh', 'task_run', 'task_dispatch_attempt', 'src-fresh', 'idem-fresh', 'pending', ${JSON.stringify(freshBundle)}, ${NOW}, ${NOW})
			`);

			// An already-terminal intent with a stale shape must not be resurrected.
			await db.execute(sql`
				INSERT INTO agent_work_intents
					(id, kind, source_kind, source_id, idempotency_key, status, baked_request_json, created_at, updated_at)
				VALUES
					('intent-stale-done', 'task_run', 'task_dispatch_attempt', 'src-stale-done', 'idem-stale-done', 'superseded', ${JSON.stringify(staleBundle)}, ${NOW}, ${NOW})
			`);

			const folderPending = makeTempMigrationsFolder(NESTED_KNOWLEDGE_MIGRATION_IDX);
			tempDirs.push(folderPending);
			await migrate(db, { migrationsFolder: folderPending });

			const rows = await db.execute(sql`
				SELECT id, status, claim_token, claim_expires_at, last_error_code
				FROM agent_work_intents
				ORDER BY id
			`);
			const byId = new Map((rows.rows as Array<Record<string, unknown>>).map((r) => [r.id, r]));

			expect(byId.get("intent-stale")).toMatchObject({
				status: "failed",
				claim_token: null,
				claim_expires_at: null,
				last_error_code: "STALE_BAKED_CONTEXT",
			});
			expect(byId.get("intent-stale-claimed")).toMatchObject({
				status: "failed",
				claim_token: null,
				claim_expires_at: null,
				last_error_code: "STALE_BAKED_CONTEXT",
			});
			expect(byId.get("intent-fresh")).toMatchObject({ status: "pending" });
			expect(byId.get("intent-stale-done")).toMatchObject({ status: "superseded" });
		},
	);
});
