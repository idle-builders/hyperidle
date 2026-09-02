/**
 * A knowledge item can be created with a parent, and the parent is real.
 *
 * The parent slot landed with the attachment-slot strand, but only core-api's
 * own composition could ever write it — `POST /api/knowledge` did not accept
 * `parentKind`/`parentId` at all, and zod's object stripping meant a client
 * that sent them got a `201` with a null parent and no error. Silently
 * discarding the one field that says where a thing belongs is worse than
 * refusing it.
 *
 * Two kinds are accepted from a client: `task` and `thread`. The other three
 * (`knowledge_item`, `routine`, `agent`) are written only by core-api's own
 * routes, which already hold the parent row for other reasons.
 *
 * Existence is checked by the service that OWNS the parent's table — `work`
 * for a task, `conversation` for a thread — never by reading their tables
 * here. Both are already imported by this route, so this costs no new
 * coupling.
 */

import { type HyperIdleDb, knowledgeItems, tasks, teams, threads, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

// AC4/AC5: parented items must be excluded from the default list and
// retrievable via parentKind+parentId query params.

const TEST_API_KEY = "test-key-knowledge-parent";
const NOW = "2026-09-02T00:00:00.000Z";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function seedHosts(
	db: HyperIdleDb,
	prefix: string,
): Promise<{ taskId: string; threadId: string }> {
	const teamId = `${prefix}-team`;
	const userId = `${prefix}-user`;
	const taskId = `${prefix}-task`;
	const threadId = `${prefix}-thread`;

	await db.insert(teams).values({ id: teamId, name: teamId, phase: "build", createdAt: NOW });
	await db.insert(users).values({
		id: userId,
		kind: "human",
		name: "Founder",
		role: "founder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: taskId,
		parentTaskId: null,
		teamId,
		title: "Produce something",
		description: "d",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(threads).values({
		id: threadId,
		hostKind: "user",
		hostId: userId,
		initiatorId: userId,
		participants: JSON.stringify([userId]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});

	return { taskId, threadId };
}

function createBody(extra: Record<string, unknown>): string {
	return JSON.stringify({
		title: "Produced item",
		body: "# What the agent made",
		format: "markdown",
		updatedBy: "u-founder",
		scopeKind: "factory",
		...extra,
	});
}

describe("a knowledge item is created with a parent", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("hangs off a task that exists", async ({ db, app }) => {
		const { taskId } = await seedHosts(db, "kp-task");

		const res = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: createBody({ parentKind: "task", parentId: taskId }),
		});

		expect(res.status).toBe(201);
		const created = (await res.json()) as { id: string };

		const [row] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, created.id))
			.limit(1);

		expect(row?.parentKind).toBe("task");
		expect(row?.parentId).toBe(taskId);
	});

	test("hangs off a thread that exists", async ({ db, app }) => {
		const { threadId } = await seedHosts(db, "kp-thread");

		const res = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: createBody({ parentKind: "thread", parentId: threadId }),
		});

		expect(res.status).toBe(201);
		const created = (await res.json()) as { id: string };

		const [row] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, created.id))
			.limit(1);

		expect(row?.parentKind).toBe("thread");
		expect(row?.parentId).toBe(threadId);
	});

	test("is refused when the named task does not exist", async ({ db, app }) => {
		await seedHosts(db, "kp-notask");

		const res = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: createBody({ parentKind: "task", parentId: "task-that-is-not-there" }),
		});

		expect(res.status).toBe(400);
	});

	test("is refused when the named thread does not exist", async ({ db, app }) => {
		await seedHosts(db, "kp-nothread");

		const res = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: createBody({ parentKind: "thread", parentId: "thr-that-is-not-there" }),
		});

		expect(res.status).toBe(400);
	});

	test("is refused when a kind is given without an id", async ({ db, app }) => {
		await seedHosts(db, "kp-halfa");

		const res = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: createBody({ parentKind: "task" }),
		});

		expect(res.status).toBe(400);
	});

	test("is refused when an id is given without a kind", async ({ db, app }) => {
		const { taskId } = await seedHosts(db, "kp-halfb");

		const res = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: createBody({ parentId: taskId }),
		});

		expect(res.status).toBe(400);
	});

	test("is refused for a parent kind only core-api's own routes may write", async ({ db, app }) => {
		const { taskId } = await seedHosts(db, "kp-internal");

		const res = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: createBody({ parentKind: "agent", parentId: taskId }),
		});

		expect(res.status).toBe(400);
	});

	test("stays parentless when no parent is named", async ({ db, app }) => {
		await seedHosts(db, "kp-none");

		const res = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: createBody({}),
		});

		expect(res.status).toBe(201);
		const created = (await res.json()) as { id: string };

		const [row] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, created.id))
			.limit(1);

		expect(row?.parentKind).toBeNull();
		expect(row?.parentId).toBeNull();
	});
});

/**
 * AC4 / AC5: the default list excludes parented items; the parent-filter
 * query returns only items with that parent.
 */
describe("list items by parent (AC4 / AC5)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("GET / excludes items with a parent by default", async ({ db, app }) => {
		const { taskId } = await seedHosts(db, "kl-exclude");

		// Create a parented item (task parent)
		const createRes = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: createBody({ parentKind: "task", parentId: taskId }),
		});
		expect(createRes.status).toBe(201);
		const { id: parentedId } = (await createRes.json()) as { id: string };

		// Create a parentless item
		const createRes2 = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				title: "Parentless item",
				body: "# Regular knowledge",
				format: "markdown",
				updatedBy: "u-founder",
				scopeKind: "factory",
			}),
		});
		expect(createRes2.status).toBe(201);
		const { id: parentlessId } = (await createRes2.json()) as { id: string };

		// Default GET / must NOT include the parented item
		const listRes = await app.request("/api/knowledge", { headers: authHeaders() });
		expect(listRes.status).toBe(200);
		const { items } = (await listRes.json()) as { items: Array<{ id: string }> };

		expect(items.some((i) => i.id === parentedId)).toBe(false);
		expect(items.some((i) => i.id === parentlessId)).toBe(true);
	});

	test("GET /?parentKind=task&parentId=X returns only items with that parent", async ({
		db,
		app,
	}) => {
		const { taskId } = await seedHosts(db, "kl-bytask");

		// Create two items parented to this task
		const ids: string[] = [];
		for (const suffix of ["a", "b"]) {
			const res = await app.request("/api/knowledge", {
				method: "POST",
				headers: authHeaders(),
				body: createBody({ parentKind: "task", parentId: taskId, title: `Item ${suffix}` }),
			});
			expect(res.status).toBe(201);
			ids.push(((await res.json()) as { id: string }).id);
		}

		// Create an unparented item — must not appear
		await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				title: "Unrelated",
				body: "# Unrelated",
				format: "markdown",
				updatedBy: "u-founder",
				scopeKind: "factory",
			}),
		});

		const listRes = await app.request(
			`/api/knowledge?parentKind=task&parentId=${encodeURIComponent(taskId)}`,
			{ headers: authHeaders() },
		);
		expect(listRes.status).toBe(200);
		const { items } = (await listRes.json()) as { items: Array<{ id: string }> };

		expect(items).toHaveLength(2);
		expect(items.map((i) => i.id).sort()).toEqual(ids.sort());
	});

	test("GET /?parentKind=thread&parentId=X returns only items with that thread parent", async ({
		db,
		app,
	}) => {
		const { threadId } = await seedHosts(db, "kl-bythread");

		const res = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: createBody({ parentKind: "thread", parentId: threadId }),
		});
		expect(res.status).toBe(201);
		const { id: threadItemId } = (await res.json()) as { id: string };

		const listRes = await app.request(
			`/api/knowledge?parentKind=thread&parentId=${encodeURIComponent(threadId)}`,
			{ headers: authHeaders() },
		);
		expect(listRes.status).toBe(200);
		const { items } = (await listRes.json()) as { items: Array<{ id: string }> };

		expect(items).toHaveLength(1);
		expect(items[0]?.id).toBe(threadItemId);
	});

	test("GET /?parentKind=task without parentId returns 400", async ({ db, app }) => {
		await seedHosts(db, "kl-noparentid");

		const listRes = await app.request("/api/knowledge?parentKind=task", {
			headers: authHeaders(),
		});
		expect(listRes.status).toBe(400);
	});
});
