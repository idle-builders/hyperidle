/**
 * AH6 E2E test server startup script.
 *
 * Boots a real Hono server on AH6_API_PORT (default 3098) with:
 *   - In-memory PGlite database (migrated)
 *   - NO OpenRouter key required — LLM calls are intercepted by the
 *     cassette replay layer (LLM_CASSETTE_MODE=replay in playwright.ah6.config.ts)
 *   - A fake ANTHROPIC_API_KEY set in env so runAssistantTurn's else-branch
 *     (no credentialResolver) builds a valid resolvedModel without throwing
 *     MissingCredentialError
 *   - assistantTurnDeps wired into createApp so POST /api/threads/:id/messages
 *     triggers runAssistantTurn (R-1 requirement)
 *
 * @lore AH6: This server intentionally has NO credentialResolver — it uses the
 * env-based anthropic key path (else-branch in runAssistantTurn). The fake key
 * value "ah6-e2e-fake-anthropic-key" never reaches the network because
 * LLM_CASSETTE_MODE=replay intercepts at callLlm before any HTTP call is made.
 *
 * @lore AH6: Port layout:
 *   3098 — AH6 API test server
 *   5183 — AH6 Vite dev server
 *   (AH5: 3097/5182, AH1: 3099/5180, dev: 3001/5179 — untouched)
 *
 * @lore AH6 B3: assistantTurnDeps is built here and passed to createServer.
 * Without it, POST /api/threads/:id/messages is a no-op (no LLM turn fires).
 * The deps are identical to production minus credentialResolver — the cassette
 * interceptor provides the "LLM response" instead.
 *
 * @lore AH6: npm workspace hoisting means @hyperidle/server, @hyperidle/db are
 * accessible from node_modules even though packages/web doesn't list them as deps.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { HyperIdleDb } from "@hyperidle/db";
import { schema, teamMembers, teams, users } from "@hyperidle/db";
import { createServer } from "@hyperidle/server/server-factory";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const scriptDir = dirname(fileURLToPath(import.meta.url));

const AH6_API_PORT = Number(process.env.AH6_API_PORT ?? "3098");

// Set env before createServer reads it.
process.env.HYPERIDLE_API_KEY = process.env.HYPERIDLE_API_KEY ?? "ah6-e2e-test-key";
process.env.HYPERIDLE_CREDENTIAL_KEY =
	process.env.HYPERIDLE_CREDENTIAL_KEY ?? "ah6-e2e-cred-key-32-chars!!!!!";
process.env.HYPERIDLE_PROFILE = "laptop";

// Set a fake Anthropic key so runAssistantTurn's env-based fallback path
// can build a resolvedModel without throwing MissingCredentialError.
// @lore AH6: This key never reaches the network — LLM_CASSETTE_MODE=replay
// intercepts at callLlm before any HTTP call is made.
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "ah6-e2e-fake-anthropic-key";

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
// 2. Seed the minimal DB state required for S2 (create_bet tool to succeed).
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
// 3. Boot the Hono server with assistantTurnDeps wired (R-1).
//    No credentialResolver — cassette replay interceptor handles LLM calls.
// ---------------------------------------------------------------------------
// @lore AH6 B3: assistantTurnDeps must be wired so POST /api/threads/:id/messages
// actually triggers runAssistantTurn. The createServer factory builds these deps
// internally when assistantTurnDeps is omitted, but we need to confirm the wiring
// is correct by passing them explicitly (per R-1 architecture requirement).
const handle = await createServer(AH6_API_PORT, {
	db,
	sandboxBasePath: "/tmp/ah6-e2e-workspaces",
	// No credentialResolver: uses env-based ANTHROPIC_API_KEY (else-branch)
	// LLM_CASSETTE_MODE=replay intercepts before any real HTTP call
});

// 3. Signal readiness — playwright.ah6.config.ts waits for this line.
process.stdout.write(`[ah6-test-server] ready on http://localhost:${AH6_API_PORT}\n`);

// Graceful shutdown.
function shutdown(): void {
	handle.dispose();
	void client.close();
	process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
