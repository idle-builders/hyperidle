import {
	bets,
	type HyperIdleDb,
	items,
	routines,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-e2e";

function auth(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedBase(
	db: HyperIdleDb,
	ids: ScopedIds,
): Promise<{ teamId: string; memberId: string; agentId: string }> {
	const teamId = ids("prod-1");
	const memberId = ids("team-1");
	const agentId = ids("agent-1");
	await db.insert(teams).values({
		id: teamId,
		name: "E2E Product",
		phase: "build",
		createdAt: new Date().toISOString(),
	});

	await db.insert(teamMembers).values({
		id: memberId,
		teamId: teamId,
		capacity: 5,
		activeBets: 0,
		formedAt: new Date().toISOString(),
	});

	await db.insert(users).values([
		{
			id: agentId,
			// AF11: kind='human' so auth middleware resolves this user as the principal.
			// GET /api/users/:id/inbox is self-only (AC5); the resolved principal must
			// match the inbox owner. All seedBase tests resolve principal = agentId.
			kind: "human",
			name: "Test Agent",
			role: "builder",
			status: "active",
			teamId: memberId,
			createdAt: new Date().toISOString(),
		},
		// L1a: synthetic sender for verdict-typed messages emitted by
		// the legacy `POST /responses` route (plan §6.4 wraps the new
		// repo path). The new `messages.sender_id` FK requires the
		// row to exist.
		{
			id: ids("policy_engine"),
			name: "Policy Engine",
			role: "system",
			status: "active",
			createdAt: new Date().toISOString(),
		},
	]);
	return { teamId, memberId, agentId };
}

async function seedTaskData(
	db: HyperIdleDb,
	ids: ScopedIds,
): Promise<{ betId: string; taskId: string }> {
	// @lore U1: teamId references `teams` domain entity (not teamMembers).
	const betId = ids("bet-1");
	const taskId = ids("task-1");
	await db.insert(bets).values({
		id: betId,
		teamId: ids("prod-1"),
		description: "Test bet",
		status: "active",
		createdAt: new Date().toISOString(),
	});

	await db.insert(tasks).values({
		id: taskId,
		betId: betId,
		teamId: ids("prod-1"),
		title: "Task A",
		state: "proposed",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	});
	return { betId, taskId };
}

async function seedConversationData(
	db: HyperIdleDb,
	ids: ScopedIds,
): Promise<{ threadId: string; itemId: string }> {
	const threadId = ids("thread-1");
	const itemId = ids("item-1");
	await db.insert(threads).values({
		id: threadId,
		hostKind: "task",
		hostId: ids("task-1"),
		initiatorId: ids("agent-1"),
		participants: JSON.stringify([ids("agent-1")]),
		lastActiveAt: new Date().toISOString(),
		createdAt: new Date().toISOString(),
	});

	await db.insert(items).values({
		id: itemId,
		title: "E2E item",
		threadId: threadId,
		createdAt: new Date().toISOString(),
	});
	return { threadId, itemId };
}

async function seedSessionData(
	db: HyperIdleDb,
	ids: ScopedIds,
): Promise<{ betId: string; taskId: string }> {
	// @lore U1: teamId references `teams` domain entity (not teamMembers).
	const betId = ids("bet-s");
	const taskId = ids("task-s");
	await db.insert(bets).values({
		id: betId,
		teamId: ids("prod-1"),
		description: "Session bet",
		status: "active",
		createdAt: new Date().toISOString(),
	});

	await db.insert(tasks).values({
		id: taskId,
		betId: betId,
		teamId: ids("prod-1"),
		title: "Session task",
		state: "in_progress",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	});
	return { betId, taskId };
}

async function seedRoutineData(db: HyperIdleDb, ids: ScopedIds): Promise<{ routineId: string }> {
	const routineId = ids("routine-1");
	await db.insert(routines).values({
		id: routineId,
		name: "Test routine",
		teamId: ids("prod-1"),
		state: "active",
		ownerAgentId: ids("agent-1"),
		triggerType: "heartbeat",
		triggerConfig: JSON.stringify({ intervalMs: 60000 }),
		autonomyLevel: 2,
		active: true,
	});
	return { routineId };
}

describe("E2E API Integration (I5)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// -------------------------------------------------------
	// 1. Auth enforcement
	// -------------------------------------------------------
	describe("Auth enforcement", () => {
		test("returns 401 when X-API-Key header is missing", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			const res = await app.request("/api/bets");
			expect(res.status).toBe(401);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("UNAUTHORIZED");
		});

		test("returns 401 when X-API-Key header is wrong", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			const res = await app.request("/api/bets", {
				headers: { "X-API-Key": "wrong-key" },
			});
			expect(res.status).toBe(401);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("UNAUTHORIZED");
		});

		test("allows access with correct API key", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			const res = await app.request("/api/bets", { headers: auth() });
			expect(res.status).toBe(200);
		});
	});

	// -------------------------------------------------------
	// 2. Health
	// -------------------------------------------------------
	describe("Health", () => {
		test("GET /health returns ok without auth (backward compat)", async ({ app }) => {
			const res = await app.request("/health");
			expect(res.status).toBe(200);
			const body = (await res.json()) as { status: string };
			expect(body.status).toBe("ok");
		});

		test("GET /api/health returns ok without auth", async ({ app }) => {
			const res = await app.request("/api/health");
			expect(res.status).toBe(200);
			const body = (await res.json()) as { status: string };
			expect(body.status).toBe("ok");
		});
	});

	// -------------------------------------------------------
	// 3. Bets
	// -------------------------------------------------------
	describe("Bets", () => {
		// @lore U1: teamId references `teams` domain entity; status "draft" replaces "shaped".
		test("POST /api/bets creates a shaped bet and GET /api/bets lists it", async ({
			db,
			app,
			ids,
		}) => {
			const scope = await seedBase(db, ids);
			const createRes = await app.request("/api/bets", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId: scope.teamId,
					description: "E2E integration bet",
				}),
			});
			expect(createRes.status).toBe(201);
			const created = (await createRes.json()) as { id: string; status: string };
			expect(created.status).toBe("draft");

			const listRes = await app.request("/api/bets", { headers: auth() });
			expect(listRes.status).toBe(200);
			const list = (await listRes.json()) as { draft: Array<{ id: string }> };
			expect(list.draft.some((b) => b.id === created.id)).toBe(true);
		});

		test("POST /api/bets returns 400 for missing required fields", async ({ db, app, ids }) => {
			const scope = await seedBase(db, ids);
			const res = await app.request("/api/bets", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({ productId: scope.teamId }),
			});
			expect(res.status).toBe(400);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("VALIDATION_ERROR");
		});

		test("GET /api/bets/:id returns 404 for nonexistent bet", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			const res = await app.request(`/api/bets/${ids("nonexistent")}`, { headers: auth() });
			expect(res.status).toBe(404);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("NOT_FOUND");
		});

		test("GET /api/bets/canvas returns canvas data", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			const res = await app.request("/api/bets/canvas", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				shaped: unknown[];
				committed: unknown[];
				capacity: { used: number; max: number };
			};
			expect(body.capacity.max).toBe(5);
		});

		// @lore U1: commit transitions draft→active (formerly shaped→committed).
		test("POST /api/bets/:id/commit transitions a shaped bet to committed", async ({
			db,
			app,
			ids,
		}) => {
			const scope = await seedBase(db, ids);
			// Create a draft bet first
			const createRes = await app.request("/api/bets", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					teamId: scope.teamId,
					description: "Bet to commit",
				}),
			});
			expect(createRes.status).toBe(201);
			const created = (await createRes.json()) as { id: string; status: string };
			expect(created.status).toBe("draft");

			// Commit the bet (transitions draft→active)
			const commitRes = await app.request(`/api/bets/${created.id}/commit`, {
				method: "POST",
				headers: auth(),
			});
			expect(commitRes.status).toBe(200);
			const committed = (await commitRes.json()) as { id: string; status: string };
			expect(committed.id).toBe(created.id);
			// @lore U1: status "active" replaces "committed"
			expect(committed.status).toBe("active");
		});
	});

	// -------------------------------------------------------
	// 4. Tasks
	// -------------------------------------------------------
	describe("Tasks", () => {
		test("GET /api/tasks lists all tasks", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			await seedTaskData(db, ids);
			const res = await app.request("/api/tasks", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as Array<{ id: string }>;
			expect(body.length).toBeGreaterThanOrEqual(1);
		});

		test("GET /api/tasks?bet_id=bet-1 filters by bet", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			const taskScope = await seedTaskData(db, ids);
			const res = await app.request(`/api/tasks?bet_id=${taskScope.betId}`, {
				headers: auth(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as Array<{ betId: string }>;
			expect(body.every((t) => t.betId === taskScope.betId)).toBe(true);
		});

		test("PATCH /api/tasks/:id updates task fields", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			const taskScope = await seedTaskData(db, ids);
			const res = await app.request(`/api/tasks/${taskScope.taskId}`, {
				method: "PATCH",
				headers: auth(),
				body: JSON.stringify({ title: "Updated Title" }),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { title: string };
			expect(body.title).toBe("Updated Title");
		});

		test("PATCH /api/tasks/:id returns 404 for nonexistent task", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			await seedTaskData(db, ids);
			const res = await app.request(`/api/tasks/${ids("nonexistent")}`, {
				method: "PATCH",
				headers: auth(),
				body: JSON.stringify({ title: "X" }),
			});
			expect(res.status).toBe(404);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("NOT_FOUND");
		});

		test("POST /api/tasks/:id/transition transitions task state", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			const taskScope = await seedTaskData(db, ids);
			// proposed -> accepted is a valid transition
			const res = await app.request(`/api/tasks/${taskScope.taskId}/transition`, {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({ state: "accepted" }),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { state: string };
			expect(body.state).toBe("accepted");
		});

		test("POST /api/tasks/:id/transition returns 400 for invalid state", async ({
			db,
			app,
			ids,
		}) => {
			await seedBase(db, ids);
			const taskScope = await seedTaskData(db, ids);
			const res = await app.request(`/api/tasks/${taskScope.taskId}/transition`, {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({ state: "invalid_state" }),
			});
			expect(res.status).toBe(400);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("VALIDATION_ERROR");
		});
	});

	// -------------------------------------------------------
	// 5. Conversations
	// -------------------------------------------------------
	describe("Conversations", () => {
		test("GET /api/conversations lists threads", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			await seedTaskData(db, ids);
			await seedConversationData(db, ids);
			const res = await app.request("/api/conversations", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				threads: unknown[];
				pagination: { total: number };
			};
			expect(body.pagination.total).toBeGreaterThanOrEqual(1);
		});

		test("GET /api/conversations/:threadId returns thread with items", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			await seedTaskData(db, ids);
			const convScope = await seedConversationData(db, ids);
			const res = await app.request(`/api/conversations/${convScope.threadId}`, {
				headers: auth(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { id: string; items: unknown[] };
			expect(body.id).toBe(convScope.threadId);
			expect(body.items.length).toBeGreaterThanOrEqual(1);
		});

		test("POST /api/conversations/items creates an item", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			await seedTaskData(db, ids);
			const convScope = await seedConversationData(db, ids);
			const res = await app.request("/api/conversations/items", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({ title: "New item", threadId: convScope.threadId }),
			});
			expect(res.status).toBe(201);
		});

		test("POST /api/threads/:id/messages records a verdict (canonical L1 surface)", async ({
			db,
			app,
			ids,
		}) => {
			// @lore AF11-IDOR: This test does NOT call seedBase because seedBase inserts
			// agent-1 as kind='human' (role='builder') which would be the auth principal.
			// A verdict requires a founder (not the review author). We seed our own users:
			// - founder-1: kind='human', role='founder' → auth principal for this test
			// - agent-1-e2e: non-human agent who sends the review (via X-Identity on POST /threads)
			const now = new Date().toISOString();
			const teamId = ids("prod-1");
			const memberId = ids("team-1");
			const betId = ids("bet-1");
			const taskId = ids("task-1");
			const founderId = ids("founder-1");
			const agentE2eId = ids("agent-1-e2e");
			await db
				.insert(teams)
				.values({ id: teamId, name: "E2E Product", phase: "build", createdAt: now });
			await db
				.insert(teamMembers)
				.values({ id: memberId, teamId: teamId, capacity: 5, activeBets: 0, formedAt: now });
			await db.insert(bets).values({
				id: betId,
				teamId: teamId,
				description: "Test bet",
				status: "active",
				createdAt: now,
			});
			await db.insert(tasks).values({
				id: taskId,
				betId: betId,
				teamId: teamId,
				title: "Task A",
				state: "proposed",
				createdAt: now,
				updatedAt: now,
			});

			// founder-1 inserted first (kind='human') → becomes auth principal
			await db.insert(users).values({
				id: founderId,
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				createdAt: now,
			});
			// agent-1-e2e: non-human, will be attributed review via X-Identity
			await db.insert(users).values({
				id: agentE2eId,
				name: "Agent",
				role: "builder",
				status: "active",
				createdAt: now,
			});

			const create = await app.request("/api/threads", {
				method: "POST",
				headers: auth({ "X-Identity": agentE2eId }),
				body: JSON.stringify({
					hostKind: "task",
					hostId: taskId,
					participants: [agentE2eId, founderId],
					initialMessage: {
						type: "review",
						clientKey: ids("init-r-e2e"),
						payload: {
							title: "E2E review",
							reasoning: ["needs verdict"],
							artifactRef: { id: ids("a-e2e"), kind: "text_diff" },
						},
					},
				}),
			});
			expect(create.status).toBe(201);
			const created = (await create.json()) as {
				thread: { id: string };
				messages: Array<{ id: string }>;
			};

			// founder-1 (auth principal, role='founder', NOT the review author) → 201
			const res = await app.request(`/api/threads/${created.thread.id}/messages`, {
				method: "POST",
				headers: auth(), // senderId = founder-1 (auth principal)
				body: JSON.stringify({
					type: "verdict",
					clientKey: ids("verdict-e2e"),
					payload: {
						decision: "approve",
						resolvesMessageId: created.messages[0]?.id ?? "",
					},
				}),
			});
			expect(res.status).toBe(201);
		});
	});

	// -------------------------------------------------------
	// 6. Knowledge
	// -------------------------------------------------------
	// @lore O2: Knowledge routes rewritten. Layer-based URL prefix removed.
	// New URL shape: POST /api/knowledge (create), GET /api/knowledge (list),
	// GET /api/knowledge/:id (get), GET /api/knowledge/search?q=... (search).
	describe("Knowledge", () => {
		test("GET /api/knowledge returns items list", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			const res = await app.request("/api/knowledge", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as { items: unknown[] };
			expect(Array.isArray(body.items)).toBe(true);
		});

		test("POST /api/knowledge creates a knowledge item (O2: no layer prefix)", async ({
			db,
			app,
			ids,
		}) => {
			const scope = await seedBase(db, ids);
			const res = await app.request("/api/knowledge", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					title: "Test decision",
					body: "We decided X",
					format: "markdown",
					scopeKind: "factory",
					updatedBy: scope.agentId,
				}),
			});
			expect(res.status).toBe(201);
			const body = (await res.json()) as { id: string; version: number };
			expect(body.id).toBeDefined();
			expect(body.version).toBe(1);
		});

		test("GET /api/knowledge/:id returns item by id (O2: no layer prefix)", async ({
			db,
			app,
			ids,
		}) => {
			const scope = await seedBase(db, ids);
			// Create an item first
			const createRes = await app.request("/api/knowledge", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					title: "Get-by-id test",
					body: "Content",
					format: "markdown",
					scopeKind: "factory",
					updatedBy: scope.agentId,
				}),
			});
			const created = (await createRes.json()) as { id: string };
			const res = await app.request(`/api/knowledge/${created.id}`, { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as { id: string; title: string };
			expect(body.id).toBe(created.id);
			expect(body.title).toBe("Get-by-id test");
		});

		test("GET /api/knowledge/search?q=test returns search results", async ({ db, app, ids }) => {
			const scope = await seedBase(db, ids);
			// First create a knowledge item so search has something to find
			await app.request("/api/knowledge", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					title: "Searchable decision",
					body: "This is a test item for search",
					format: "markdown",
					scopeKind: "factory",
					updatedBy: scope.agentId,
				}),
			});

			const res = await app.request("/api/knowledge/search?q=Searchable", {
				headers: auth(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { results: Array<{ title: string }> };
			expect(Array.isArray(body.results)).toBe(true);
			expect(body.results.length).toBeGreaterThanOrEqual(1);
			expect(body.results.some((r) => r.title === "Searchable decision")).toBe(true);
		});

		test("GET /api/knowledge/search requires query param q", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			const res = await app.request("/api/knowledge/search", { headers: auth() });
			expect(res.status).toBe(400);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("VALIDATION_ERROR");
		});
	});

	// -------------------------------------------------------
	// 7. Agents
	// -------------------------------------------------------
	describe("Agents", () => {
		// @lore AU26 J1: the per-user `activeSessions` count is gone — it was a raw
		// `sessions` read and the list's one consumer is typed `{id,name,role,teamId}`.
		test("GET /api/users lists agents", async ({ db, app, ids }) => {
			const scope = await seedBase(db, ids);
			const res = await app.request("/api/users", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as Array<{ id: string; name: string }>;
			expect(body.length).toBeGreaterThanOrEqual(1);
			expect(body.some((u) => u.id === scope.agentId)).toBe(true);
		});

		test("GET /api/users/:id returns agent detail", async ({ db, app, ids }) => {
			const scope = await seedBase(db, ids);
			const res = await app.request(`/api/users/${scope.agentId}`, { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as { id: string };
			expect(body.id).toBe(scope.agentId);
		});

		test("GET /api/users/:id returns 404 for unknown agent", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			const res = await app.request(`/api/users/${ids("nonexistent")}`, { headers: auth() });
			expect(res.status).toBe(404);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("NOT_FOUND");
		});

		test("GET /api/users/:id/inbox returns empty inbox", async ({ db, app, ids }) => {
			const scope = await seedBase(db, ids);
			const res = await app.request(`/api/users/${scope.agentId}/inbox`, {
				headers: auth(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { messages: unknown[]; total: number };
			expect(body.messages).toEqual([]);
			expect(body.total).toBe(0);
		});

		test("POST /api/users/:id/inbox sends message and returns 201", async ({ db, app, ids }) => {
			const scope = await seedBase(db, ids);
			// L1 step9 (Adv-C2): sender is derived from X-Identity, not the body.
			const res = await app.request(`/api/users/${scope.agentId}/inbox`, {
				method: "POST",
				headers: auth({ "X-Identity": scope.agentId }),
				body: JSON.stringify({ body: "Hello agent!" }),
			});
			expect(res.status).toBe(201);
			// L1a: messages now carry payload (JSON), not body/recipientId.
			// Recipient is derived from the thread.host_id (plan §5.3).
			const body = (await res.json()) as { senderId: string; payload: string };
			expect(body.senderId).toBe(scope.agentId);
			const payload = JSON.parse(body.payload) as { text?: string };
			expect(payload.text).toBe("Hello agent!");
		});
	});

	// -------------------------------------------------------
	// 8. Sessions
	// -------------------------------------------------------
	describe("Sessions", () => {
		test("GET /api/sessions returns session list", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			await seedSessionData(db, ids);
			const res = await app.request("/api/sessions", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as unknown[];
			expect(Array.isArray(body)).toBe(true);
		});

		test("POST /api/sessions creates a session and emits event", async ({
			db,
			app,
			eventBus,
			ids,
		}) => {
			const scope = await seedBase(db, ids);
			const sessionScope = await seedSessionData(db, ids);
			const events: unknown[] = [];
			eventBus.on("session_started", (e: unknown) => events.push(e));

			const res = await app.request("/api/sessions", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					agentId: scope.agentId,
					taskId: sessionScope.taskId,
					modelTier: "workhorse",
				}),
			});
			expect(res.status).toBe(201);
			const body = (await res.json()) as { id: string; state: string };
			expect(body.state).toBe("active");
			expect(events.length).toBe(1);
		});

		test("PATCH /api/sessions/:id ends a session", async ({ db, app, ids }) => {
			const scope = await seedBase(db, ids);
			const sessionScope = await seedSessionData(db, ids);
			// Create a session first
			const createRes = await app.request("/api/sessions", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					agentId: scope.agentId,
					taskId: sessionScope.taskId,
					modelTier: "fast",
				}),
			});
			const created = (await createRes.json()) as { id: string };

			const res = await app.request(`/api/sessions/${created.id}`, {
				method: "PATCH",
				headers: auth(),
				body: JSON.stringify({ state: "done" }),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { state: string; endedAt: string };
			expect(body.state).toBe("done");
			expect(body.endedAt).toBeTruthy();
		});

		test("PATCH /api/sessions/:id returns 404 for nonexistent session", async ({
			db,
			app,
			ids,
		}) => {
			await seedBase(db, ids);
			await seedSessionData(db, ids);
			const res = await app.request(`/api/sessions/${ids("nonexistent")}`, {
				method: "PATCH",
				headers: auth(),
				body: JSON.stringify({ state: "done" }),
			});
			expect(res.status).toBe(404);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("NOT_FOUND");
		});
	});

	// -------------------------------------------------------
	// 10. Status
	// -------------------------------------------------------
	describe("Status", () => {
		// @lore AU26 J1: `activeSessions` is gone from this response.
		test("GET /api/status returns factory-wide status", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			const res = await app.request("/api/status", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				agentStates: Record<string, number>;
				uptime: string;
			};
			expect(typeof body.uptime).toBe("string");
			expect(body.agentStates).toBeTypeOf("object");
		});

		test("GET /api/status/health returns authenticated health", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			const res = await app.request("/api/status/health", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as { status: string };
			expect(body.status).toBe("ok");
		});

		// @lore AU18: the generic `GET`/`PATCH /api/status/settings` catch-all is
		// retired along with `factorySettings` — every legitimate key it carried
		// now has a domain-specific route backed by `server_config`
		// (notifications config has its own route tests). No web
		// client depended on the raw-rows shape (confirmed via grep).

		test("GET /api/status/digest returns digest data", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			const res = await app.request("/api/status/digest", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as { items: unknown[]; generatedAt: string };
			expect(Array.isArray(body.items)).toBe(true);
			expect(typeof body.generatedAt).toBe("string");
		});
	});

	// -------------------------------------------------------
	// 11. Routines
	// -------------------------------------------------------
	describe("Routines", () => {
		test("GET /api/routines lists routines", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			await seedRoutineData(db, ids);
			const res = await app.request("/api/routines", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as Array<{ id: string }>;
			expect(body.length).toBeGreaterThanOrEqual(1);
		});

		test("PATCH /api/routines/:id updates routine", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			const routineScope = await seedRoutineData(db, ids);
			const res = await app.request(`/api/routines/${routineScope.routineId}`, {
				method: "PATCH",
				headers: auth(),
				body: JSON.stringify({ active: false }),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { active: boolean };
			expect(body.active).toBe(false);
		});

		test("POST /api/routines/:id/retire retires routine", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			const routineScope = await seedRoutineData(db, ids);
			const res = await app.request(`/api/routines/${routineScope.routineId}/retire`, {
				method: "POST",
				headers: auth(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { active: boolean };
			expect(body.active).toBe(false);
		});

		test("POST /api/routines/:id/retire returns 404 for unknown routine", async ({
			db,
			app,
			ids,
		}) => {
			await seedBase(db, ids);
			await seedRoutineData(db, ids);
			const res = await app.request(`/api/routines/${ids("nonexistent")}/retire`, {
				method: "POST",
				headers: auth(),
			});
			expect(res.status).toBe(404);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("NOT_FOUND");
		});
	});

	// -------------------------------------------------------
	// 12. Notifications
	// -------------------------------------------------------
	describe("Notifications", () => {
		test("GET /api/notifications returns resource descriptor", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			const res = await app.request("/api/notifications", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as { ok: boolean; resource: string };
			expect(body.ok).toBe(true);
			expect(body.resource).toBe("notifications");
		});

		test("GET /api/notifications/config returns notification config", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			const res = await app.request("/api/notifications/config", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as { enabled: boolean; primaryChannel: string };
			expect(typeof body.enabled).toBe("boolean");
			expect(typeof body.primaryChannel).toBe("string");
		});

		test("GET /api/notifications/queue returns queued notifications", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			const res = await app.request("/api/notifications/queue", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				status: string;
				count: number;
				rows: unknown[];
			};
			expect(body.status).toBe("pending");
			expect(Array.isArray(body.rows)).toBe(true);
		});

		test("GET /api/notifications/queue?status=invalid returns 400", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			const res = await app.request("/api/notifications/queue?status=invalid", {
				headers: auth(),
			});
			expect(res.status).toBe(400);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("VALIDATION_ERROR");
		});

		test("POST /api/notifications/test sends a test notification via console adapter", async ({
			db,
			app,
			ids,
		}) => {
			await seedBase(db, ids);
			const res = await app.request("/api/notifications/test", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({}),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { ok: boolean; channel: string };
			expect(body.ok).toBe(true);
			expect(body.channel).toBe("console");
		});
	});

	// -------------------------------------------------------
	// 14. 404 handling
	// -------------------------------------------------------
	describe("404 handling", () => {
		test("returns 404 JSON for unknown /api routes", async ({ db, app, ids }) => {
			await seedBase(db, ids);
			const res = await app.request("/api/nonexistent", { headers: auth() });
			expect(res.status).toBe(404);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("NOT_FOUND");
		});

		test("returns 404 text for unknown non-/api routes", async ({ app }) => {
			const res = await app.request("/nonexistent");
			expect(res.status).toBe(404);
		});
	});

	// -------------------------------------------------------
	// 15. Validation
	// -------------------------------------------------------
	describe("Request validation", () => {
		test("POST /api/sessions returns 400 for invalid modelTier", async ({ db, app, ids }) => {
			const scope = await seedBase(db, ids);
			const taskScope = await seedTaskData(db, ids);
			const res = await app.request("/api/sessions", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					agentId: scope.agentId,
					taskId: taskScope.taskId,
					modelTier: "invalid",
				}),
			});
			expect(res.status).toBe(400);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("VALIDATION_ERROR");
		});

		test("PATCH /api/routines/:id returns 404 for nonexistent routine", async ({
			db,
			app,
			ids,
		}) => {
			await seedBase(db, ids);
			const res = await app.request(`/api/routines/${ids("nonexistent")}`, {
				method: "PATCH",
				headers: auth(),
				body: JSON.stringify({ active: true }),
			});
			expect(res.status).toBe(404);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("NOT_FOUND");
		});
	});
});
