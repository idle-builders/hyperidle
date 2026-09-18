/**
 * BC3 architecture.md §5 B5 — `POST /api/teams`'s welcome-message seed no
 * longer raw-inserts a thread under the literal id `thr-ast-${userId}`. It
 * posts through `send_message`, so the welcome message lands in the same
 * direct thread the assistant overlay finds by
 * `search_threads({host:{kind:"agent", id: myAgentId}})`
 * (`AssistantOverlay.tsx:277-278`).
 */

import { type HyperIdleDb, messages, threads, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "../../__testing__/test-fixtures.js";

interface ActionEnvelope<T> {
	readonly ok: boolean;
	readonly data?: T;
	readonly problems?: ReadonlyArray<{ readonly code: string; readonly message: string }>;
}

interface ThreadListRow {
	readonly id: string;
}

interface ThreadViewRow {
	readonly messages: ReadonlyArray<{ readonly senderId: string; readonly payload: unknown }>;
}

/** The actor-override header the seam already uses to call in as a given user. */
function actorHeaders(actorId: string): Record<string, string> {
	return { "x-hyperidle-actor-id": actorId, "Content-Type": "application/json" };
}

async function seedHumanUser(db: HyperIdleDb, id: string, name: string): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "human",
		name,
		role: "founder",
		status: "active",
		createdAt: new Date().toISOString(),
	});
}

describe("POST /api/teams welcome message (BC3 architecture.md §5 B5)", () => {
	test("lands in the thread search_threads finds by the assistant's host, sent by the assistant, and never under thr-ast-<userId>", async ({
		db,
		app,
	}) => {
		const userId = "tw-user-1";
		const assistantId = `ast-${userId}`;
		await seedHumanUser(db, userId, "Welcome User 1");

		const createRes = await app.request("/api/teams", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "TW Team 1", userId }),
		});
		expect(createRes.status).toBe(201);

		const searchRes = await app.request("/api/actions/search_threads", {
			method: "POST",
			headers: actorHeaders(userId),
			body: JSON.stringify({ host: { kind: "agent", id: assistantId } }),
		});
		const searchBody = (await searchRes.json()) as ActionEnvelope<ThreadListRow[]>;
		expect(searchBody.ok).toBe(true);
		expect(searchBody.data).toHaveLength(1);
		const firstThread = searchBody.data?.[0];
		if (!firstThread) throw new Error("expected exactly one thread");
		const threadId = firstThread.id;

		const openRes = await app.request("/api/actions/open_thread", {
			method: "POST",
			headers: actorHeaders(userId),
			body: JSON.stringify({ id: threadId }),
		});
		const openBody = (await openRes.json()) as ActionEnvelope<ThreadViewRow>;
		expect(openBody.ok).toBe(true);
		expect(openBody.data?.messages).toHaveLength(1);
		expect(openBody.data?.messages[0]?.senderId).toBe(assistantId);

		const legacyThread = await db
			.select()
			.from(threads)
			.where(eq(threads.id, `thr-ast-${userId}`));
		expect(legacyThread).toHaveLength(0);
	});

	test("creating a second team for the same user does not create a second thread or a second welcome message", async ({
		db,
		app,
	}) => {
		const userId = "tw-user-2";
		const assistantId = `ast-${userId}`;
		await seedHumanUser(db, userId, "Welcome User 2");

		const first = await app.request("/api/teams", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "TW Team 2a", userId }),
		});
		expect(first.status).toBe(201);

		const second = await app.request("/api/teams", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "TW Team 2b", userId }),
		});
		expect(second.status).toBe(201);

		const searchRes = await app.request("/api/actions/search_threads", {
			method: "POST",
			headers: actorHeaders(userId),
			body: JSON.stringify({ host: { kind: "agent", id: assistantId } }),
		});
		const searchBody = (await searchRes.json()) as ActionEnvelope<ThreadListRow[]>;
		expect(searchBody.ok).toBe(true);
		expect(searchBody.data).toHaveLength(1);
		const firstThread = searchBody.data?.[0];
		if (!firstThread) throw new Error("expected exactly one thread");
		const threadId = firstThread.id;

		const rows = await db.select().from(messages).where(eq(messages.threadId, threadId));
		expect(rows).toHaveLength(1);
	});
});
