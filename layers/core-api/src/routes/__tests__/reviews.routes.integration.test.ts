import { messages, threads, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";
import type { HyperIdleDb } from "@hyperidle/db";

const TEST_API_KEY = "test-key-reviews";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY };
}

/**
 * A real review, stored the way the product stores one: a review-typed message
 * on a thread, whose payload IS the review. The route reads that payload — it
 * never invents content, so a test that wants a review has to write one.
 */
async function seedReview(
	db: HyperIdleDb,
	options: { readonly messageId: string; readonly threadId: string; readonly title: string },
): Promise<void> {
	const now = new Date().toISOString();
	const agentId = `agent-for-${options.messageId}`;
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: now,
	});
	await db.insert(threads).values({
		id: options.threadId,
		hostKind: "task",
		hostId: `task-for-${options.messageId}`,
		initiatorId: agentId,
		participants: JSON.stringify([agentId]),
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(messages).values({
		id: options.messageId,
		senderId: agentId,
		threadId: options.threadId,
		type: "review",
		payload: JSON.stringify({ id: options.messageId, title: options.title, artifacts: [] }),
		clientKey: `ck-${options.messageId}`,
		createdAt: now,
	});
}

describe("GET /api/reviews/:reviewId", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns the stored review, and composes its own threadId", async ({ db, app }) => {
		await seedReview(db, {
			messageId: "rev-stored-1",
			threadId: "thread-stored-1",
			title: "Raise the refund cap for repeat customers",
		});

		const res = await app.request("/api/reviews/rev-stored-1", {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { id: string; title: string; threadId: string };
		expect(body.id).toBe("rev-stored-1");
		expect(body.title).toBe("Raise the refund cap for repeat customers");
		// The review's OWN threadId is composed by the route, never read from the
		// payload — the client fetches the thread by id rather than guessing it.
		expect(body.threadId).toBe("thread-stored-1");
	});

	test("returns 404 for an unknown review id", async ({ app }) => {
		const res = await app.request("/api/reviews/does-not-exist", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(res.status).toBe(404);
	});

	test("returns 401 without an API key", async ({ requestWithoutAuth }) => {
		// Auth is decided before the review is looked up, so any id proves it.
		const res = await requestWithoutAuth("/api/reviews/rev-stored-1", { method: "GET" });
		expect(res.status).toBe(401);
	});
});
