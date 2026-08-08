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
 * accessible from node_modules even though layers/core-ui doesn't list them as deps.
 */

import * as fs from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	agentRunConfig,
	applyMigrations,
	createPgliteDb,
	serverCredentials,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { createLocalAdapterPool, createSandboxAdapter } from "@hyperidle/harness-registry";
import { installCassetteInterceptor } from "@hyperidle/harness-registry/testing";
import { createServer } from "@hyperidle/remote-server/create-server";
import { encryptCredentialValue } from "@hyperidle/shared/crypto";

const scriptDir = dirname(fileURLToPath(import.meta.url));

const AH6_API_PORT = Number(process.env.AH6_API_PORT ?? "3098");
const cassettMode = process.env.LLM_CASSETTE_MODE ?? "replay";
process.env.LLM_CASSETTE_MODE = cassettMode;

// @lore AU28: `callLlm` no longer knows what a cassette is. AH6 B1 had production
// `llm-client.ts` dynamically import the cassette module behind an env check — a
// production->development import. The seam is inverted: this lane entry point installs
// the interceptor, and `callLlm` hard-errors if LLM_CASSETTE_MODE is set without one, so
// a missed install fails loudly instead of quietly hitting the network.
installCassetteInterceptor();

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

// Migrations folder: layers/core-ui/__scripts__/ → up three dirs → repo root → framework/db/drizzle.
const migrationsFolder = resolve(scriptDir, "../../../framework/db/drizzle");

// ---------------------------------------------------------------------------
// 1. Apply Drizzle schema migrations against a per-boot tmp dir, then open a
//    live handle on the same dir — composes the database package's own
//    `db:client` exports instead of hand-rolling a drizzle(client, { schema })
//    client (D4).
// ---------------------------------------------------------------------------
const dataDir = await mkdtemp(join(tmpdir(), "ah6-e2e-db-"));
await applyMigrations(dataDir, migrationsFolder);
const { db, close: closeDb } = await createPgliteDb(dataDir);

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

{
	// Seed OpenRouter API key encrypted into server_credentials.
	// @lore AH6 CRITICAL-3: This is the production DbCredentialResolver path — same as
	// AH5. Without this, createServer builds a DbCredentialResolver but the credential
	// slot is empty → resolveAgentModel throws MissingCredentialError and falls back to
	// env-based Anthropic path, never exercising the per-agent OpenRouter seam (R-5).
	//
	// @lore AU28: this used to be record-mode only. Once the assistant agent is pre-seeded
	// with modelProvider:"openrouter" (it is, in both modes — see below), replay mode needs
	// the credential slot filled too or resolveAgentModel throws MissingCredentialError and
	// the UI shows "No API key yet" before callLlm is ever reached. In replay the value is
	// a placeholder that never leaves the process: the cassette interceptor short-circuits
	// callLlm ahead of any network call.
	const openrouterApiKey =
		cassettMode === "record" ? process.env.OPENROUTER_API_KEY : "ah6-replay-placeholder-key";
	if (openrouterApiKey) {
		// @lore AU20 Am4: encryptCredentialValue is now no-arg; HYPERIDLE_CREDENTIAL_KEY
		// is set above so the secret is available. Throws MISSING_ROOT_SECRET if absent.
		let encryptedValue: string;
		try {
			encryptedValue = encryptCredentialValue(openrouterApiKey);
		} catch {
			process.stderr.write(
				"[ah6-test-server] WARNING: No server secret configured. Credential encryption will fail.\n",
			);
			encryptedValue = "";
		}
		if (encryptedValue) {
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
}

// @lore AU28: the assistant-agent pre-seed used to sit INSIDE the
// `if (cassettMode === "record")` block, so in replay mode `ast-${AH6_USER_ID}` never
// existed and the very first message POST failed with "Agent ast-u-founder is not a
// runnable AI agent" — the append path calls requireRunnableAgent before
// runAssistantTurn's lazy creation can happen. Both modes need the agent; only the
// OpenRouter credential is record-only.

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
		createdAt: now,
	})
	.onConflictDoNothing();
// @lore AU26 G1: run-execution config (harnessType/modelId/modelProvider/
// systemPrompt/maxConcurrentSessions) lives in `agent_run_config`, not
// `users`, since that migration — this pre-existing seed still targeted the
// old `users` columns (never caught because __scripts__ sits outside this
// package's tsconfig `include`, so tsc never typechecked it). Mirrors the
// `agentRunConfig` seed idiom in AH6-lane-gates-broken-turn.integration.test.ts.
await db
	.insert(agentRunConfig)
	.values({
		agentUserId: assistantAgentId,
		harnessType: "builtin",
		modelId: smokeModelId,
		modelProvider: "openrouter",
		systemPrompt:
			"You are a helpful AI assistant. Be concise, direct, and thoughtful in your responses.",
		maxConcurrentSessions: 1,
	})
	.onConflictDoUpdate({
		target: agentRunConfig.agentUserId,
		set: { modelId: smokeModelId, modelProvider: "openrouter" },
	});
process.stdout.write(
	`[ah6-test-server] Assistant agent seeded: id=${assistantAgentId}, model=${smokeModelId}, provider=openrouter\n`,
);

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
	// AU19 Increment 5 (item 2): adapterPool/workspaceAdapter are now REQUIRED —
	// inject a LocalSandboxAdapter (laptop profile, set above).
	adapterPool: await createLocalAdapterPool(),
	workspaceAdapter: createSandboxAdapter("local"),
});

// 5. Signal readiness — playwright.ah6.config.ts waits for this line.
process.stdout.write(`[ah6-test-server] ready on http://localhost:${AH6_API_PORT}\n`);

// Graceful shutdown.
let shutdownPromise: Promise<void> | null = null;
function shutdown(): Promise<void> {
	shutdownPromise ??= (async () => {
		let exitCode = 0;
		try {
			await handle.dispose();
		} catch (error) {
			process.stderr.write(`[ah6-test-server] shutdown failed: ${String(error)}\n`);
			exitCode = 1;
		}
		try {
			await closeDb();
		} catch (error) {
			process.stderr.write(`[ah6-test-server] database close failed: ${String(error)}\n`);
			exitCode = 1;
		}
		process.exit(exitCode);
	})();
	return shutdownPromise;
}
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
