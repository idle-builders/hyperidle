/**
 * AH6 E2E test server startup script.
 *
 * Boots a real Hono server on AH6_API_PORT (default 3098) with:
 *   - In-memory PGlite database (migrated)
 *   - Cassette-intercepted LLM calls (LLM_CASSETTE_MODE from env)
 *   - In REPLAY mode (everyday lane): fake ANTHROPIC_API_KEY, no real network call.
 *   - In RECORD mode (smoke:ah6): OpenRouter API key encrypted into server_credentials
 *     (same production DbCredentialResolver path as AH5), assistant agent seeded with
 *     modelProvider:"openrouter" + resolved modelId (from RESOLVE_MODEL_FILE), so the
 *     per-agent branch of resolveAgentModel is exercised (R-5 / AC4-live).
 *   - assistantTurnDeps wired into createApp so POST /api/threads/:id/messages
 *     triggers runAssistantTurn (R-1 requirement).
 *
 * CONSOLIDATION (CRITICAL-3 / WARNING-3): This server extends the AH5 pattern
 * (encrypted credential seed + model file read) rather than duplicating a parallel
 * harness. AH5-test-server.ts remains for AH5 specs; this server is AH6's lane server
 * with the cassette mode passthrough added on top.
 *
 * @lore AH6 CRITICAL-3: The key difference from the pre-fix version: in record mode
 * this server seeds the OpenRouter API key (encrypted, production path) AND seeds
 * the assistant agent with modelProvider:"openrouter" + resolved modelId. Without
 * this, runAssistantTurn falls back to the env-based Anthropic path (L264-266 lazy
 * create) and the per-agent OpenRouter seam (AC4) is never exercised.
 *
 * @lore AH6: In replay mode LLM_CASSETTE_MODE=replay intercepts at callLlm before
 * any network call. The fake ANTHROPIC_API_KEY is set so the env-based fallback
 * path in runAssistantTurn can build a resolvedModel without throwing
 * MissingCredentialError (credentialResolver is present but no real key is needed
 * because the cassette intercepts first).
 *
 * @lore AH6: Port layout:
 *   3098 — AH6 API test server
 *   5183 — AH6 Vite dev server
 *   (AH5: 3097/5182, AH1: 3099/5180, dev: 3001/5179 — untouched)
 *
 * @lore AH6: npm workspace hoisting means @hyperidle/server, @hyperidle/db are
 * accessible from node_modules even though packages/web doesn't list them as deps.
 */
import * as fs from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { encryptCredentialValue, getServerSecret } from "@hyperidle/connections";
import type { HyperIdleDb } from "@hyperidle/db";
import { schema, serverCredentials, teamMembers, teams, users } from "@hyperidle/db";
import { createServer } from "@hyperidle/server/server-factory";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const scriptDir = dirname(fileURLToPath(import.meta.url));

const AH6_API_PORT = Number(process.env.AH6_API_PORT ?? "3098");
const cassettMode = process.env.LLM_CASSETTE_MODE ?? "replay";

// Set env before createServer reads it.
process.env.HYPERIDLE_API_KEY = process.env.HYPERIDLE_API_KEY ?? "ah6-e2e-test-key";
process.env.HYPERIDLE_CREDENTIAL_KEY =
	process.env.HYPERIDLE_CREDENTIAL_KEY ?? "ah6-e2e-cred-key-32-chars!!!!!";
process.env.HYPERIDLE_PROFILE = "laptop";

// In replay mode, set a fake Anthropic key so runAssistantTurn's env-based fallback
// path can build a resolvedModel without throwing MissingCredentialError.
// The key never reaches the network — LLM_CASSETTE_MODE=replay intercepts at callLlm.
// In record mode, the real OpenRouter key is seeded into server_credentials below.
// @lore AH6: This key is only needed because migrateCredentialsToStore() in server-factory
// seeds ANTHROPIC_API_KEY from env if absent from the DB. Without it, the credential
// migration step throws in replay mode.
if (cassettMode !== "record") {
	process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "ah6-e2e-fake-anthropic-key";
}

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
// 2. Seed team + user required for create_bet tool (S2 scenario).
//    resolveDraftTeamId requires: user row with teamId → team_members row → teams row.
//    The auth middleware (local mode) returns the first human user's id or "u-founder"
//    — so we seed id="u-founder" to guarantee a stable, predictable userId.
// ---------------------------------------------------------------------------
const now = new Date().toISOString();
const AH6_TEAM_ID = "ah6-e2e-team";
const AH6_TEAM_MEMBERS_ID = "ah6-e2e-team-members";
const AH6_USER_ID = "u-founder"; // must match auth middleware fallback

// Seed team
await db
	.insert(teams)
	.values({
		id: AH6_TEAM_ID,
		name: "AH6 Test Team",
		phase: "build",
		createdAt: now,
	})
	.onConflictDoNothing();

// Seed team_members (the agent membership group)
await db
	.insert(teamMembers)
	.values({
		id: AH6_TEAM_MEMBERS_ID,
		teamId: AH6_TEAM_ID,
		capacity: 1,
		formedAt: now,
	})
	.onConflictDoNothing();

// Seed human founder user with teamId → team_members.id
// @lore AH6: users.teamId references team_members.id (U1 schema lore).
// resolveDraftTeamId does: users.teamId → teamMembers.id → teamMembers.teamId
// which returns AH6_TEAM_ID (the teams.id that create_bet requires).
await db
	.insert(users)
	.values({
		id: AH6_USER_ID,
		kind: "human",
		name: "AH6 Test Founder",
		role: "founder",
		status: "active",
		teamId: AH6_TEAM_MEMBERS_ID, // → team_members.id (two-hop team resolution)
		maxConcurrentSessions: 1,
		createdAt: now,
	})
	.onConflictDoNothing();

process.stdout.write(
	`[ah6-test-server] Seeded: team=${AH6_TEAM_ID}, teamMembers=${AH6_TEAM_MEMBERS_ID}, user=${AH6_USER_ID}\n`,
);

// ---------------------------------------------------------------------------
// 3. RECORD MODE: Seed OpenRouter API key (encrypted) + assistant agent.
//    Exercises the PRODUCTION DbCredentialResolver path so resolveAgentModel
//    takes the per-agent OpenRouter branch (R-5 / CRITICAL-3).
// ---------------------------------------------------------------------------

// Resolve the smoke model id — read from RESOLVE_MODEL_FILE if set.
// Default fallback: google/gemini-2.5-flash-preview-05-20:nitro (same as AH5).
let smokeModelId =
	process.env.AH6_FALLBACK_MODEL_ID ?? "google/gemini-2.5-flash-preview-05-20:nitro";
const resolveModelFile = process.env.RESOLVE_MODEL_FILE;
if (resolveModelFile && fs.existsSync(resolveModelFile)) {
	try {
		const raw = fs.readFileSync(resolveModelFile, "utf-8");
		const parsed = JSON.parse(raw) as { routedId?: string };
		if (parsed.routedId) {
			smokeModelId = parsed.routedId;
			process.stdout.write(`[ah6-test-server] Using resolved smoke model: ${smokeModelId}\n`);
		}
	} catch {
		process.stdout.write(
			`[ah6-test-server] WARNING: Could not parse RESOLVE_MODEL_FILE ${resolveModelFile}, using fallback.\n`,
		);
	}
} else {
	process.stdout.write(`[ah6-test-server] Using default smoke model: ${smokeModelId}\n`);
}

if (cassettMode === "record") {
	// Seed OpenRouter API key encrypted into server_credentials.
	// @lore AH6 CRITICAL-3: This is the production DbCredentialResolver path — same as
	// AH5. Without this, createServer builds a DbCredentialResolver but the credential
	// slot is empty → resolveAgentModel throws MissingCredentialError and falls back to
	// env-based Anthropic path, never exercising the per-agent OpenRouter seam (R-5).
	const openrouterApiKey = process.env.OPENROUTER_API_KEY;
	if (openrouterApiKey) {
		const serverSecret = getServerSecret();
		if (!serverSecret) {
			process.stderr.write(
				"[ah6-test-server] WARNING: No server secret configured. Credential encryption will fail.\n",
			);
		} else {
			const encryptedValue = encryptCredentialValue(openrouterApiKey, serverSecret);
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
			process.stdout.write(
				"[ah6-test-server] OpenRouter API key seeded into server_credentials.\n",
			);
		}
	} else {
		process.stderr.write(
			"[ah6-test-server] WARNING: OPENROUTER_API_KEY not set in record mode. " +
				"Real LLM calls will fail with MissingCredentialError.\n",
		);
	}

	// Seed the assistant agent with modelProvider:"openrouter" + resolved modelId.
	// @lore AH6 CRITICAL-3: The assistant agent is lazy-created by runAssistantTurn
	// with modelId:"claude-sonnet-4-6" + modelProvider:"anthropic" if absent. We pre-seed
	// it here with OpenRouter so resolveAgentModel takes the per-agent branch (gateway
	// L194) rather than the tier fallback. The agent id is ast-${userId} per assistant-turn.ts.
	const assistantAgentId = `ast-${AH6_USER_ID}`;
	await db
		.insert(users)
		.values({
			id: assistantAgentId,
			kind: "ai",
			name: "AH6 Assistant",
			role: "assistant",
			agentCategory: "individual",
			status: "active",
			harnessType: "builtin",
			modelId: smokeModelId,
			modelProvider: "openrouter",
			systemPrompt:
				"You are a helpful AI assistant. Be concise, direct, and thoughtful in your responses.",
			maxConcurrentSessions: 1,
			createdAt: now,
		})
		.onConflictDoUpdate({
			target: users.id,
			// users table has no updatedAt — only update the model fields
			set: { modelId: smokeModelId, modelProvider: "openrouter" },
		});
	process.stdout.write(
		`[ah6-test-server] Assistant agent seeded: id=${assistantAgentId}, model=${smokeModelId}, provider=openrouter\n`,
	);
}

// ---------------------------------------------------------------------------
// 4. Boot the Hono server.
//    createServer already wires assistantTurnDeps from adapterPool + credentialResolver
//    (AH6 B3 fix in server-factory.ts L301-315). No credentialResolver override needed.
// ---------------------------------------------------------------------------
const handle = await createServer(AH6_API_PORT, {
	db,
	sandboxBasePath: "/tmp/ah6-e2e-workspaces",
	// No assistantTurnDeps override: createServer builds them from adapterPool + credentialResolver.
	// In record mode credentialResolver resolves the seeded openrouter_api_key (production path).
	// In replay mode the cassette intercepts before any real network call.
});

// 5. Signal readiness — playwright.ah6.config.ts waits for this line.
process.stdout.write(`[ah6-test-server] ready on http://localhost:${AH6_API_PORT}\n`);

// Graceful shutdown.
function shutdown(): void {
	handle.dispose();
	void client.close();
	process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
