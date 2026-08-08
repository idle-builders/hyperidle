/**
 * AU29 — first-boot state capture (AC 7 evidence harness).
 *
 * Creates a clean PGlite database (or reads an existing data dir), and dumps the four tables the
 * factory bootstrap writes — `users`, `knowledge_items`, `knowledge_app_projection`,
 * `agent_run_config` — ordered by primary key, with runtime timestamps normalised to "<ts>"
 * (they are `new Date().toISOString()` and can never be byte-stable across runs; every other
 * column must be byte-identical).
 *
 * Modes:
 *   --bootstrap            clean db + migrations + the current bootstrap path, then dump.
 *                          The control (`first-boot-control.json`) was captured at architecture
 *                          time via `applyFactoryBootstrap` (origin/main). This mode now runs the
 *                          AU29 branch's two layer faces (`applyFactoryCoreState` +
 *                          `applyFactoryRunConfigDefaults`) — the same statements
 *                          applications/desktop/src/main.ts executes.
 *   --data-dir <path>      dump an existing PGlite data dir (e.g. one produced by
 *                          `npm run setup -- --db-path <path>` — the CLI path).
 *   --out <file>           write the dump JSON to a file (default: stdout).
 *
 * Control run (captured at architecture time, branch code-identical to origin/main):
 *   npx tsx .pipeline/work/AU29/probes/first-boot-capture.ts --bootstrap \
 *     --out .pipeline/work/AU29/probes/first-boot-control.json
 * Branch verification (task F): re-run --bootstrap (faces) and --data-dir (CLI-produced dir);
 * both dumps must diff empty against first-boot-control.json.
 *
 * Run from the repo root (the template reader resolves docs/ from cwd).
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { applyMigrations, createPgliteDb, type HyperIdleDb } from "@hyperidle/db";
import { agentRunConfig, knowledgeAppProjection, knowledgeItems, users } from "@hyperidle/db";

const TS_COLUMNS = new Set(["createdAt", "updatedAt"]);

function normalise(rows: Record<string, unknown>[]): Record<string, unknown>[] {
	return rows.map((row) => {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(row)) out[k] = TS_COLUMNS.has(k) && v != null ? "<ts>" : v;
		return out;
	});
}

async function dump(db: HyperIdleDb): Promise<Record<string, unknown>> {
	const byId = <T extends { id?: string; agentUserId?: string }>(rows: T[]): T[] =>
		[...rows].sort((a, b) => String(a.id ?? a.agentUserId).localeCompare(String(b.id ?? b.agentUserId)));
	return {
		users: normalise(byId(await db.select().from(users))),
		knowledgeItems: normalise(byId(await db.select().from(knowledgeItems))),
		knowledgeAppProjection: normalise(byId(await db.select().from(knowledgeAppProjection))),
		agentRunConfig: normalise(byId(await db.select().from(agentRunConfig))),
	};
}

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const arg = (name: string): string | undefined => {
		const i = argv.indexOf(name);
		return i >= 0 ? argv[i + 1] : undefined;
	};

	let dataDir = arg("--data-dir");
	if (argv.includes("--bootstrap")) {
		dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "au29-first-boot-"));
		await applyMigrations(dataDir, path.resolve("framework/db/drizzle"));
		const handle = await createPgliteDb(dataDir);
		try {
			// AU29 branch: the two layer faces, in order — the same statements
			// applications/desktop/src/main.ts executes. Control (origin/main) ran
			// applyFactoryBootstrap; that path no longer exists on this branch.
			const { applyFactoryCoreState } = await import("@hyperidle/core-api");
			const { applyFactoryRunConfigDefaults } = await import("@hyperidle/agent-orchestration");
			const agents = await applyFactoryCoreState(handle.db);
			await applyFactoryRunConfigDefaults(handle.db, agents);
		} finally {
			await handle.close();
		}
	}
	if (!dataDir) {
		process.stderr.write("usage: first-boot-capture.ts (--bootstrap | --data-dir <path>) [--out <file>]\n");
		process.exit(2);
	}

	const handle = await createPgliteDb(dataDir);
	try {
		const result = JSON.stringify(await dump(handle.db), null, 2);
		const out = arg("--out");
		if (out) fs.writeFileSync(out, `${result}\n`);
		else process.stdout.write(`${result}\n`);
	} finally {
		await handle.close();
	}
}

main().catch((err) => {
	process.stderr.write(`capture error: ${(err as Error).stack}\n`);
	process.exit(2);
});
