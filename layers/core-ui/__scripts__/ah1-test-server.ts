/**
 * AH1 E2E test server startup script.
 *
 * Boots a real Hono server on AH1_API_PORT (default 3099) with an in-memory
 * PGlite database. Called by playwright.ah1.config.ts as a webServer command
 * so the AH1 Playwright spec can drive real credential HTTP routes.
 *
 * Flow: create in-memory PGlite → run Drizzle migrations → boot Hono server.
 *
 * @lore AH1: The main E2E suite mocks all /api/* routes (no real backend).
 * The AH1 credential proof requires real PUT/GET /api/credentials/* calls.
 * This script is the minimal glue: we pass deps.db to createServer so the
 * server uses our already-migrated in-memory DB instead of opening a file.
 *
 * @lore AH1: npm workspace hoisting means @electric-sql/pglite, @hyperidle/db
 * and @hyperidle/server are all accessible from node_modules at the repo root,
 * even though layers/core-ui/package.json doesn't list them as deps. This is
 * correct for an E2E test helper — it's not web source code.
 *
 * @lore AH1: Port 3099 is the AH1 E2E API port. Non-default (not 3001) to
 * avoid collision with sibling worktree dev servers. Not 5179/5180 (those are
 * Vite ports). The playwright.ah1.config.ts and vite.ah1.config.ts agree on 3099.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { HyperIdleDb } from "@hyperidle/db";
import { schema } from "@hyperidle/db";
import { createLocalAdapterPool, createSandboxAdapter } from "@hyperidle/harness-registry";
import { createServer } from "@hyperidle/remote-server/create-server";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const scriptDir = dirname(fileURLToPath(import.meta.url));

const AH1_API_PORT = Number(process.env.AH1_API_PORT ?? "3099");

// Set env before createServer reads it.
// AH1_API_KEY must match VITE_HYPERIDLE_API_KEY in playwright.ah1.config.ts webServer env.
process.env.HYPERIDLE_API_KEY = process.env.HYPERIDLE_API_KEY ?? "ah1-e2e-test-key";
process.env.HYPERIDLE_CREDENTIAL_KEY =
	process.env.HYPERIDLE_CREDENTIAL_KEY ?? "ah1-e2e-cred-key-32-chars!!!!!";
// laptop profile: allows LocalSandboxAdapter in test (no real agent runs in E2E).
process.env.HYPERIDLE_PROFILE = "laptop";

// Migrations folder: layers/core-ui/__scripts__/ → up three dirs → repo root → framework/db/drizzle.
const migrationsFolder = resolve(scriptDir, "../../../framework/db/drizzle");

// 1. Create in-memory PGlite and apply Drizzle schema migrations.
const client = new PGlite();
await client.waitReady;
const rawDb = drizzle(client, { schema });
await migrate(rawDb, { migrationsFolder });
// Cast to HyperIdleDb (same underlying type — PgliteDatabase satisfies HyperIdleDb).
const db = rawDb as unknown as HyperIdleDb;

// 2. Boot the Hono server with the already-migrated in-memory DB.
//    Passing deps.db skips createServer's own DB construction (file-path branch).
//    AU19 Increment 5 (item 2): adapterPool/workspaceAdapter are now REQUIRED —
//    this test-server bootstrap is Application-shaped (mirrors applications/desktop's
//    boot-server.ts), injecting its own LocalSandboxAdapter (laptop profile, set above).
const handle = await createServer(AH1_API_PORT, {
	db,
	sandboxBasePath: "/tmp/ah1-e2e-workspaces",
	adapterPool: await createLocalAdapterPool(),
	workspaceAdapter: createSandboxAdapter("local"),
});

// 3. Signal readiness — playwright.ah1.config.ts waits for this line.
process.stdout.write(`[ah1-test-server] ready on http://localhost:${AH1_API_PORT}\n`);

// Graceful shutdown.
let shutdownPromise: Promise<void> | null = null;
function shutdown(): Promise<void> {
	shutdownPromise ??= (async () => {
		let exitCode = 0;
		try {
			await handle.dispose();
		} catch (error) {
			process.stderr.write(`[ah1-test-server] shutdown failed: ${String(error)}\n`);
			exitCode = 1;
		}
		try {
			await client.close();
		} catch (error) {
			process.stderr.write(`[ah1-test-server] database close failed: ${String(error)}\n`);
			exitCode = 1;
		}
		process.exit(exitCode);
	})();
	return shutdownPromise;
}
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
