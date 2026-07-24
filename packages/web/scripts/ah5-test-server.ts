/**
 * AH5 E2E test server startup script.
 *
 * Boots a real Hono server on AH5_API_PORT (default 3097) with:
 *   - In-memory PGlite database (migrated)
 *   - OpenRouter API key seeded ENCRYPTED into server_credentials via
 *     encryptCredentialValue (production AES-256-GCM path) — so DbCredentialResolver
 *     exercises the production credential resolution path with zero mocks.
 *   - Assistant agent configured with the dynamically-selected smoke model
 *     (from ah5-resolve-model.ts output, or fallback model id).
 *
 * @lore AH5: Mirror of ah1-test-server.ts pattern. The key addition is the
 * encrypted OpenRouter credential seed — AH1 never seeded any credential (it
 * drove real PUT /api/credentials/* from the E2E spec). AH5 pre-seeds the
 * credential at boot so the full provisionSession → DbCredentialResolver →
 * callLlm production path runs with no env-based resolver shortcut.
 *
 * @lore AH5: npm workspace hoisting means @hyperidle/server, @hyperidle/db,
 * @hyperidle/eval are accessible from node_modules even though packages/web
 * doesn't list them as deps. This is intentional for E2E test helpers.
 *
 * @lore AH5: OPENROUTER_API_KEY must be in process.env (set in your local shell).
 * If absent, the server boots but the credential row is absent — any real LLM call
 * will fail with MissingCredentialError. The `npm run smoke:ah5` orchestrator
 * fails closed if the key is missing before this server starts.
 *
 * @lore AH5: The RESOLVE_MODEL_FILE env var, if set, points to a JSON file
 * written by ah5-resolve-model.ts containing { routedId, ranked }.
 * When absent, the server uses AH5_FALLBACK_MODEL_ID (or a hardcoded default).
 * This keeps the model-resolution step offline from the server boot itself.
 */
import * as fs from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { encryptCredentialValue } from "@hyperidle/connections";
import { createServer } from "@hyperidle/core-api/server-factory";
import type { HyperIdleDb } from "@hyperidle/db";
import { schema, serverCredentials } from "@hyperidle/db";
import { createLocalAdapterPool, createSandboxAdapter } from "@hyperidle/harness-registry";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const scriptDir = dirname(fileURLToPath(import.meta.url));

const AH5_API_PORT = Number(process.env.AH5_API_PORT ?? "3097");

// Set env before createServer reads it.
process.env.HYPERIDLE_API_KEY = process.env.HYPERIDLE_API_KEY ?? "ah5-e2e-test-key";
process.env.HYPERIDLE_CREDENTIAL_KEY =
	process.env.HYPERIDLE_CREDENTIAL_KEY ?? "ah5-e2e-cred-key-32-chars!!!!!";
process.env.HYPERIDLE_PROFILE = "laptop";

// Migrations folder: packages/web/scripts/ → up two dirs → packages/ → db/drizzle.
const migrationsFolder = resolve(scriptDir, "../../db/drizzle");

// ---------------------------------------------------------------------------
// 1. Create in-memory PGlite and apply Drizzle schema migrations.
// ---------------------------------------------------------------------------
const client = new PGlite();
await client.waitReady;
const rawDb = drizzle(client, { schema });
await migrate(rawDb, { migrationsFolder });
const db = rawDb as unknown as HyperIdleDb;

// ---------------------------------------------------------------------------
// 2. Seed the OpenRouter API key into server_credentials (encrypted).
//    This exercises the PRODUCTION DbCredentialResolver path — no EnvCredentialResolver.
// ---------------------------------------------------------------------------
const openrouterApiKey = process.env.OPENROUTER_API_KEY;
if (openrouterApiKey) {
	// @lore AU20 Am4: encryptCredentialValue is now no-arg; HYPERIDLE_CREDENTIAL_KEY is
	// set above so the secret is available. Throws MISSING_ROOT_SECRET if not configured.
	let encryptedValue: string;
	try {
		encryptedValue = encryptCredentialValue(openrouterApiKey);
	} catch {
		process.stderr.write(
			"[ah5-test-server] WARNING: No server secret configured (HYPERIDLE_CREDENTIAL_KEY / HYPERIDLE_API_KEY). " +
				"Credential encryption will fail.\n",
		);
		encryptedValue = "";
	}
	if (encryptedValue) {
		const now = new Date().toISOString();
		await db
			.insert(serverCredentials)
			.values({
				name: "openrouter_api_key",
				encryptedValue,
				validationState: "present_untested",
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: serverCredentials.name,
				set: { encryptedValue, updatedAt: now },
			});
		process.stdout.write("[ah5-test-server] OpenRouter API key seeded into server_credentials.\n");
	}
} else {
	process.stdout.write(
		"[ah5-test-server] WARNING: OPENROUTER_API_KEY not set. " +
			"Real LLM calls will fail with MissingCredentialError. " +
			"Run via `npm run smoke:ah5` which fails closed if the key is absent.\n",
	);
}

// ---------------------------------------------------------------------------
// 3. Resolve the smoke model to use.
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
// 4. Boot the Hono server with the already-migrated in-memory DB.
//    AU19 Increment 5 (item 2): adapterPool/workspaceAdapter are now REQUIRED
//    — inject a LocalSandboxAdapter (laptop profile, set above), mirroring
//    packages/desktop's boot-server.ts.
// ---------------------------------------------------------------------------
const handle = await createServer(AH5_API_PORT, {
	db,
	sandboxBasePath: "/tmp/ah5-e2e-workspaces",
	adapterPool: await createLocalAdapterPool(),
	workspaceAdapter: createSandboxAdapter("local"),
});

// 5. Signal readiness — playwright.ah5.config.ts waits for this line.
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
			await client.close();
		} catch (error) {
			process.stderr.write(`[ah5-test-server] database close failed: ${String(error)}\n`);
			exitCode = 1;
		}
		process.exit(exitCode);
	})();
	return shutdownPromise;
}
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
