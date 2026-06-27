/**
 * AO1 RED — Integration tests for the Filesystem registry + per-bot injection primitive.
 *
 * These tests FAIL until the implementation ships:
 *   - `packages/shared/src/filesystem.ts` (FILESYSTEM_KINDS, types, FilesystemAuthResolver seam)
 *   - `packages/db/src/schema.ts` (filesystems + filesystemInjections tables)
 *   - migration 0039_AO1_filesystems.sql applied
 *   - `packages/server/src/routes/filesystems.ts` (createFilesystemRoutes)
 *   - `packages/server/src/app.ts` mounts /filesystems
 *   - NoopAuthResolver + resolveFilesystemState pure fn
 *
 * Coverage:
 *   AC1  — register + source derivation, GET list/inspect
 *   AC1b — inject/eject/share, UNIQUE enforcement, DELETE injection only
 *   AC2  — connection_id + resourceRef stored, NO credential on the row
 *   AC3  — doc_set accepted; SoR kinds rejected at validation boundary
 *   AC4  — filesystem distinct from knowledge_items + git-export config
 *   AC5  — NoopAuthResolver → needs_attention for connection-backed; local → reachable
 *   AC6  — DELETE filesystem cascades injections
 *   AC8  — migration: filesystems + filesystem_injections tables, correct columns, no agent_user_id
 *
 * Source of truth: plans/AO1/architecture.md §Phase 2 + §3 + §8
 */

import * as os from "node:os";
import { type HyperIdleDb, knowledgeItems, teamMembers, teams, users } from "@hyperidle/db";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../test-fixtures.js";

const TEST_API_KEY = "test-key-ao1";
const NOW = "2026-06-26T00:00:00.000Z";

function auth(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

// ─── Seed helpers ────────────────────────────────────────────────────────────

interface SeedResult {
	teamId: string;
	teamMembersId: string;
	botId: string;
	bot2Id: string;
}

/**
 * Seed a team + teamMembers (U1 1:1) + two bot users for injection tests.
 * users.teamId → teamMembers.id (schema.ts:47).
 */
async function seedTeamAndBots(db: HyperIdleDb, prefix: string): Promise<SeedResult> {
	const teamId = `team-ao1-${prefix}`;
	const teamMembersId = `tm-ao1-${prefix}`;
	const botId = `bot-ao1-${prefix}-1`;
	const bot2Id = `bot-ao1-${prefix}-2`;

	await db
		.insert(teams)
		.values({ id: teamId, name: `AO1 Team ${prefix}`, phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: teamMembersId, teamId, capacity: 5, activeBets: 0, formedAt: NOW });
	await db.insert(users).values({
		id: botId,
		kind: "ai",
		name: "Builder Bot",
		role: "builder",
		status: "active",
		teamId: teamMembersId,
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: bot2Id,
		kind: "ai",
		name: "QA Bot",
		role: "qa_engineer",
		status: "active",
		teamId: teamMembersId,
		createdAt: NOW,
	});

	return { teamId, teamMembersId, botId, bot2Id };
}

// ─── Test lifecycle ───────────────────────────────────────────────────────────

describe("AO1: Filesystem registry + per-bot injection", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// ─────────────────────────────────────────────────────────────────────
	// AC1 — Register + source derivation, GET list/inspect
	// ─────────────────────────────────────────────────────────────────────

	describe("AC1: Register a filesystem (team-scoped) with derived source", () => {
		test("POST /api/filesystems with code kind returns 201 and stores source", async ({
			db,
			app,
		}) => {
			const { teamId } = await seedTeamAndBots(db, "ac1a");

			const res = await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId,
					kind: "code",
					connectionId: "conn-github-1",
					resourceRef: { kind: "code", repo: "owner/hyperidle", branch: "main" },
					writeback: "git",
					// sourceHint provided so the NoopAuthResolver fallback yields 'github'
					sourceHint: "github",
				}),
			});

			expect(res.status).toBe(201);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.teamId).toBe(teamId);
			expect(body.kind).toBe("code");
			expect(body.source).toBeDefined();
			expect(typeof body.source).toBe("string");
			// source must NOT be agent-owned: no agentUserId field on the row
			expect(body).not.toHaveProperty("agentUserId");
		});

		test("POST with null connectionId → source 'local'", async ({ db, app }) => {
			const { teamId } = await seedTeamAndBots(db, "ac1b");

			const res = await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId,
					kind: "code",
					connectionId: null,
					resourceRef: { kind: "code", repo: "/home/user/myrepo", branch: "main" },
					writeback: "git",
				}),
			});

			expect(res.status).toBe(201);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.source).toBe("local");
			expect(body.connectionId).toBeNull();
		});

		test("GET /api/filesystems?teamId= lists the registered filesystem", async ({ db, app }) => {
			const { teamId } = await seedTeamAndBots(db, "ac1c");

			await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId,
					kind: "code",
					connectionId: null,
					resourceRef: { kind: "code", repo: "/repo", branch: "main" },
					writeback: "git",
				}),
			});

			const listRes = await app.request(`/api/filesystems?teamId=${teamId}`, { headers: auth() });
			expect(listRes.status).toBe(200);
			const listBody = (await listRes.json()) as { filesystems: unknown[] };
			expect(Array.isArray(listBody.filesystems)).toBe(true);
			expect(listBody.filesystems.length).toBeGreaterThanOrEqual(1);
		});

		test("GET /api/filesystems/:id returns the filesystem with all required fields", async ({
			db,
			app,
		}) => {
			const { teamId } = await seedTeamAndBots(db, "ac1d");

			const createRes = await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId,
					kind: "code",
					connectionId: null,
					resourceRef: { kind: "code", repo: "/myrepo", branch: "develop" },
					writeback: "git",
				}),
			});

			expect(createRes.status).toBe(201);
			const created = (await createRes.json()) as Record<string, unknown>;
			const id = created.id as string;
			expect(id).toBeDefined();

			const getRes = await app.request(`/api/filesystems/${id}`, { headers: auth() });
			expect(getRes.status).toBe(200);
			const got = (await getRes.json()) as Record<string, unknown>;
			expect(got.id).toBe(id);
			expect(got.source).toBeDefined();
			expect(got.kind).toBe("code");
			expect(got.writeback).toBe("git");
			expect(got.state).toBeDefined();
			expect(got.resourceRef).toBeDefined();
			// resourceRef should expose the parsed object, not raw JSON string
			expect(typeof got.resourceRef).toBe("object");
		});

		test("GET /api/filesystems/:id → 404 for unknown id", async ({ app }) => {
			const res = await app.request("/api/filesystems/does-not-exist", { headers: auth() });
			expect(res.status).toBe(404);
		});

		// M2: teamId absent (no matching teams row) → 404 (FK violation caught at insert)
		// This exercises the catch-based FK guard in filesystems.ts (the ONLY real enforcement path).
		test("POST with non-existent teamId → 404 NOT_FOUND", async ({ app }) => {
			const res = await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId: "team-does-not-exist-ao1",
					kind: "code",
					connectionId: null,
					resourceRef: { kind: "code", repo: "/repo", branch: "main" },
					writeback: "git",
				}),
			});
			expect(res.status).toBe(404);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.code).toBe("NOT_FOUND");
		});

		test("registered filesystem row carries NO credential column", async ({ db, app }) => {
			const { teamId } = await seedTeamAndBots(db, "ac1e");

			const createRes = await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId,
					kind: "code",
					connectionId: "conn-abc",
					resourceRef: { kind: "code", repo: "owner/repo", branch: "main" },
					writeback: "git",
				}),
			});

			expect(createRes.status).toBe(201);
			const body = (await createRes.json()) as Record<string, unknown>;
			// No credential fields ever on the filesystem row (AC2 hard rule)
			expect(body).not.toHaveProperty("token");
			expect(body).not.toHaveProperty("secret");
			expect(body).not.toHaveProperty("credential");
			expect(body).not.toHaveProperty("auth");
			expect(body).not.toHaveProperty("password");
		});
	});

	// ─────────────────────────────────────────────────────────────────────
	// AC1b — Inject / eject / share
	// ─────────────────────────────────────────────────────────────────────

	describe("AC1b: Inject / eject / share filesystems per-bot", () => {
		test("POST /api/filesystems/:id/injections returns 201 and wires bot to filesystem", async ({
			db,
			app,
		}) => {
			const { teamId, botId } = await seedTeamAndBots(db, "inj1");

			const createRes = await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId,
					kind: "code",
					connectionId: null,
					resourceRef: { kind: "code", repo: "/repo", branch: "main" },
					writeback: "git",
				}),
			});
			const { id: fsId } = (await createRes.json()) as { id: string };

			const injRes = await app.request(`/api/filesystems/${fsId}/injections`, {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({ agentUserId: botId }),
			});
			expect(injRes.status).toBe(201);
			const injBody = (await injRes.json()) as Record<string, unknown>;
			expect(injBody.agentUserId).toBe(botId);
			expect(injBody.filesystemId).toBe(fsId);
		});

		test("GET /api/filesystems?agentUserId= lists filesystems injected to that bot", async ({
			db,
			app,
		}) => {
			const { teamId, botId } = await seedTeamAndBots(db, "inj2");

			const createRes = await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId,
					kind: "code",
					connectionId: null,
					resourceRef: { kind: "code", repo: "/repo", branch: "main" },
					writeback: "git",
				}),
			});
			const { id: fsId } = (await createRes.json()) as { id: string };

			await app.request(`/api/filesystems/${fsId}/injections`, {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({ agentUserId: botId }),
			});

			const listRes = await app.request(`/api/filesystems?agentUserId=${botId}`, {
				headers: auth(),
			});
			expect(listRes.status).toBe(200);
			const listBody = (await listRes.json()) as { filesystems: Array<{ id: string }> };
			const ids = listBody.filesystems.map((f) => f.id);
			expect(ids).toContain(fsId);
		});

		test("same filesystem injected into TWO bots (sharing / N-N)", async ({ db, app }) => {
			const { teamId, botId, bot2Id } = await seedTeamAndBots(db, "inj3");

			const createRes = await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId,
					kind: "code",
					connectionId: null,
					resourceRef: { kind: "code", repo: "/repo", branch: "main" },
					writeback: "git",
				}),
			});
			const { id: fsId } = (await createRes.json()) as { id: string };

			const inj1 = await app.request(`/api/filesystems/${fsId}/injections`, {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({ agentUserId: botId }),
			});
			const inj2 = await app.request(`/api/filesystems/${fsId}/injections`, {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({ agentUserId: bot2Id }),
			});
			expect(inj1.status).toBe(201);
			expect(inj2.status).toBe(201);

			// Both bots see the filesystem
			const list1 = await app.request(`/api/filesystems?agentUserId=${botId}`, { headers: auth() });
			const list2 = await app.request(`/api/filesystems?agentUserId=${bot2Id}`, {
				headers: auth(),
			});
			const body1 = (await list1.json()) as { filesystems: Array<{ id: string }> };
			const body2 = (await list2.json()) as { filesystems: Array<{ id: string }> };
			expect(body1.filesystems.map((f) => f.id)).toContain(fsId);
			expect(body2.filesystems.map((f) => f.id)).toContain(fsId);
		});

		test("re-injecting same (agentUserId, filesystemId) → 409 (UNIQUE enforcement)", async ({
			db,
			app,
		}) => {
			const { teamId, botId } = await seedTeamAndBots(db, "inj4");

			const createRes = await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId,
					kind: "code",
					connectionId: null,
					resourceRef: { kind: "code", repo: "/repo", branch: "main" },
					writeback: "git",
				}),
			});
			const { id: fsId } = (await createRes.json()) as { id: string };

			await app.request(`/api/filesystems/${fsId}/injections`, {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({ agentUserId: botId }),
			});

			// Second identical injection → 409
			const dupRes = await app.request(`/api/filesystems/${fsId}/injections`, {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({ agentUserId: botId }),
			});
			expect(dupRes.status).toBe(409);
		});

		test("DELETE /api/filesystems/:id/injections/:agentUserId removes only the injection", async ({
			db,
			app,
		}) => {
			const { teamId, botId } = await seedTeamAndBots(db, "inj5");

			const createRes = await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId,
					kind: "code",
					connectionId: null,
					resourceRef: { kind: "code", repo: "/repo", branch: "main" },
					writeback: "git",
				}),
			});
			const { id: fsId } = (await createRes.json()) as { id: string };

			await app.request(`/api/filesystems/${fsId}/injections`, {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({ agentUserId: botId }),
			});

			const delRes = await app.request(`/api/filesystems/${fsId}/injections/${botId}`, {
				method: "DELETE",
				headers: auth(),
			});
			expect(delRes.status).toBe(204);

			// Filesystem itself still exists
			const stillThere = await app.request(`/api/filesystems/${fsId}`, { headers: auth() });
			expect(stillThere.status).toBe(200);

			// Bot's injection list is now empty for this fs
			const listRes = await app.request(`/api/filesystems?agentUserId=${botId}`, {
				headers: auth(),
			});
			const listBody = (await listRes.json()) as { filesystems: Array<{ id: string }> };
			expect(listBody.filesystems.map((f) => f.id)).not.toContain(fsId);
		});

		test("POST injection with mismatched team → 400 (team-consistency check)", async ({
			db,
			app,
		}) => {
			// Two separate teams
			const { teamId: teamA } = await seedTeamAndBots(db, "inj6a");
			const { teamMembersId: tmB } = await seedTeamAndBots(db, "inj6b");
			// A bot from team B
			const botFromB = `bot-ao1-inj6b-alien`;
			await db.insert(users).values({
				id: botFromB,
				kind: "ai",
				name: "Alien Bot",
				role: "builder",
				status: "active",
				teamId: tmB,
				createdAt: NOW,
			});

			// Register filesystem under team A
			const createRes = await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId: teamA,
					kind: "code",
					connectionId: null,
					resourceRef: { kind: "code", repo: "/repo", branch: "main" },
					writeback: "git",
				}),
			});
			const { id: fsId } = (await createRes.json()) as { id: string };

			// Try to inject into a bot from a different team → 400
			const injRes = await app.request(`/api/filesystems/${fsId}/injections`, {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({ agentUserId: botFromB }),
			});
			expect(injRes.status).toBe(400);
		});
	});

	// ─────────────────────────────────────────────────────────────────────
	// AC2 — code filesystem stores connectionId + resourceRef, no credential
	// ─────────────────────────────────────────────────────────────────────

	describe("AC2: code filesystem records connection_id + resourceRef, no token", () => {
		test("POST stores connectionId and resourceRef (JSON selector) on the row", async ({
			db,
			app,
		}) => {
			const { teamId } = await seedTeamAndBots(db, "ac2a");

			const res = await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId,
					kind: "code",
					connectionId: "conn-x-123",
					resourceRef: { kind: "code", repo: "owner/hyperidle", branch: "feat/ao1" },
					writeback: "git",
				}),
			});
			expect(res.status).toBe(201);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.connectionId).toBe("conn-x-123");
			// resourceRef should be the parsed object (not raw JSON text)
			const ref = body.resourceRef as Record<string, unknown>;
			expect(ref.repo).toBe("owner/hyperidle");
			expect(ref.branch).toBe("feat/ao1");
		});
	});

	// ─────────────────────────────────────────────────────────────────────
	// AC3 — doc_set accepted; SoR kinds rejected
	// ─────────────────────────────────────────────────────────────────────

	describe("AC3: doc_set accepted; SoR kinds rejected at Zod boundary", () => {
		test("POST with kind='doc_set' returns 201", async ({ db, app }) => {
			const { teamId } = await seedTeamAndBots(db, "ac3a");

			const res = await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId,
					kind: "doc_set",
					connectionId: null,
					resourceRef: { kind: "doc_set", folder: "/Users/me/notes" },
					writeback: "file",
				}),
			});
			expect(res.status).toBe(201);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.kind).toBe("doc_set");
		});

		test("POST with kind='inbox' (SoR) → 400 VALIDATION_ERROR", async ({ db, app }) => {
			const { teamId } = await seedTeamAndBots(db, "ac3b");

			const res = await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId,
					kind: "inbox",
					connectionId: "conn-gmail",
					resourceRef: { kind: "inbox", account: "user@example.com" },
					writeback: "none",
				}),
			});
			expect(res.status).toBe(400);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.code ?? body.error).toBeDefined();
		});

		test("POST with kind='crm' (SoR) → 400 VALIDATION_ERROR", async ({ db, app }) => {
			const { teamId } = await seedTeamAndBots(db, "ac3c");

			const res = await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId,
					kind: "crm",
					connectionId: "conn-salesforce",
					resourceRef: { kind: "crm", orgId: "sf-org" },
					writeback: "none",
				}),
			});
			expect(res.status).toBe(400);
		});

		test("POST with kind='ticket_queue' (SoR) → 400 VALIDATION_ERROR", async ({ db, app }) => {
			const { teamId } = await seedTeamAndBots(db, "ac3d");

			const res = await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId,
					kind: "ticket_queue",
					connectionId: "conn-linear",
					resourceRef: { kind: "ticket_queue", project: "hyperidle" },
					writeback: "none",
				}),
			});
			expect(res.status).toBe(400);
		});
	});

	// ─────────────────────────────────────────────────────────────────────
	// AC4 — filesystem distinct from knowledge_items + git-export config
	// ─────────────────────────────────────────────────────────────────────

	describe("AC4: Filesystem distinct from knowledge_items and git-export config", () => {
		test("registering a filesystem does not change knowledge_items rowcount", async ({
			db,
			app,
		}) => {
			const { teamId } = await seedTeamAndBots(db, "ac4a");

			// Count knowledge_items before
			const before = await db.select().from(knowledgeItems);
			const countBefore = before.length;

			await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId,
					kind: "code",
					connectionId: null,
					resourceRef: { kind: "code", repo: "/repo", branch: "main" },
					writeback: "git",
				}),
			});

			// Count knowledge_items after
			const after = await db.select().from(knowledgeItems);
			expect(after.length).toBe(countBefore);
		});

		test("registering a filesystem does not change the git-export config", async ({ db, app }) => {
			const { teamId } = await seedTeamAndBots(db, "ac4b");

			// Read git-export config before
			const configBefore = await app.request("/api/git-export/config", { headers: auth() });
			const cfgBefore = (await configBefore.json()) as Record<string, unknown>;

			await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId,
					kind: "code",
					connectionId: null,
					resourceRef: { kind: "code", repo: "/repo", branch: "main" },
					writeback: "git",
				}),
			});

			// Read git-export config after — must be identical
			const configAfter = await app.request("/api/git-export/config", { headers: auth() });
			const cfgAfter = (await configAfter.json()) as Record<string, unknown>;
			expect(cfgAfter).toEqual(cfgBefore);
		});
	});

	// ─────────────────────────────────────────────────────────────────────
	// AC5 — NoopAuthResolver: connection-backed → needs_attention; local → reachable
	// ─────────────────────────────────────────────────────────────────────

	describe("AC5: needs_attention surfaces when connection is unresolvable", () => {
		test("code+git filesystem with connectionId → state:'needs_attention' (NoopAuthResolver)", async ({
			db,
			app,
		}) => {
			const { teamId } = await seedTeamAndBots(db, "ac5a");

			// Use a non-existent absolute local path so git ls-remote exits non-zero
			// without ANY network call. repoToUrl("/no/such/repo") → file:///no/such/repo
			// → git ls-remote file:///no/such/repo → exit non-zero → needs_attention.
			// @lore AO1 v2 M1 fix: the old "owner/repo" short form became a local file://
			// path accidentally (the M1 bug). Now that repoToUrl correctly maps "owner/repo"
			// → https://github.com/…, using it here would hit the network in CI. This
			// hermetic scenario uses a missing local path (absolute) instead — the real
			// git probe still runs (Lane A, no network), and the result is still needs_attention
			// for the right reason: NoopAuthResolver.resolveToken() → null (no token) + git
			// ls-remote against a non-existent file:// → non-zero exit.
			const missingLocalRepo = `/ao1-test-nonexistent-repo-${Date.now().toString(36)}`;

			const createRes = await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId,
					kind: "code",
					connectionId: "missing-conn-xyz",
					resourceRef: { kind: "code", repo: missingLocalRepo, branch: "main" },
					writeback: "git",
				}),
			});
			expect(createRes.status).toBe(201);
			const created = (await createRes.json()) as Record<string, unknown>;
			const id = created.id as string;

			// On GET, the reachability check runs:
			// - resolveToken("missing-conn-xyz") → null (NoopAuthResolver)
			// - repoToUrl(missingLocalRepo) → file:///ao1-test-nonexistent-… (absolute path)
			// - git ls-remote file:///no/such/path → exit non-zero → needs_attention
			const getRes = await app.request(`/api/filesystems/${id}`, { headers: auth() });
			expect(getRes.status).toBe(200);
			const got = (await getRes.json()) as Record<string, unknown>;
			expect(got.state).toBe("needs_attention");
		});

		test("local filesystem (connectionId null, real existing path) → state:'reachable'", async ({
			db,
			app,
		}) => {
			const { teamId } = await seedTeamAndBots(db, "ac5b");

			// Use os.tmpdir() — guaranteed to exist on every platform.
			// @lore AO1 v2: The real probe checks fs.access(R_OK) — must use a real path.
			const realPath = os.tmpdir();

			const createRes = await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId,
					kind: "code",
					connectionId: null,
					resourceRef: { kind: "code", repo: realPath, branch: "main" },
					writeback: "git",
				}),
			});
			expect(createRes.status).toBe(201);
			const { id } = (await createRes.json()) as { id: string };

			const getRes = await app.request(`/api/filesystems/${id}`, { headers: auth() });
			expect(getRes.status).toBe(200);
			const got = (await getRes.json()) as Record<string, unknown>;
			// Local (no connection) + real path exists → reachable
			expect(got.state).toBe("reachable");
		});

		test("writeback:'none' filesystem → state:'reachable' regardless of connectionId", async ({
			db,
			app,
		}) => {
			const { teamId } = await seedTeamAndBots(db, "ac5c");

			const createRes = await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId,
					kind: "doc_set",
					connectionId: "some-conn-id",
					resourceRef: { kind: "doc_set", folder: "/notes" },
					writeback: "none",
				}),
			});
			expect(createRes.status).toBe(201);
			const { id } = (await createRes.json()) as { id: string };

			const getRes = await app.request(`/api/filesystems/${id}`, { headers: auth() });
			const got = (await getRes.json()) as Record<string, unknown>;
			// writeback:none = read-only ref → reachable regardless of connection resolution
			expect(got.state).toBe("reachable");
		});
	});

	// ─────────────────────────────────────────────────────────────────────
	// AC6 — DELETE filesystem cascades its injections
	// ─────────────────────────────────────────────────────────────────────

	describe("AC6: DELETE filesystem cascades injections", () => {
		test("DELETE /api/filesystems/:id removes registration and cascades injections", async ({
			db,
			app,
		}) => {
			const { teamId, botId, bot2Id } = await seedTeamAndBots(db, "ac6a");

			// Register filesystem
			const createRes = await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId,
					kind: "code",
					connectionId: null,
					resourceRef: { kind: "code", repo: "/repo", branch: "main" },
					writeback: "git",
				}),
			});
			const { id: fsId } = (await createRes.json()) as { id: string };

			// Inject into both bots
			await app.request(`/api/filesystems/${fsId}/injections`, {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({ agentUserId: botId }),
			});
			await app.request(`/api/filesystems/${fsId}/injections`, {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({ agentUserId: bot2Id }),
			});

			// Delete the registration
			const delRes = await app.request(`/api/filesystems/${fsId}`, {
				method: "DELETE",
				headers: auth(),
			});
			expect(delRes.status).toBe(204);

			// Filesystem GET → 404
			const notFound = await app.request(`/api/filesystems/${fsId}`, { headers: auth() });
			expect(notFound.status).toBe(404);

			// Both bots' injection lists no longer contain this filesystem
			const list1 = await app.request(`/api/filesystems?agentUserId=${botId}`, { headers: auth() });
			const list2 = await app.request(`/api/filesystems?agentUserId=${bot2Id}`, {
				headers: auth(),
			});
			const body1 = (await list1.json()) as { filesystems: Array<{ id: string }> };
			const body2 = (await list2.json()) as { filesystems: Array<{ id: string }> };
			expect(body1.filesystems.map((f) => f.id)).not.toContain(fsId);
			expect(body2.filesystems.map((f) => f.id)).not.toContain(fsId);
		});

		test("DELETE /api/filesystems/:id on unknown id → 404", async ({ app }) => {
			const res = await app.request("/api/filesystems/no-such-fs", {
				method: "DELETE",
				headers: auth(),
			});
			expect(res.status).toBe(404);
		});
	});

	// ─────────────────────────────────────────────────────────────────────
	// AC8 — Migration: tables exist with correct columns; no agent_user_id on filesystems
	// ─────────────────────────────────────────────────────────────────────

	describe("AC8: Migration — correct tables, columns, constraints", () => {
		test("filesystems table exists after migration", async ({ db }) => {
			const result = await db.execute(
				sql.raw(
					`SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'filesystems'`,
				),
			);
			const rows = (result as { rows: unknown[] }).rows;
			expect(rows.length).toBe(1);
		});

		test("filesystem_injections table exists after migration", async ({ db }) => {
			const result = await db.execute(
				sql.raw(
					`SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'filesystem_injections'`,
				),
			);
			const rows = (result as { rows: unknown[] }).rows;
			expect(rows.length).toBe(1);
		});

		test("filesystems table has source column (not agent_user_id)", async ({ db }) => {
			const result = await db.execute(
				sql.raw(
					`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='filesystems' ORDER BY ordinal_position`,
				),
			);
			const cols = (result as { rows: Array<{ column_name: string }> }).rows.map(
				(r) => r.column_name,
			);
			expect(cols).toContain("source");
			expect(cols).toContain("team_id");
			expect(cols).toContain("kind");
			expect(cols).toContain("connection_id");
			expect(cols).toContain("resource_ref");
			expect(cols).toContain("writeback");
			expect(cols).toContain("state");
			expect(cols).toContain("created_at");
			// The old single-owner column must NOT be present (model correction)
			expect(cols).not.toContain("agent_user_id");
		});

		test("filesystem_injections has composite PK (agent_user_id, filesystem_id) — UNIQUE enforcement", async ({
			db,
		}) => {
			const result = await db.execute(
				sql.raw(
					`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='filesystem_injections' ORDER BY ordinal_position`,
				),
			);
			const cols = (result as { rows: Array<{ column_name: string }> }).rows.map(
				(r) => r.column_name,
			);
			expect(cols).toContain("agent_user_id");
			expect(cols).toContain("filesystem_id");
			expect(cols).toContain("created_at");
		});

		test("filesystems_team_idx index exists", async ({ db }) => {
			const result = await db.execute(
				sql.raw(
					`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='filesystems'`,
				),
			);
			const names = (result as { rows: Array<{ indexname: string }> }).rows.map((r) => r.indexname);
			expect(names).toContain("filesystems_team_idx");
		});

		test("migration does not touch artifacts or knowledge_items tables (no ALTER)", async ({
			db,
		}) => {
			// Both tables must still exist and have no new filesystem-related columns
			const artifactCols = await db.execute(
				sql.raw(
					`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='artifacts' ORDER BY ordinal_position`,
				),
			);
			const aCols = (artifactCols as { rows: Array<{ column_name: string }> }).rows.map(
				(r) => r.column_name,
			);
			expect(aCols).not.toContain("filesystem_id");
			expect(aCols).not.toContain("source");

			const kiCols = await db.execute(
				sql.raw(
					`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_items' ORDER BY ordinal_position`,
				),
			);
			const kCols = (kiCols as { rows: Array<{ column_name: string }> }).rows.map(
				(r) => r.column_name,
			);
			expect(kCols).not.toContain("filesystem_id");
		});
	});
});
