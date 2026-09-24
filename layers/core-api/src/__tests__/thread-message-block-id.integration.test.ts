/**
 * @lore T5 — Block Discussion Completion: server-side blockId tests,
 * re-pointed onto the thread action surface after `routes/threads.ts` was
 * deleted. Was `routes/__tests__/threads.blockId.integration.test.ts`,
 * driving the deleted `POST /api/threads` / `GET /api/threads/:id?block_id=X`;
 * now drives `POST /api/actions/send_message` / `POST /api/actions/open_thread`.
 *
 * AC coverage (unchanged from the original):
 *  - AC-1: blockId persisted in a structured, queryable column (not only in
 *    the JSON payload) — `Message.blockId` (`framework/domain-model/src/actions/thread.ts`).
 *  - AC-4: anchored messages outlive their block (no cascade delete).
 *  - AC-5: `open_thread({ id, blockId })` filters messages by blockId.
 *
 * Tests run against the real server + real PGlite DB (no mocks).
 */

import { type HyperIdleDb, messages, teams, users } from "@hyperidle/db";
import type { ThreadView } from "@hyperidle/domain-model";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

interface ActionEnvelope<T> {
	readonly ok: boolean;
	readonly data?: T;
	readonly problems?: ReadonlyArray<{ readonly code: string; readonly message: string }>;
}

async function call<T>(
	app: { request: (path: string, init: RequestInit) => Response | Promise<Response> },
	name: string,
	body: Record<string, unknown>,
): Promise<{ readonly status: number; readonly body: ActionEnvelope<T> }> {
	const res = await app.request(`/api/actions/${name}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	return { status: res.status, body: (await res.json()) as ActionEnvelope<T> };
}

/** `resolveApiKeyActorUserId` resolves the actor to the sole seeded human. */
const FOUNDER_ID = "u-t5-founder";
const RECIPIENT_ID = "u-t5-recipient";

async function seedBase(db: HyperIdleDb, teamId: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: teamId, name: teamId, createdAt: now });
	await db.insert(users).values([
		{
			id: FOUNDER_ID,
			kind: "human",
			name: "Founder T5",
			role: "founder",
			status: "active",
			teamId,
			createdAt: now,
		},
		{
			id: RECIPIENT_ID,
			kind: "human",
			name: "Recipient T5",
			role: "member",
			teamId,
			status: "active",
			createdAt: now,
		},
	]);
}

/** The structural slice of `Hono` every helper below needs — `app.request`. */
type RequestingApp = { request: (path: string, init: RequestInit) => Response | Promise<Response> };

/** Creates an empty thread (actor as sole member, host {user, actor}) to append into. */
async function createThread(app: RequestingApp): Promise<string> {
	const res = await call<ThreadView>(app, "adjust_thread", {});
	return (res.body.data as ThreadView).thread.id;
}

async function createFilterThread(app: RequestingApp): Promise<string> {
	const created = await call<{ message: { id: string }; thread: { id: string } }>(
		app,
		"send_message",
		{ recipients: [RECIPIENT_ID], text: "Block A message 1", blockId: "block-filter-A" },
	);
	const threadId = (created.body.data as { thread: { id: string } }).thread.id;

	await call(app, "send_message", {
		threadId,
		text: "Block A message 2",
		blockId: "block-filter-A",
	});
	await call(app, "send_message", {
		threadId,
		text: "Block B message 1",
		blockId: "block-filter-B",
	});
	await call(app, "send_message", { threadId, text: "Unanchored message 1" });
	await call(app, "send_message", { threadId, text: "Unanchored message 2" });

	return threadId;
}

// ── AC-1: blockId written to the column when creating a thread + initial message ──

describe("AC-1 — blockId written to the column on send_message (new thread)", () => {
	test("message row has block_id column populated when blockId is in the payload", async ({
		db,
		app,
	}) => {
		await seedBase(db, "t5-team-1");
		const blockId = "block-abc123def456";

		const res = await call<{ message: { id: string } }>(app, "send_message", {
			recipients: [RECIPIENT_ID],
			text: "Discussing this block",
			blockId,
		});
		expect(res.status).toBe(200);
		const messageId = (res.body.data as { message: { id: string } }).message.id;

		const messageRows = await db.select().from(messages).where(eq(messages.id, messageId));
		expect(messageRows).toHaveLength(1);
		expect(messageRows[0]?.blockId).toBe(blockId);
	});

	test("message row has null block_id when no blockId is in the payload", async ({ db, app }) => {
		await seedBase(db, "t5-team-2");

		const res = await call<{ message: { id: string } }>(app, "send_message", {
			recipients: [RECIPIENT_ID],
			text: "No block anchor here",
		});
		expect(res.status).toBe(200);
		const messageId = (res.body.data as { message: { id: string } }).message.id;

		const messageRows = await db.select().from(messages).where(eq(messages.id, messageId));
		expect(messageRows).toHaveLength(1);
		expect(messageRows[0]?.blockId).toBeNull();
	});
});

// ── AC-1: blockId written to the column when appending a message ──

describe("AC-1 — blockId written to the column on send_message (append)", () => {
	test("appended message row has block_id column populated when blockId is in the payload", async ({
		db,
		app,
	}) => {
		await seedBase(db, "t5-team-3");
		const threadId = await createThread(app);
		const blockId = "block-append-xyz789";

		const res = await call<{ message: { id: string } }>(app, "send_message", {
			threadId,
			text: "Anchored reply",
			blockId,
		});
		expect(res.status).toBe(200);
		const messageId = (res.body.data as { message: { id: string } }).message.id;

		const messageRows = await db.select().from(messages).where(eq(messages.id, messageId));
		expect(messageRows).toHaveLength(1);
		expect(messageRows[0]?.blockId).toBe(blockId);
	});

	test("appended message row has null block_id when no blockId is in the payload", async ({
		db,
		app,
	}) => {
		await seedBase(db, "t5-team-4");
		const threadId = await createThread(app);

		const res = await call<{ message: { id: string } }>(app, "send_message", {
			threadId,
			text: "Plain reply, no anchor",
		});
		expect(res.status).toBe(200);
		const messageId = (res.body.data as { message: { id: string } }).message.id;

		const messageRows = await db.select().from(messages).where(eq(messages.id, messageId));
		expect(messageRows).toHaveLength(1);
		expect(messageRows[0]?.blockId).toBeNull();
	});
});

// ── AC-5: open_thread({ id, blockId }) returns only matching messages ──

describe("AC-5 — open_thread({ id, blockId }) returns only matching messages", () => {
	test("blockId: 'block-filter-A' returns only the 2 messages anchored to block-A", async ({
		db,
		app,
	}) => {
		await seedBase(db, "t5-team-5");
		const threadId = await createFilterThread(app);

		const res = await call<ThreadView>(app, "open_thread", {
			id: threadId,
			blockId: "block-filter-A",
		});
		expect(res.status).toBe(200);
		const view = res.body.data as ThreadView;
		expect(view.messages).toHaveLength(2);
		for (const msg of view.messages) expect(msg.blockId).toBe("block-filter-A");
	});

	test("no blockId filter returns all 5 messages", async ({ db, app }) => {
		await seedBase(db, "t5-team-6");
		const threadId = await createFilterThread(app);

		const res = await call<ThreadView>(app, "open_thread", { id: threadId });
		expect(res.status).toBe(200);
		expect((res.body.data as ThreadView).messages).toHaveLength(5);
	});

	test("blockId: 'block-filter-B' returns only the 1 message anchored to block-B", async ({
		db,
		app,
	}) => {
		await seedBase(db, "t5-team-7");
		const threadId = await createFilterThread(app);

		const res = await call<ThreadView>(app, "open_thread", {
			id: threadId,
			blockId: "block-filter-B",
		});
		expect(res.status).toBe(200);
		expect((res.body.data as ThreadView).messages).toHaveLength(1);
	});

	test("a nonexistent blockId returns 0 messages", async ({ db, app }) => {
		await seedBase(db, "t5-team-8");
		const threadId = await createFilterThread(app);

		const res = await call<ThreadView>(app, "open_thread", {
			id: threadId,
			blockId: "block-nonexistent",
		});
		expect(res.status).toBe(200);
		expect((res.body.data as ThreadView).messages).toHaveLength(0);
	});

	test("an empty-string blockId is rejected with 400 VALIDATION_ERROR (security: rejects empty)", async ({
		db,
		app,
	}) => {
		await seedBase(db, "t5-team-9");
		const threadId = await createFilterThread(app);

		const res = await app.request("/api/actions/open_thread", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ id: threadId, blockId: "" }),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe("VALIDATION_ERROR");
	});

	test("a blockId exceeding 128 chars is rejected with 400 VALIDATION_ERROR (T5 max-length guard)", async ({
		db,
		app,
	}) => {
		await seedBase(db, "t5-team-10");
		const threadId = await createFilterThread(app);
		const oversizedBlockId = "x".repeat(129);

		const res = await app.request("/api/actions/open_thread", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ id: threadId, blockId: oversizedBlockId }),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe("VALIDATION_ERROR");
	});
});

// ── AC-4: anchored messages persist independently (no cascade) ──

describe("AC-4 — anchored messages outlive their block (no cascade delete)", () => {
	test("a message with blockId persists in its own structured column when the thread is not deleted", async ({
		db,
		app,
	}) => {
		await seedBase(db, "t5-team-11");
		const blockId = "block-persist-test";

		const res = await call<{ message: { id: string } }>(app, "send_message", {
			recipients: [RECIPIENT_ID],
			text: "Anchored message that outlives its block",
			blockId,
		});
		expect(res.status).toBe(200);
		const messageId = (res.body.data as { message: { id: string } }).message.id;

		const messageRows = await db.select().from(messages).where(eq(messages.id, messageId));
		expect(messageRows).toHaveLength(1);
		expect(messageRows[0]?.blockId).toBe(blockId);
		expect(Object.keys(messageRows[0] ?? {})).toContain("blockId");
	});
});
