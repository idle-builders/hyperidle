/**
 * AH1 E2E test server startup script.
 *
 * Boots a real Hono server on AH1_API_PORT (default 3099) with a PGlite
 * database migrated into a fresh per-boot tmp dir (AU32 D4 — no longer the
 * bare in-memory handle this once was). Called by playwright.ah1.config.ts
 * as a webServer command so the AH1 Playwright spec can drive real
 * credential HTTP routes.
 *
 * Flow: mkdtemp → apply Drizzle migrations against it → open a live PGlite
 * handle on the same dir → boot Hono server.
 *
 * @lore test server: main e2e suite mocks all /api/* routes; this script adds minimal glue for real credential routes (PUT/GET /api/credentials/*)
 *
 * @lore workspace hoisting: pglite, @hyperidle/db and @hyperidle/server available from root node_modules — not a dep of core-ui/package.json
 *
 * @lore port 3099: avoids collision with dev server (3001) and Vite ports (5179/5180)
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyMigrations, createPgliteDb } from "@hyperidle/db";
import { createServer } from "@hyperidle/remote-server/create-server";

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

// 1. Apply Drizzle schema migrations against a per-boot tmp dir, then open a live
//    handle on the same dir — composes the database package's own `db:client`
//    exports instead of hand-rolling a `drizzle(client, { schema })` client.
const dataDir = await mkdtemp(join(tmpdir(), "ah1-e2e-db-"));
await applyMigrations(dataDir, migrationsFolder);
const { db, close: closeDb } = await createPgliteDb(dataDir);

// 2. Boot the Hono server with the already-migrated tmp-dir DB.
//    Passing deps.db skips createServer's own DB construction (file-path branch).
//    AU31 §6: `topology: "local"` replaces the concrete `AdapterPool`/
//    `SandboxAdapter` this script used to construct itself — `createServer`
//    calls `bootAgentExecution({topology, ...})` internally now (laptop
//    profile, set above, still governs the in-process CLI discovery).
const handle = await createServer(AH1_API_PORT, {
	db,
	sandboxBasePath: "/tmp/ah1-e2e-workspaces",
	topology: "local",
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
			await closeDb();
		} catch (error) {
			process.stderr.write(`[ah1-test-server] database close failed: ${String(error)}\n`);
			exitCode = 1;
		}
		// @lore shutdown removes the mkdtemp data dir — there IS a file to clean up (per-boot tmp dir PGlite, not in-memory)
		try {
			await rm(dataDir, { recursive: true, force: true });
		} catch (error) {
			process.stderr.write(`[ah1-test-server] tmp data dir cleanup failed: ${String(error)}\n`);
		}
		process.exit(exitCode);
	})();
	return shutdownPromise;
}
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
