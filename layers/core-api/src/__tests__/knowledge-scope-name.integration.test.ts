/**
 * AV3 — Integration tests: GET /api/knowledge/:id returns scopeName.
 *
 * AC-1: team-scoped item returns scopeName === team name (not bucket word, not UUID).
 * AC-2: scopeName present for factory/"Factory", user/name, team/name, missing→fallback.
 * AV3 amendment: practice→role label, filesystem→composed display name.
 * AU26 F2 (founder ruling): the filesystem scope kind is DELETED — the string
 * now resolves through the unknown-kind fallback, and this route no longer
 * reads `filesystems` at all.
 *
 * Uses real DB + real Hono app fixtures.
 */
import {
	filesystems,
	type HyperIdleDb,
	knowledgeAppProjection,
	knowledgeItems,
	tasks,
	teams,
	users,
} from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, test, vi } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-av3";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function createKnowledgeItem(
	db: HyperIdleDb,
	overrides: {
		scopeKind?: string;
		scopeId?: string | null;
		updatedBy?: string;
		title?: string;
	},
): Promise<string> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	await db.insert(knowledgeItems).values({
		id,
		title: overrides.title ?? "Test item",
		body: "Body text.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: overrides.updatedBy ?? "human",
		createdAt: now,
		updatedAt: now,
		scopeKind: overrides.scopeKind ?? "factory",
		scopeId: overrides.scopeId ?? null,
	});
	// Insert a minimal fabric row to satisfy joins in GET /:id
	await db.insert(knowledgeAppProjection).values({
		id: crypto.randomUUID(),
		knowledgeItemId: id,
	});
	return id;
}

describe("GET /api/knowledge/:id returns resolved scopeName alongside scopeKind/scopeId", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("factory item returns scopeName = 'Factory'", async ({ db, app }) => {
		const id = await createKnowledgeItem(db, { scopeKind: "factory", scopeId: null });
		const res = await app.request(`/api/knowledge/${id}`, { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.scopeName).toBe("Factory");
	});

	test("user item returns scopeName = user name", async ({ db, app }) => {
		// Create a user
		const userId = crypto.randomUUID();
		await db.insert(users).values({
			id: userId,
			name: "Alice Founder",
			kind: "human",
			role: "founder",
			status: "active",
			createdAt: new Date().toISOString(),
		});
		const id = await createKnowledgeItem(db, {
			scopeKind: "user",
			scopeId: userId,
			updatedBy: userId,
		});
		const res = await app.request(`/api/knowledge/${id}`, {
			headers: authHeaders({ "X-User-Id": userId }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.scopeName).toBe("Alice Founder");
	});

	test("team item returns scopeName = team name (AC-1)", async ({ db, app }) => {
		// Create a team
		const teamId = crypto.randomUUID();
		await db.insert(teams).values({
			id: teamId,
			name: "Team Nimmly",
			phase: "active",
			createdAt: new Date().toISOString(),
		});
		const id = await createKnowledgeItem(db, {
			scopeKind: "team",
			scopeId: teamId,
		});
		const res = await app.request(`/api/knowledge/${id}`, { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		// AC-1: resolved name, not bucket word, not raw id
		expect(body.scopeName).toBe("Team Nimmly");
		expect(body.scopeName).not.toBe("Team");
		expect(body.scopeName).not.toBe(teamId);
	});

	test("team item returns team name via teams.id", async ({ db, app }) => {
		// Create team + team_members
		const teamId = crypto.randomUUID();
		await db.insert(teams).values({
			id: teamId,
			name: "Backend Squad",
			phase: "active",
			createdAt: new Date().toISOString(),
		});
		const id = await createKnowledgeItem(db, {
			scopeKind: "team",
			scopeId: teamId,
		});
		const res = await app.request(`/api/knowledge/${id}`, { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.scopeName).toBe("Backend Squad");
	});

	test("bet item returns scopeName = truncated description", async ({ db, app }) => {
		// Create bet (requires team)
		const teamId = crypto.randomUUID();
		await db.insert(teams).values({
			id: teamId,
			name: "Alpha",
			phase: "active",
			createdAt: new Date().toISOString(),
		});
		const rootTaskId = crypto.randomUUID();
		await db.insert(tasks).values({
			id: rootTaskId,
			parentTaskId: null,
			teamId: teamId,
			title: "Ship the new onboarding flow",
			description: "Ship the new onboarding flow",
			state: "in_progress",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});
		const id = await createKnowledgeItem(db, { scopeKind: "bet", scopeId: rootTaskId });
		const res = await app.request(`/api/knowledge/${id}`, { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.scopeName).toBe("Ship the new onboarding flow");
	});

	test("task item returns scopeName = task title", async ({ db, app }) => {
		// Create team + bet + task
		const teamId = crypto.randomUUID();
		await db.insert(teams).values({
			id: teamId,
			name: "Beta",
			phase: "active",
			createdAt: new Date().toISOString(),
		});
		const rootTaskId = crypto.randomUUID();
		await db.insert(tasks).values({
			id: rootTaskId,
			parentTaskId: null,
			teamId: teamId,
			title: "Build auth",
			description: "Build auth",
			state: "in_progress",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});
		const now = new Date().toISOString();
		const taskId = crypto.randomUUID();
		await db.insert(tasks).values({
			id: taskId,
			parentTaskId: rootTaskId,
			teamId,
			title: "Implement JWT refresh",
			state: "active",
			createdAt: now,
			updatedAt: now,
		});
		const id = await createKnowledgeItem(db, { scopeKind: "task", scopeId: taskId });
		const res = await app.request(`/api/knowledge/${id}`, { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.scopeName).toBe("Implement JWT refresh");
	});

	test("product scope (no table) returns scopeName = 'Team'", async ({ db, app }) => {
		const id = await createKnowledgeItem(db, { scopeKind: "product", scopeId: "any-id" });
		const res = await app.request(`/api/knowledge/${id}`, { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.scopeName).toBe("Team");
	});

	test("practice scope null scopeId → 'Shared' fallback (AV3 amendment: role-label path, no id → fallback)", async ({
		db,
		app,
	}) => {
		// @lore AV3 A1: practice + null scopeId falls back to scopeKindToLabel("practice") = "Shared".
		// Before the amendment, "practice" always returned "Shared" (no entity table). Now it resolves
		// scopeId as a role label; null/empty scopeId still falls back to "Shared".
		const id = await createKnowledgeItem(db, { scopeKind: "practice", scopeId: null });
		const res = await app.request(`/api/knowledge/${id}`, { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.scopeName).toBe("Shared");
	});

	test("missing user entity → 'Private' (never UUID)", async ({ db, app }) => {
		const bogusUserId = "550e8400-e29b-41d4-a716-446655440000";
		// @lore AV3: API key auth resolves userId to "u-founder" when no human user exists in DB.
		// The item must have updatedBy matching that userId so the user-scope visibility check passes.
		const id = await createKnowledgeItem(db, {
			scopeKind: "user",
			scopeId: bogusUserId,
			updatedBy: "u-founder", // matches API key auth's default userId
		});
		const res = await app.request(`/api/knowledge/${id}`, { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.scopeName).toBe("Private");
		expect(body.scopeName).not.toBe(bogusUserId);
	});

	test("scopeKind + scopeId present alongside scopeName in response", async ({ db, app }) => {
		const id = await createKnowledgeItem(db, { scopeKind: "factory", scopeId: null });
		const res = await app.request(`/api/knowledge/${id}`, { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.scopeKind).toBe("factory");
		expect(body).toHaveProperty("scopeId");
		expect(body).toHaveProperty("scopeName");
		expect(body.scopeName).toBe("Factory");
	});

	// AV3 amendment A1 — practice → role label
	test("practice item with known role scopeId returns role label (product_manager → 'Product Manager')", async ({
		db,
		app,
	}) => {
		const id = await createKnowledgeItem(db, {
			scopeKind: "practice",
			scopeId: "product_manager",
		});
		const res = await app.request(`/api/knowledge/${id}`, { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.scopeName).toBe("Product Manager");
	});

	test("practice item with unknown role scopeId returns title-cased label (growth_hacker → 'Growth Hacker')", async ({
		db,
		app,
	}) => {
		const id = await createKnowledgeItem(db, {
			scopeKind: "practice",
			scopeId: "growth_hacker",
		});
		const res = await app.request(`/api/knowledge/${id}`, { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.scopeName).toBe("Growth Hacker");
	});

	// AU26 F2 (founder ruling): the `filesystem` scope kind is DELETED. An item
	// carrying the string is an unknown kind now — it resolves through the shared
	// fallback, and the route never reads `filesystems` to name it.
	test("a filesystem-scoped item resolves through the unknown-kind fallback", async ({
		db,
		app,
	}) => {
		const teamId = crypto.randomUUID();
		await db.insert(teams).values({
			id: teamId,
			name: "FS Team",
			phase: "active",
			createdAt: new Date().toISOString(),
		});
		const fsId = crypto.randomUUID();
		await db.insert(filesystems).values({
			id: fsId,
			teamId,
			source: "github",
			kind: "code",
			resourceRef: JSON.stringify({ kind: "code", repo: "owner/nimmly", branch: "main" }),
			writeback: "git",
			state: "attached",
			createdAt: new Date().toISOString(),
		});
		const id = await createKnowledgeItem(db, {
			scopeKind: "filesystem",
			scopeId: fsId,
		});
		const res = await app.request(`/api/knowledge/${id}`, { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.scopeName).toBe("Shared");
	});
});
