/**
 * AD7 RED — Search backend integration tests.
 *
 * AC-1: Cmd+K search returns grouped results from conversations, bets, and knowledge items.
 * AC-2: Results are clickable and navigate to the correct detail page (correct IDs returned).
 * AC-3: Search within 300ms for interactive use.
 * AC-4: Empty queries return no results (not all items).
 * AC-5: "Search coming soon" empty state no longer appears (backend returns real results).
 *
 * Test cases:
 * TC-1:  Returns 400 for missing `q` parameter
 * TC-2:  Returns 400 for empty/whitespace query
 * TC-3:  Returns empty results for non-matching query
 * TC-4:  Returns matching conversations (thread + message match)
 * TC-5:  Excludes conversations where user is not a participant (AUTH BOUNDARY)
 * TC-6:  Returns matching work items (bets with team name)
 * TC-7:  Returns matching knowledge items
 * TC-8:  Excludes user-scoped knowledge from other users (AUTH BOUNDARY)
 * TC-9:  Returns results across all three categories
 * TC-10: Limits results to 5 per category
 * TC-11: Escapes LIKE wildcards in query (security)
 * TC-12: Rejects overly long query (>200 chars)
 */

import {
	type HyperIdleDb,
	knowledgeAppProjection,
	knowledgeItems,
	messages,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-ad7-search";
const NOW = new Date().toISOString();

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

/** Seed a user row — required as sender for messages FK */
async function seedUser(db: HyperIdleDb, id: string): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "human",
		name: `User ${id}`,
		role: "founder",
		status: "active",
		createdAt: NOW,
	});
}

/** Seed a thread with a first message that provides the title */
async function seedThread(
	db: HyperIdleDb,
	opts: {
		threadId: string;
		senderId: string;
		hostKind: string;
		hostId: string;
		/** participants JSON string array containing the userId who will query */
		participants: string;
		firstMessageText: string;
		latestMessageText?: string;
	},
): Promise<void> {
	await db.insert(threads).values({
		id: opts.threadId,
		hostKind: opts.hostKind,
		hostId: opts.hostId,
		initiatorId: opts.senderId,
		participants: opts.participants,
		lastActiveAt: NOW,
		createdAt: NOW,
	});

	// First message — title source
	await db.insert(messages).values({
		id: `${opts.threadId}-msg-1`,
		senderId: opts.senderId,
		threadId: opts.threadId,
		type: "plain",
		payload: JSON.stringify({ text: opts.firstMessageText }),
		clientKey: `${opts.threadId}-ck-1`,
		createdAt: NOW,
	});

	if (opts.latestMessageText) {
		// Latest message — snippet source (later createdAt)
		const laterNow = new Date(Date.now() + 1000).toISOString();
		await db.insert(messages).values({
			id: `${opts.threadId}-msg-2`,
			senderId: opts.senderId,
			threadId: opts.threadId,
			type: "plain",
			payload: JSON.stringify({ text: opts.latestMessageText }),
			clientKey: `${opts.threadId}-ck-2`,
			createdAt: laterNow,
		});
	}
}

/** Seed a team + teamMembers row (required as FK for bets) */
async function seedTeam(db: HyperIdleDb, teamId: string, teamName: string): Promise<void> {
	await db.insert(teams).values({
		id: teamId,
		name: teamName,
		phase: "build",
		createdAt: NOW,
	});
}

/** Seed a root task (replaces seedBet — BB1) */
async function seedRootTask(
	db: HyperIdleDb,
	taskId: string,
	teamId: string,
	title: string,
	_state = "in_progress",
): Promise<void> {
	await db.insert(tasks).values({
		id: taskId,
		parentTaskId: null,
		teamId,
		title,
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

/** Seed a knowledge item with optional fabric row */
async function seedKnowledgeItem(
	db: HyperIdleDb,
	opts: {
		id: string;
		title: string;
		body: string;
		scopeKind: string;
		updatedBy: string;
		status?: string;
	},
): Promise<void> {
	await db.insert(knowledgeItems).values({
		id: opts.id,
		title: opts.title,
		body: opts.body,
		format: "markdown",
		status: opts.status ?? "active",
		scopeKind: opts.scopeKind,
		updatedBy: opts.updatedBy,
		version: 1,
		createdAt: NOW,
		updatedAt: NOW,
	});
	// The owner writes the projection row alongside the item.
	await db
		.insert(knowledgeAppProjection)
		.values({ id: `${opts.id}-projection`, knowledgeItemId: opts.id });
}

// ─── TC-1: Missing `q` parameter returns 400 ────────────────────────────────

describe("GET /api/search — AD7 search backend", () => {
	test("TC-1: returns 400 when q parameter is missing", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/search", { headers: authHeaders() });
		expect(res.status).toBe(400);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.error).toBeTruthy();
		vi.unstubAllEnvs();
	});

	// ─── TC-2: Empty / whitespace query returns 400 ─────────────────────────

	test("TC-2: returns 400 for empty query string", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/search?q=", { headers: authHeaders() });
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	test("TC-2: returns 400 for whitespace-only query", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/search?q=%20%20%20", { headers: authHeaders() });
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	// ─── TC-3: Non-matching query returns empty results ──────────────────────

	test("TC-3: returns empty grouped results for non-matching query", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/search?q=xyzzy_no_match_ever", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			conversations: unknown[];
			work: unknown[];
			knowledge: unknown[];
		};
		expect(body.conversations).toHaveLength(0);
		expect(body.work).toHaveLength(0);
		expect(body.knowledge).toHaveLength(0);
		vi.unstubAllEnvs();
	});

	// ─── TC-4: Matching conversations ───────────────────────────────────────

	test("TC-4: returns matching conversations with id, title, snippet, timestamp, kind", async ({
		app,
		db,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		// The auth middleware resolves userId from the API key. When using the
		// stateless fallback (no db user lookup), userId defaults to "api-key-user".
		// We include that ID in participants so the thread passes the auth boundary.
		const userId = "api-key-user";
		await seedUser(db, userId);
		await seedThread(db, {
			threadId: "th-conv-1",
			senderId: userId,
			hostKind: "user",
			hostId: userId,
			participants: JSON.stringify([userId]),
			firstMessageText: "Planning the widget deployment",
			latestMessageText: "Deployment is ready for review",
		});

		const res = await app.request("/api/search?q=widget+deployment", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			conversations: Array<{
				id: string;
				title: string;
				snippet: string;
				timestamp: string;
				kind: "review" | "chat";
			}>;
			work: unknown[];
			knowledge: unknown[];
		};

		expect(body.conversations).toHaveLength(1);
		const conv = body.conversations[0];
		expect(conv).toBeDefined();
		expect(conv?.id).toBe("th-conv-1");
		expect(conv?.title).toBeTruthy();
		expect(conv?.snippet).toBeTruthy();
		expect(conv?.timestamp).toBeTruthy();
		expect(["review", "chat"]).toContain(conv?.kind);
		vi.unstubAllEnvs();
	});

	// ─── TC-5: Auth boundary — excludes conversations where user is not a participant

	test("TC-5: excludes conversations where current user is not a participant", async ({
		app,
		db,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const userId = "api-key-user";
		const otherUserId = "other-user-999";
		await seedUser(db, userId);
		await seedUser(db, otherUserId);

		// Thread owned by otherUser — userId not in participants
		await seedThread(db, {
			threadId: "th-excluded",
			senderId: otherUserId,
			hostKind: "user",
			hostId: otherUserId,
			participants: JSON.stringify([otherUserId]),
			firstMessageText: "Secret planning document alpha",
		});

		const res = await app.request("/api/search?q=Secret+planning+document", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { conversations: unknown[] };
		// The thread exists in DB but user is not a participant — must not appear
		expect(body.conversations).toHaveLength(0);
		vi.unstubAllEnvs();
	});

	// ─── TC-6: Matching work items (root tasks with team name) ────────────────

	test("TC-6: returns matching root tasks with id, title, team name, status", async ({
		app,
		db,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		await seedTeam(db, "team-a", "Alpha Team");
		await seedRootTask(db, "task-search-1", "team-a", "Deploy the authentication module");

		const res = await app.request("/api/search?q=authentication+module", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			work: Array<{ id: string; title: string; team: string; status: string }>;
		};

		expect(body.work).toHaveLength(1);
		const workItem = body.work[0];
		expect(workItem).toBeDefined();
		expect(workItem?.id).toBe("task-search-1");
		expect(workItem?.title).toBe("Deploy the authentication module");
		expect(workItem?.team).toBe("Alpha Team");
		expect(workItem?.status).toBe("in_progress");
		vi.unstubAllEnvs();
	});

	// ---------------------------------------------------------------------
	// A `killed` root task must still be findable here. Excluding killed tasks
	// from the DEPENDENCY PICKER (`GET /api/tasks?q=`, covered by
	// `task-search.integration.test.ts`) put the exclusion in the shared
	// `work.list(..., { text })` primitive that this route also calls — so
	// killing a task made it vanish from global search too, even though
	// `status: row.state` below exists specifically to show state, killed
	// included.
	// ---------------------------------------------------------------------
	test("a killed root task is still returned by global search", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		await seedTeam(db, "team-killed", "Killed Team");
		await db.insert(tasks).values({
			id: "task-search-killed",
			parentTaskId: null,
			teamId: "team-killed",
			title: "Retired payments migration",
			state: "killed",
			createdAt: NOW,
			updatedAt: NOW,
		});

		const res = await app.request("/api/search?q=payments+migration", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			work: Array<{ id: string; status: string }>;
		};

		expect(body.work.map((w) => w.id)).toContain("task-search-killed");
		const workItem = body.work.find((w) => w.id === "task-search-killed");
		expect(workItem?.status).toBe("killed");
		vi.unstubAllEnvs();
	});

	// ─── TC-7: Matching knowledge items ──────────────

	test("TC-7: returns matching knowledge items with id, title, status, timestamp", async ({
		app,
		db,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const userId = "api-key-user";
		await seedUser(db, userId);
		await seedKnowledgeItem(db, {
			id: "ki-search-1",
			title: "Onboarding checklist for new engineers",
			body: "Step 1: Read the docs",
			scopeKind: "factory",
			updatedBy: userId,
		});

		const res = await app.request("/api/search?q=onboarding+checklist", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			knowledge: Array<{
				id: string;
				title: string;
				status: string;
				timestamp: string;
			}>;
		};

		expect(body.knowledge).toHaveLength(1);
		const ki = body.knowledge[0];
		expect(ki).toBeDefined();
		expect(ki?.id).toBe("ki-search-1");
		expect(ki?.title).toContain("Onboarding");
		expect(ki?.status).toBe("active");
		expect(ki?.timestamp).toBeTruthy();
		vi.unstubAllEnvs();
	});

	// ─── TC-8: Auth boundary — excludes user-scoped knowledge from other users

	test("TC-8: excludes user-scoped knowledge items belonging to another user", async ({
		app,
		db,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const userId = "api-key-user";
		const otherUserId = "other-ki-user";
		await seedUser(db, userId);
		await seedUser(db, otherUserId);

		// Private knowledge item owned by another user
		await seedKnowledgeItem(db, {
			id: "ki-private-1",
			title: "Private note about secret strategy",
			body: "Do not share",
			scopeKind: "user",
			updatedBy: otherUserId,
		});

		const res = await app.request("/api/search?q=Private+note+about+secret", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { knowledge: unknown[] };
		// The item exists in DB but belongs to another user's private scope — must not appear
		expect(body.knowledge).toHaveLength(0);
		vi.unstubAllEnvs();
	});

	// ─── TC-9: Cross-category results ────────────────────────────────────────

	test("TC-9: returns results across all three categories for a broad query", async ({
		app,
		db,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const userId = "api-key-user";
		await seedUser(db, userId);

		// Conversation matching "release"
		await seedThread(db, {
			threadId: "th-release",
			senderId: userId,
			hostKind: "bet",
			hostId: "bet-release-1",
			participants: JSON.stringify([userId]),
			firstMessageText: "Release planning discussion",
		});

		// Root task matching "release" (BB1)
		await seedTeam(db, "team-b", "Beta Team");
		await seedRootTask(db, "task-release-1", "team-b", "Release the v2 feature");

		// Knowledge matching "release"
		await seedKnowledgeItem(db, {
			id: "ki-release-1",
			title: "Release process guide",
			body: "How to do releases",
			scopeKind: "factory",
			updatedBy: userId,
		});

		const res = await app.request("/api/search?q=release", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			conversations: unknown[];
			work: unknown[];
			knowledge: unknown[];
		};

		expect(body.conversations.length).toBeGreaterThanOrEqual(1);
		expect(body.work.length).toBeGreaterThanOrEqual(1);
		expect(body.knowledge.length).toBeGreaterThanOrEqual(1);
		vi.unstubAllEnvs();
	});

	// ─── TC-10: 5 result cap per category ────────────────────────────────────

	test("TC-10: limits results to 5 per category even when more matches exist", async ({
		app,
		db,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const userId = "api-key-user";
		await seedUser(db, userId);
		await seedTeam(db, "team-cap", "Cap Team");

		// Seed 7 root tasks that all match "captest" (BB1)
		for (let i = 1; i <= 7; i++) {
			await seedRootTask(db, `task-cap-${i}`, "team-cap", `Captest task number ${i}`);
		}

		const res = await app.request("/api/search?q=Captest", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { work: unknown[] };
		expect(body.work.length).toBeLessThanOrEqual(5);
		vi.unstubAllEnvs();
	});

	// ─── TC-11: LIKE wildcard escaping ───────────────────────────────────────

	test("TC-11: escapes LIKE wildcards so % does not match all rows", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const userId = "api-key-user";
		await seedUser(db, userId);
		await seedTeam(db, "team-escape", "Escape Team");

		// Root task that should NOT match a query of "%" (wildcard) — BB1
		await seedRootTask(db, "task-escape-1", "team-escape", "Unrelated task title");

		// Query with raw `%` — must not match all rows
		const res = await app.request("/api/search?q=%25", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { work: unknown[] };
		// "%" should match items literally containing "%" in title
		// "Unrelated task title" does NOT contain "%" — so it must not be returned
		expect(body.work).toHaveLength(0);
		vi.unstubAllEnvs();
	});

	test("TC-11: escapes LIKE wildcards so _ does not match single characters", async ({
		app,
		db,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const userId = "api-key-user";
		await seedUser(db, userId);
		await seedTeam(db, "team-escape2", "Escape Team 2");

		// Seed tasks — BB1: root tasks instead of bets
		await seedRootTask(db, "task-escape-2", "team-escape2", "Short task title");
		await seedRootTask(db, "task-escape-3", "team-escape2", "Longer task title here");

		// Query "_" — should match literal underscore, not any single char
		const res = await app.request("/api/search?q=_", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { work: unknown[] };
		// Neither task title contains literal "_" → 0 results
		expect(body.work).toHaveLength(0);
		vi.unstubAllEnvs();
	});

	// ─── TC-12: Query too long (>200 chars) returns 400 ─────────────────────

	test("TC-12: rejects queries longer than 200 characters with 400", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const longQuery = "a".repeat(201);
		const res = await app.request(`/api/search?q=${encodeURIComponent(longQuery)}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	test("TC-12: accepts queries of exactly 200 characters", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const maxQuery = "a".repeat(200);
		const res = await app.request(`/api/search?q=${encodeURIComponent(maxQuery)}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		vi.unstubAllEnvs();
	});
});
