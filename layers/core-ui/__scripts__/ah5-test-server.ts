/**
 * AH5 E2E test server startup script.
 *
 * Boots a real Hono server on AH5_API_PORT (default 3097) with:
 *   - PGlite database migrated into a fresh per-boot tmp dir (AU32 D4 — no
 *     longer the bare in-memory handle this once was)
 *   - Assistant agent configured with the dynamically-selected smoke model
 *     (from ah5-resolve-model.ts output, or fallback model id).
 *
 * @lore AH5, corrected: the OpenRouter key no longer has anywhere server-side
 * to be seeded — `server_credentials` and the resolver that read it are
 * deleted; a harness now authenticates itself. Whatever this lane needs to
 * reach OpenRouter is the smoke harness's own concern, not this script's.
 *
 * @lore AH5: Mirror of ah1-test-server.ts pattern.
 *
 * @lore AH5: npm workspace hoisting means @hyperidle/server, @hyperidle/db,
 * @hyperidle/eval are accessible from node_modules even though layers/core-ui
 * doesn't list them as deps. This is intentional for E2E test helpers.
 *
 * @lore AH5: The RESOLVE_MODEL_FILE env var, if set, points to a JSON file
 * written by ah5-resolve-model.ts containing { routedId, ranked }.
 * When absent, the server uses AH5_FALLBACK_MODEL_ID (or a hardcoded default).
 * This keeps the model-resolution step offline from the server boot itself.
 */

import * as fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyMigrations, createPgliteDb } from "@hyperidle/db";
import { createServer } from "@hyperidle/remote-server/create-server";

const scriptDir = dirname(fileURLToPath(import.meta.url));

const AH5_API_PORT = Number(process.env.AH5_API_PORT ?? "3097");

// Set env before createServer reads it.
process.env.HYPERIDLE_API_KEY = process.env.HYPERIDLE_API_KEY ?? "ah5-e2e-test-key";
process.env.HYPERIDLE_CREDENTIAL_KEY =
	process.env.HYPERIDLE_CREDENTIAL_KEY ?? "ah5-e2e-cred-key-32-chars!!!!!";
process.env.HYPERIDLE_PROFILE = "laptop";

// Migrations folder: layers/core-ui/__scripts__/ → up three dirs → repo root → framework/db/drizzle.
const migrationsFolder = resolve(scriptDir, "../../../framework/db/drizzle");

// ---------------------------------------------------------------------------
// 1. Apply Drizzle schema migrations against a per-boot tmp dir, then open a
//    live handle on the same dir — composes the database package's own
//    `db:client` exports instead of hand-rolling a drizzle(client, { schema })
//    client (D4).
// ---------------------------------------------------------------------------
const dataDir = await mkdtemp(join(tmpdir(), "ah5-e2e-db-"));
await applyMigrations(dataDir, migrationsFolder);
const { db, close: closeDb } = await createPgliteDb(dataDir);

// ---------------------------------------------------------------------------
// 2. Resolve the smoke model to use.
//    Reads RESOLVE_MODEL_FILE if set (written by ah5-resolve-model.ts),
//    otherwise falls back to AH5_FALLBACK_MODEL_ID or a static default.
// ---------------------------------------------------------------------------
let smokeModelId =
	process.env.AH5_FALLBACK_MODEL_ID ?? "google/gemini-2.5-flash-preview-05-20:nitro";

const resolveModelFile = process.env.RESOLVE_MODEL_FILE;
if (resolveModelFile && fs.existsSync(resolveModelFile)) {
	try {
		const raw = fs.readFileSync(resolveModelFile, "utf-8");
		const parsed = JSON.parse(raw) as { routedId?: string };
		if (parsed.routedId) {
			smokeModelId = parsed.routedId;
			process.stdout.write(`[ah5-test-server] Using resolved smoke model: ${smokeModelId}\n`);
		}
	} catch {
		process.stdout.write(
			`[ah5-test-server] WARNING: Could not parse RESOLVE_MODEL_FILE ${resolveModelFile}, using fallback.\n`,
		);
	}
} else {
	process.stdout.write(`[ah5-test-server] Using default smoke model: ${smokeModelId}\n`);
}

// ---------------------------------------------------------------------------
// 3. Boot the Hono server with the already-migrated tmp-dir DB.
//    AU31 §6: `topology: "local"` replaces the concrete `AdapterPool`/
//    `SandboxAdapter` this script used to construct itself (laptop profile,
//    set above, still governs the in-process CLI discovery).
// ---------------------------------------------------------------------------
const handle = await createServer(AH5_API_PORT, {
	db,
	sandboxBasePath: "/tmp/ah5-e2e-workspaces",
	topology: "local",
});

// 4. Signal readiness — playwright.ah5.config.ts waits for this line.
process.stdout.write(`[ah5-test-server] ready on http://localhost:${AH5_API_PORT}\n`);

// Graceful shutdown.
let shutdownPromise: Promise<void> | null = null;
function shutdown(): Promise<void> {
	shutdownPromise ??= (async () => {
		let exitCode = 0;
		try {
			await handle.dispose();
		} catch (error) {
			process.stderr.write(`[ah5-test-server] shutdown failed: ${String(error)}\n`);
			exitCode = 1;
		}
		try {
			await closeDb();
		} catch (error) {
			process.stderr.write(`[ah5-test-server] database close failed: ${String(error)}\n`);
			exitCode = 1;
		}
		// @lore AU32: D4's tmp-dir composition leaves a per-boot mkdtemp directory on disk
		// where the old in-memory `new PGlite()` left nothing — remove it on shutdown.
		try {
			await rm(dataDir, { recursive: true, force: true });
		} catch (error) {
			process.stderr.write(`[ah5-test-server] tmp data dir cleanup failed: ${String(error)}\n`);
		}
		process.exit(exitCode);
	})();
	return shutdownPromise;
}
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
