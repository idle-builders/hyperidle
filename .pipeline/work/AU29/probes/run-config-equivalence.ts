/**
 * AU29 feasibility probe — requirements §4 flag.
 *
 * Question: can `writeAgentRunConfig` (layers/agent-orchestration/agent-run-config/src/
 * agent-run-config-store.ts:121) express `factory-bootstrap.ts:33-55`'s upsert-with-patch
 * semantics without adding a new `agentRunConfig` crossing site?
 *
 * Method: two clean PGlite databases, identical `users` rows. Database A gets the bootstrap's own
 * `upsertRunConfig` sequence (copied VERBATIM from factory-bootstrap.ts:33-55). Database B gets the
 * same patches through the owning service's `writeAgentRunConfig`. Sequences exercised:
 *   1. fresh insert with the AH2 runnable-defaults patch (factory-bootstrap.ts:138-143)
 *   2. systemPrompt-only patch on the now-existing row (factory-bootstrap.ts:218)
 *   3. upgrade path: a pre-existing configured row, then the AH2 patch (factory-bootstrap.ts:29-31)
 * Verdict: PASS iff the full `agent_run_config` row sets are deep-equal.
 *
 * Run from the repo root: npx tsx .pipeline/work/AU29/probes/run-config-equivalence.ts
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { writeAgentRunConfig } from "@hyperidle/agent-run-config";
import { applyMigrations, createPgliteDb, type HyperIdleDb } from "@hyperidle/db";
import { agentRunConfig, users } from "@hyperidle/db";

// ---- VERBATIM copy of factory-bootstrap.ts:33-55 (the semantics under test) ----
async function upsertRunConfig(
	db: HyperIdleDb,
	agentUserId: string,
	patch: {
		readonly systemPrompt?: string | null;
		readonly harnessType?: string | null;
		readonly modelId?: string | null;
		readonly modelProvider?: string | null;
		readonly maxConcurrentSessions?: number;
	},
): Promise<void> {
	await db
		.insert(agentRunConfig)
		.values({
			agentUserId,
			systemPrompt: patch.systemPrompt ?? null,
			harnessType: patch.harnessType ?? null,
			modelId: patch.modelId ?? null,
			modelProvider: patch.modelProvider ?? null,
			maxConcurrentSessions: patch.maxConcurrentSessions ?? 1,
		})
		.onConflictDoUpdate({ target: agentRunConfig.agentUserId, set: { ...patch } });
}
// -------------------------------------------------------------------------------

const AH2 = {
	harnessType: "builtin",
	modelId: "claude-sonnet-4-6",
	modelProvider: "anthropic",
	maxConcurrentSessions: 1,
} as const;

async function seedUsers(db: HyperIdleDb): Promise<void> {
	const now = "2026-01-01T00:00:00.000Z";
	for (const id of ["agent-fresh", "agent-upgrade"]) {
		await db
			.insert(users)
			.values({ id, kind: "ai", name: id, role: "assistant", status: "active", createdAt: now })
			.onConflictDoNothing();
	}
}

async function makeDb(tag: string): Promise<{ db: HyperIdleDb; close: () => Promise<void> }> {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), `au29-probe-${tag}-`));
	await applyMigrations(dir, path.resolve("framework/db/drizzle"));
	const handle = await createPgliteDb(dir);
	return { db: handle.db, close: () => handle.close() };
}

async function dump(db: HyperIdleDb): Promise<unknown> {
	const rows = await db.select().from(agentRunConfig);
	return rows.sort((a, b) => a.agentUserId.localeCompare(b.agentUserId));
}

async function main(): Promise<void> {
	const a = await makeDb("bootstrap");
	const b = await makeDb("service");
	try {
		await seedUsers(a.db);
		await seedUsers(b.db);

		// upgrade-path precondition: an existing, human-configured row (identical in both)
		for (const { db } of [a, b]) {
			await db.insert(agentRunConfig).values({
				agentUserId: "agent-upgrade",
				systemPrompt: "operator-set prompt",
				harnessType: "claude",
				modelTierPreference: "workhorse",
				modelId: "some-model",
				modelProvider: "openrouter",
				maxConcurrentSessions: 3,
			});
		}

		// A — the bootstrap's own semantics
		await upsertRunConfig(a.db, "agent-fresh", AH2); // 1. fresh insert
		await upsertRunConfig(a.db, "agent-fresh", { systemPrompt: "template-content" }); // 2. prompt backfill
		await upsertRunConfig(a.db, "agent-upgrade", AH2); // 3. upgrade patch
		await upsertRunConfig(a.db, "agent-upgrade", { systemPrompt: "template-content" });

		// B — the owning service's writer
		await writeAgentRunConfig(b.db, "agent-fresh", { ...AH2 });
		await writeAgentRunConfig(b.db, "agent-fresh", { systemPrompt: "template-content" });
		await writeAgentRunConfig(b.db, "agent-upgrade", { ...AH2 });
		await writeAgentRunConfig(b.db, "agent-upgrade", { systemPrompt: "template-content" });

		const rowsA = JSON.stringify(await dump(a.db), null, 2);
		const rowsB = JSON.stringify(await dump(b.db), null, 2);
		const pass = rowsA === rowsB;
		process.stdout.write(`A (upsertRunConfig):\n${rowsA}\n\nB (writeAgentRunConfig):\n${rowsB}\n\n`);
		process.stdout.write(pass ? "VERDICT: PASS — row sets identical\n" : "VERDICT: FAIL — row sets differ\n");
		process.exitCode = pass ? 0 : 1;
	} finally {
		await a.close();
		await b.close();
	}
}

main().catch((err) => {
	process.stderr.write(`probe error: ${(err as Error).stack}\n`);
	process.exit(2);
});
