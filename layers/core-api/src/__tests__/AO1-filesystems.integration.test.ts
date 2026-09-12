/**
 * AO1 — Integration tests for the Filesystem registry + per-bot injection primitive.
 *
 * @lore BA5 §2.7/§12: rewritten for the real `checkFilesystem` (registration and
 * `POST /:id/check` both run it and persist the result) replacing the old
 * live-probe-on-`GET /:id` design — that route is deleted. POST now returns
 * `{ filesystem, check }`, `sourceHint`/`writeback` are gone, and a
 * `connectionId` must name a real held `token` connection whose `service` is
 * `github`, for an `https://github.com/` repo — anything else is a 400.
 *
 * Coverage:
 *   AC1  — register + source derivation, list; GET /:id is gone
 *   AC1b — inject/eject/share, UNIQUE enforcement, DELETE injection only
 *   AC2  — connection_id + resourceRef stored, NO credential on the row; POST validation (§2.7)
 *   AC3  — doc_set accepted; SoR kinds rejected at validation boundary
 *   AC4  — filesystem distinct from knowledge_items + server config
 *   AC5  — Check runs on registration: needs_attention / reachable on the POST response itself
 *   AC6  — DELETE filesystem cascades injections
 *   AC8  — migration: filesystems + filesystem_injections tables, correct columns, no agent_user_id
 */

import * as os from "node:os";
import { encryptCredentialValue } from "@hyperidle/credentials";
import {
	type HyperIdleDb,
	knowledgeItems,
	serverConfig,
	serviceConnections,
	teams,
	users,
} from "@hyperidle/db";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-ao1";
const NOW = "2026-06-26T00:00:00.000Z";
const CREDENTIAL_KEY = "ao1-filesystems-test-credential-key";

/**
 * BA5 §2.7: `connectionId` on a POST body must now name a real, held `token`
 * connection whose `service` is `github` — seed one for real, encrypted with
 * the real cipher, exactly as `resolveConnectionToken` will read it back.
 */
async function seedGithubTokenConnection(
	db: HyperIdleDb,
	ownerId: string,
	token: string,
): Promise<string> {
	const id = `sc-ao1-${ownerId}`;
	await db.insert(serviceConnections).values({
		id,
		userId: ownerId,
		service: "github",
		authSource: "token",
		encryptedToken: encryptCredentialValue(token),
		serverUrl: null,
		createdAt: NOW,
		updatedAt: NOW,
	});
	return id;
}

function auth(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

// ─── Seed helpers ────────────────────────────────────────────────────────────

interface SeedResult {
	teamId: string;
	botId: string;
	bot2Id: string;
}

/**
 * Seed a team + teamMembers (U1 1:1) + two bot users for injection tests.
 * users.teamId → teamMembers.id (schema.ts:47).
 */
async function seedTeamAndBots(db: HyperIdleDb, prefix: string): Promise<SeedResult> {
	const teamId = `team-ao1-${prefix}`;
	const botId = `bot-ao1-${prefix}-1`;
	const bot2Id = `bot-ao1-${prefix}-2`;

	await db
		.insert(teams)
		.values({ id: teamId, name: `AO1 Team ${prefix}`, phase: "build", createdAt: NOW });
	await db.insert(users).values({
		id: botId,
		kind: "ai",
		name: "Builder Bot",
		role: "builder",
		status: "active",
		teamId: teamId,
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: bot2Id,
		kind: "ai",
		name: "QA Bot",
		role: "qa_engineer",
		status: "active",
		teamId: teamId,
		createdAt: NOW,
	});

	return { teamId, botId, bot2Id };
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
		test("POST /api/filesystems with a github.com URL returns 201 and derives source 'github'", async ({
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
					connectionId: null,
					resourceRef: {
						kind: "code",
						repo: "https://github.com/owner/hyperidle.git",
						branch: "main",
					},
				}),
			});

			expect(res.status).toBe(201);
			const body = (await res.json()) as { filesystem: Record<string, unknown>; check: unknown };
			expect(body.filesystem.teamId).toBe(teamId);
			expect(body.filesystem.kind).toBe("code");
			expect(body.filesystem.source).toBe("github");
			// source must NOT be agent-owned: no agentUserId field on the row
			expect(body.filesystem).not.toHaveProperty("agentUserId");
			expect(body.check).toBeDefined();
		});

		test("POST with a local path and null connectionId → source 'local'", async ({ db, app }) => {
			const { teamId } = await seedTeamAndBots(db, "ac1b");

			const res = await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId,
					kind: "code",
					connectionId: null,
					resourceRef: { kind: "code", repo: "/home/user/myrepo", branch: "main" },
				}),
			});

			expect(res.status).toBe(201);
			const body = (await res.json()) as { filesystem: Record<string, unknown> };
			expect(body.filesystem.source).toBe("local");
			expect(body.filesystem.connectionId).toBeNull();
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
				}),
			});

			const listRes = await app.request(`/api/filesystems?teamId=${teamId}`, { headers: auth() });
			expect(listRes.status).toBe(200);
			const listBody = (await listRes.json()) as { filesystems: unknown[] };
			expect(Array.isArray(listBody.filesystems)).toBe(true);
			expect(listBody.filesystems.length).toBeGreaterThanOrEqual(1);
		});

		test("POST /api/filesystems returns the filesystem with all required fields (GET /:id is gone, BA5 §12)", async ({
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
				}),
			});

			expect(createRes.status).toBe(201);
			const { filesystem } = (await createRes.json()) as { filesystem: Record<string, unknown> };
			expect(filesystem.id).toBeDefined();
			expect(filesystem.source).toBeDefined();
			expect(filesystem.kind).toBe("code");
			expect(filesystem).not.toHaveProperty("writeback");
			expect(filesystem.state).toBeDefined();
			expect(filesystem.resourceRef).toBeDefined();
			// resourceRef should expose the parsed object, not raw JSON string
			expect(typeof filesystem.resourceRef).toBe("object");
		});

		test("POST /api/filesystems/:id/check → 404 for unknown id (GET /:id is gone, BA5 §12)", async ({
			app,
		}) => {
			const res = await app.request("/api/filesystems/does-not-exist/check", {
				method: "POST",
				headers: auth(),
			});
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
					connectionId: null,
					resourceRef: { kind: "code", repo: "/repo", branch: "main" },
				}),
			});

			expect(createRes.status).toBe(201);
			const { filesystem } = (await createRes.json()) as { filesystem: Record<string, unknown> };
			// No credential fields ever on the filesystem row (AC2 hard rule)
			expect(filesystem).not.toHaveProperty("token");
			expect(filesystem).not.toHaveProperty("secret");
			expect(filesystem).not.toHaveProperty("credential");
			expect(filesystem).not.toHaveProperty("auth");
			expect(filesystem).not.toHaveProperty("password");
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
				}),
			});
			const {
				filesystem: { id: fsId },
			} = (await createRes.json()) as { filesystem: { id: string } };

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
				}),
			});
			const {
				filesystem: { id: fsId },
			} = (await createRes.json()) as { filesystem: { id: string } };

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
				}),
			});
			const {
				filesystem: { id: fsId },
			} = (await createRes.json()) as { filesystem: { id: string } };

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
				}),
			});
			const {
				filesystem: { id: fsId },
			} = (await createRes.json()) as { filesystem: { id: string } };

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
				}),
			});
			const {
				filesystem: { id: fsId },
			} = (await createRes.json()) as { filesystem: { id: string } };

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
			const repeatedDelRes = await app.request(`/api/filesystems/${fsId}/injections/${botId}`, {
				method: "DELETE",
				headers: auth(),
			});
			expect(repeatedDelRes.status).toBe(404);

			// Filesystem itself still exists (GET /:id is gone, BA5 §12 — Check is the proxy)
			const stillThere = await app.request(`/api/filesystems/${fsId}/check`, {
				method: "POST",
				headers: auth(),
			});
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
			const { teamId: tmB } = await seedTeamAndBots(db, "inj6b");
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
				}),
			});
			const {
				filesystem: { id: fsId },
			} = (await createRes.json()) as { filesystem: { id: string } };

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
		beforeEach(() => {
			vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", CREDENTIAL_KEY);
		});

		test("POST stores connectionId and resourceRef (JSON selector) on the row", async ({
			db,
			app,
		}) => {
			const { teamId, botId } = await seedTeamAndBots(db, "ac2a");
			const connectionId = await seedGithubTokenConnection(db, botId, "ac2a-token");

			const res = await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId,
					kind: "code",
					connectionId,
					resourceRef: {
						kind: "code",
						repo: "https://github.com/owner/hyperidle.git",
						branch: "feat/ao1",
					},
				}),
			});
			expect(res.status).toBe(201);
			const { filesystem } = (await res.json()) as { filesystem: Record<string, unknown> };
			expect(filesystem.connectionId).toBe(connectionId);
			// resourceRef should be the parsed object (not raw JSON text)
			const ref = filesystem.resourceRef as Record<string, unknown>;
			expect(ref.repo).toBe("https://github.com/owner/hyperidle.git");
			expect(ref.branch).toBe("feat/ao1");
		});

		test("a connectionId that does not name a held GitHub token connection → 400", async ({
			db,
			app,
		}) => {
			const { teamId } = await seedTeamAndBots(db, "ac2b");

			const res = await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId,
					kind: "code",
					connectionId: "conn-does-not-exist",
					resourceRef: {
						kind: "code",
						repo: "https://github.com/owner/hyperidle.git",
						branch: "main",
					},
				}),
			});
			expect(res.status).toBe(400);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.code).toBe("VALIDATION_ERROR");
		});

		test("a URL carrying userinfo → 400 (credentials belong in a connection)", async ({
			db,
			app,
		}) => {
			const { teamId } = await seedTeamAndBots(db, "ac2c");

			const res = await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId,
					kind: "code",
					connectionId: null,
					resourceRef: {
						kind: "code",
						repo: "https://user:pass@github.com/owner/hyperidle.git",
						branch: "main",
					},
				}),
			});
			expect(res.status).toBe(400);
		});

		test("a branch starting with '-' → 400 (never reaches argv as a flag)", async ({ db, app }) => {
			const { teamId } = await seedTeamAndBots(db, "ac2d");

			const res = await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId,
					kind: "code",
					connectionId: null,
					resourceRef: { kind: "code", repo: "/repo", branch: "-x" },
				}),
			});
			expect(res.status).toBe(400);
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
				}),
			});
			expect(res.status).toBe(201);
			const { filesystem } = (await res.json()) as { filesystem: Record<string, unknown> };
			expect(filesystem.kind).toBe("doc_set");
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
				}),
			});
			expect(res.status).toBe(400);
		});
	});

	// ─────────────────────────────────────────────────────────────────────
	// AC4 — filesystem distinct from knowledge_items + server config
	// ─────────────────────────────────────────────────────────────────────

	describe("AC4: Filesystem distinct from knowledge_items and server config", () => {
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
				}),
			});

			// Count knowledge_items after
			const after = await db.select().from(knowledgeItems);
			expect(after.length).toBe(countBefore);
		});

		// @lore AU26 C1: this asserted against `/api/git-export/config`, which is
		// deleted with the exporter. The AC is "registering a filesystem touches
		// only its own table", so it now reads `server_config` itself — the same
		// claim, one indirection fewer.
		test("registering a filesystem does not change the server config", async ({ db, app }) => {
			const { teamId } = await seedTeamAndBots(db, "ac4b");

			const cfgBefore = await db.select().from(serverConfig);

			await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId,
					kind: "code",
					connectionId: null,
					resourceRef: { kind: "code", repo: "/repo", branch: "main" },
				}),
			});

			const cfgAfter = await db.select().from(serverConfig);
			expect(cfgAfter).toEqual(cfgBefore);
		});
	});

	// ─────────────────────────────────────────────────────────────────────
	// AC5 — NoopAuthResolver: connection-backed → needs_attention; local → reachable
	// ─────────────────────────────────────────────────────────────────────

	describe("AC5: needs_attention surfaces on registration, through the real Check (BA5 §2.7)", () => {
		test("a local git filesystem whose path does not exist → state:'needs_attention' on the POST response itself", async ({
			db,
			app,
		}) => {
			const { teamId } = await seedTeamAndBots(db, "ac5a");

			// A missing local path: `checkFilesystem` runs a real, offline
			// `git rev-parse --is-inside-work-tree` against it (no network) and
			// fails, so registration itself persists needs_attention — no
			// separate GET/probe step exists any more (BA5 §2.7: Check runs on
			// registration).
			const missingLocalRepo = `/ao1-test-nonexistent-repo-${Date.now().toString(36)}`;

			const createRes = await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId,
					kind: "code",
					connectionId: null,
					resourceRef: { kind: "code", repo: missingLocalRepo, branch: "main" },
				}),
			});
			expect(createRes.status).toBe(201);
			const { filesystem, check } = (await createRes.json()) as {
				filesystem: Record<string, unknown>;
				check: { ok: boolean };
			};
			expect(check.ok).toBe(false);
			expect(filesystem.state).toBe("needs_attention");
			expect(filesystem.attentionReason).toBeTruthy();
		});

		test("a local filesystem with a real, existing path → state:'reachable' on the POST response itself", async ({
			db,
			app,
		}) => {
			const { teamId } = await seedTeamAndBots(db, "ac5b");

			// Use os.tmpdir() — guaranteed to exist on every platform. It is not
			// itself a git repo, so this exercises the doc_set path instead.
			const realPath = os.tmpdir();

			const createRes = await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId,
					kind: "doc_set",
					connectionId: null,
					resourceRef: { kind: "doc_set", folder: realPath },
				}),
			});
			expect(createRes.status).toBe(201);
			const { filesystem, check } = (await createRes.json()) as {
				filesystem: Record<string, unknown>;
				check: { ok: boolean };
			};
			expect(check.ok).toBe(true);
			expect(filesystem.state).toBe("reachable");
			expect(filesystem.attentionReason).toBeNull();
		});

		// BA5 §2.7: a `connectionId` is only valid for a `code` filesystem whose
		// repo is already an `https://github.com/` URL — a doc_set can never
		// carry one. This is now caught at the validation boundary, not waved
		// through to a probe that could never have resolved it anyway.
		test("a doc_set filesystem with a connectionId → 400 at registration", async ({ db, app }) => {
			const { teamId } = await seedTeamAndBots(db, "ac5c");

			const createRes = await app.request("/api/filesystems", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId,
					kind: "doc_set",
					connectionId: "some-conn-id",
					resourceRef: { kind: "doc_set", folder: "/notes" },
				}),
			});
			expect(createRes.status).toBe(400);
			const body = (await createRes.json()) as Record<string, unknown>;
			expect(body.code).toBe("VALIDATION_ERROR");
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
				}),
			});
			const {
				filesystem: { id: fsId },
			} = (await createRes.json()) as { filesystem: { id: string } };

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

			// Filesystem gone (GET /:id is deleted, BA5 §12 — Check is the proxy for "does it exist")
			const notFound = await app.request(`/api/filesystems/${fsId}/check`, {
				method: "POST",
				headers: auth(),
			});
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
			expect(cols).toContain("attention_reason");
			expect(cols).toContain("state");
			expect(cols).toContain("created_at");
			// The old single-owner column must NOT be present (model correction)
			expect(cols).not.toContain("agent_user_id");
			// BA5 §12: the write-back capability axis is retired (migration 0082).
			expect(cols).not.toContain("writeback");
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
