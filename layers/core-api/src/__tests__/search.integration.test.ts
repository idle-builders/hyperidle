/**
 * Search backend integration tests.
 */

import { documents, type HyperIdleDb, messages, tasks, teams, threads, users } from "@hyperidle/db";
import { describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-search";
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
		createdAt: NOW,
	});
}

/** Seed a root task (replaces seedBet) */
async function seedRootTask(
	db: HyperIdleDb,
	taskId: string,
	teamId: string,
	title: string,
	_state = "in_progress",
): Promise<void> {
	await db.insert(threads).values({
		id: `thr-${taskId}`,
		hostKind: "team",
		hostId: teamId,
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		threadId: `thr-${taskId}`,
		id: taskId,
		parentTaskId: null,
		teamId,
		title,
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

/** Seed a document with optional fabric row */
async function seedDocument(
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
	await db.insert(documents).values({
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
}

describe("GET /api/search — search backend", () => {
	test("returns 400 when q parameter is missing", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/search", { headers: authHeaders() });
		expect(res.status).toBe(400);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.error).toBeTruthy();
		vi.unstubAllEnvs();
	});

	test("returns 400 for empty query string", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/search?q=", { headers: authHeaders() });
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	test("returns 400 for whitespace-only query", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/search?q=%20%20%20", { headers: authHeaders() });
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	test("returns empty grouped results for non-matching query", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/search?q=xyzzy_no_match_ever", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			conversations: unknown[];
			work: unknown[];
			documents: unknown[];
		};
		expect(body.conversations).toHaveLength(0);
		expect(body.work).toHaveLength(0);
		expect(body.documents).toHaveLength(0);
		vi.unstubAllEnvs();
	});

	test("a matching conversation shows the message that matched, not its latest", async ({
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
			conversations: Array<{ id: string; title: string; snippet: string; at: string }>;
			work: unknown[];
			documents: unknown[];
		};

		expect(body.conversations).toHaveLength(1);
		const conv = body.conversations[0];
		expect(conv).toBeDefined();
		expect(conv?.id).toBe("th-conv-1");
		expect(conv?.title).toBe("Planning the widget deployment");
		expect(conv?.snippet).toBe("Planning the widget deployment");
		expect(conv?.at).toBe(NOW);
		vi.unstubAllEnvs();
	});

	test("excludes conversations where current user is not a participant", async ({ app, db }) => {
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

	test("a matching root task names its team", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		await seedTeam(db, "team-a", "Alpha Team");
		await seedRootTask(db, "task-search-1", "team-a", "Deploy the authentication module");

		const res = await app.request("/api/search?q=authentication+module", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			work: Array<{ id: string; title: string; team: string; snippet: string }>;
		};

		expect(body.work).toHaveLength(1);
		const workItem = body.work[0];
		expect(workItem).toBeDefined();
		expect(workItem?.id).toBe("task-search-1");
		expect(workItem?.title).toBe("Deploy the authentication module");
		expect(workItem?.team).toBe("Alpha Team");
		expect(workItem?.snippet).toBe("Deploy the authentication module");
		vi.unstubAllEnvs();
	});

	// ---------------------------------------------------------------------
	// A `killed` root task must still be findable here. This route shares the
	// `work.list(..., { text })` primitive with the DEPENDENCY PICKER (`GET
	// /api/tasks?q=`, covered by `task-search.integration.test.ts`), which
	// excludes killed tasks — excluding `killed` unconditionally in that
	// shared primitive would also hide it here.
	// ---------------------------------------------------------------------
	test("a killed root task is still returned by global search", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		await seedTeam(db, "team-killed", "Killed Team");
		await db.insert(threads).values({
			id: `thr-${"task-search-killed"}`,
			hostKind: "team",
			hostId: "team-killed",
			initiatorId: "system:propagation",
			participants: "[]",
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			threadId: `thr-${"task-search-killed"}`,
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
			work: Array<{ id: string }>;
		};

		expect(body.work.map((w) => w.id)).toContain("task-search-killed");
		vi.unstubAllEnvs();
	});

	test("a matching document shows the stretch of its body that matched", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const userId = "api-key-user";
		await seedUser(db, userId);
		await seedDocument(db, {
			id: "ki-search-1",
			title: "Onboarding checklist for new engineers",
			body: "Step 1: Read the docs",
			scopeKind: "factory",
			updatedBy: userId,
		});

		const res = await app.request("/api/search?q=read+the+docs", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			documents: Array<{ id: string; title: string; snippet: string }>;
		};

		expect(body.documents).toHaveLength(1);
		const doc = body.documents[0];
		expect(doc).toBeDefined();
		expect(doc?.id).toBe("ki-search-1");
		expect(doc?.title).toContain("Onboarding");
		expect(doc?.snippet).toBe("Step 1: Read the docs");
		vi.unstubAllEnvs();
	});

	test("excludes user-scoped documents belonging to another user", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const userId = "api-key-user";
		const otherUserId = "other-ki-user";
		await seedUser(db, userId);
		await seedUser(db, otherUserId);

		// Private document owned by another user
		await seedDocument(db, {
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
		const body = (await res.json()) as { documents: unknown[] };
		// The item exists in DB but belongs to another user's private scope — must not appear
		expect(body.documents).toHaveLength(0);
		vi.unstubAllEnvs();
	});

	test("returns results across all three categories for a broad query", async ({ app, db }) => {
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

		// Root task matching "release"
		await seedTeam(db, "team-b", "Beta Team");
		await seedRootTask(db, "task-release-1", "team-b", "Release the v2 feature");

		// Documents matching "release"
		await seedDocument(db, {
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
			documents: unknown[];
		};

		expect(body.conversations.length).toBeGreaterThanOrEqual(1);
		expect(body.work.length).toBeGreaterThanOrEqual(1);
		expect(body.documents.length).toBeGreaterThanOrEqual(1);
		vi.unstubAllEnvs();
	});

	test("limits results to 5 per category even when more matches exist", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const userId = "api-key-user";
		await seedUser(db, userId);
		await seedTeam(db, "team-cap", "Cap Team");

		// Seed 7 root tasks that all match "captest"
		for (let i = 1; i <= 7; i++) {
			await seedRootTask(db, `task-cap-${i}`, "team-cap", `Captest task number ${i}`);
		}

		const res = await app.request("/api/search?q=Captest", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { work: unknown[] };
		expect(body.work.length).toBeLessThanOrEqual(5);
		vi.unstubAllEnvs();
	});

	test("escapes LIKE wildcards so % does not match all rows", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const userId = "api-key-user";
		await seedUser(db, userId);
		await seedTeam(db, "team-escape", "Escape Team");

		// Root task that should NOT match a query of "%" (wildcard)
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

	test("escapes LIKE wildcards so _ does not match single characters", async ({ app, db }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

		const userId = "api-key-user";
		await seedUser(db, userId);
		await seedTeam(db, "team-escape2", "Escape Team 2");

		// Seed tasks
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

	test("rejects queries longer than 200 characters with 400", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const longQuery = "a".repeat(201);
		const res = await app.request(`/api/search?q=${encodeURIComponent(longQuery)}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	test("accepts queries of exactly 200 characters", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const maxQuery = "a".repeat(200);
		const res = await app.request(`/api/search?q=${encodeURIComponent(maxQuery)}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		vi.unstubAllEnvs();
	});
});
