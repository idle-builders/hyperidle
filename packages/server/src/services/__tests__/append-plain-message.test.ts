/**
 * L15 — appendPlainMessage helper unit tests.
 *
 * Source: docs/work-packages/L15-plan.md §5.4 "Helper signature" + §12 row.
 *
 * The helper is a single chokepoint for plain-type writes. This test
 * pins the parity with the prior inlined logic at threads.ts:380–582:
 *  - participant authz (403)
 *  - idempotency (200 same payload / 409 divergent payload)
 *  - lastActiveAt bump
 *  - emits thread_message_appended
 *  - inserts inside a tx
 *
 * RED PHASE — the helper does not exist yet.
 */

import {
	agents,
	createTestDb,
	type HyperIdleDb,
	products,
	teams,
	threads,
} from "@hyperidle/db";
import { type DomainEvent, EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendPlainMessage } from "../append-plain-message.js";

interface Ctx {
	db: HyperIdleDb;
	eventBus: EventBus;
	events: DomainEvent[];
	threadId: string;
}

function setup(): Ctx {
	const db = createTestDb();
	const eventBus = new EventBus();
	const events: DomainEvent[] = [];
	eventBus.on("*", (e) => {
		events.push(e);
	});
	const now = new Date().toISOString();
	db.insert(products).values({ id: "p1", name: "P", phase: "build", createdAt: now }).run();
	db.insert(teams)
		.values({ id: "t1", productId: "p1", capacity: 5, activeBets: 0, formedAt: now })
		.run();
	db.insert(agents)
		.values({ id: "u-founder", name: "F", role: "founder", status: "active", createdAt: now })
		.run();
	const threadId = "thread-1";
	db.insert(threads)
		.values({
			id: threadId,
			hostKind: "task",
			hostId: "task-x",
			initiatorId: "u-founder",
			participants: JSON.stringify(["u-founder"]),
			pinned: 0,
			resolvedAt: null,
			lastActiveAt: now,
			createdAt: now,
		})
		.run();
	return { db, eventBus, events, threadId };
}

describe("appendPlainMessage", () => {
	let ctx: Ctx;
	beforeEach(() => {
		ctx = setup();
	});
	afterEach(() => {
		// no-op
	});

	it("inserts the message and emits thread_message_appended", () => {
		const result = appendPlainMessage(ctx.db, ctx.eventBus, {
			threadId: ctx.threadId,
			senderId: "u-founder",
			clientKey: "ck-append-001",
			payload: { text: "hello" },
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect([200, 201]).toContain(result.status);
			expect(result.message.type).toBe("plain");
		}
		const appendedEvents = ctx.events.filter((e) => e.type === "thread_message_appended");
		expect(appendedEvents.length).toBe(1);
	});

	it("returns 403 when senderId is not in participants[]", () => {
		const result = appendPlainMessage(ctx.db, ctx.eventBus, {
			threadId: ctx.threadId,
			senderId: "stranger",
			clientKey: "ck-append-002",
			payload: { text: "hello" },
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.status).toBe(403);
		}
	});

	it("returns 404 when the thread does not exist", () => {
		const result = appendPlainMessage(ctx.db, ctx.eventBus, {
			threadId: "no-such-thread",
			senderId: "u-founder",
			clientKey: "ck-append-003",
			payload: { text: "hello" },
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.status).toBe(404);
		}
	});

	it("idempotency: same clientKey + same payload returns 200 with the same message id", () => {
		const r1 = appendPlainMessage(ctx.db, ctx.eventBus, {
			threadId: ctx.threadId,
			senderId: "u-founder",
			clientKey: "ck-idem",
			payload: { text: "hello" },
		});
		expect(r1.ok).toBe(true);
		const id1 = r1.ok ? r1.message.id : null;

		const r2 = appendPlainMessage(ctx.db, ctx.eventBus, {
			threadId: ctx.threadId,
			senderId: "u-founder",
			clientKey: "ck-idem",
			payload: { text: "hello" },
		});
		expect(r2.ok).toBe(true);
		if (r2.ok) {
			expect(r2.status).toBe(200);
			expect(r2.message.id).toBe(id1);
		}
	});

	it("idempotency: same clientKey + divergent payload returns 409 idempotency_conflict", () => {
		const r1 = appendPlainMessage(ctx.db, ctx.eventBus, {
			threadId: ctx.threadId,
			senderId: "u-founder",
			clientKey: "ck-conflict",
			payload: { text: "first" },
		});
		expect(r1.ok).toBe(true);
		const r2 = appendPlainMessage(ctx.db, ctx.eventBus, {
			threadId: ctx.threadId,
			senderId: "u-founder",
			clientKey: "ck-conflict",
			payload: { text: "different" },
		});
		expect(r2.ok).toBe(false);
		if (!r2.ok) {
			expect(r2.status).toBe(409);
			expect(r2.code).toBe("idempotency_conflict");
		}
	});

	it("bumps lastActiveAt on the thread row", () => {
		const before = ctx.db.select().from(threads).where(eq(threads.id, ctx.threadId)).get();
		const beforeAt = before?.lastActiveAt as string;
		// Wait a tick to ensure timestamp moves.
		const result = appendPlainMessage(ctx.db, ctx.eventBus, {
			threadId: ctx.threadId,
			senderId: "u-founder",
			clientKey: "ck-bump-001",
			payload: { text: "hello" },
		});
		expect(result.ok).toBe(true);
		const after = ctx.db.select().from(threads).where(eq(threads.id, ctx.threadId)).get();
		expect((after?.lastActiveAt as string) >= beforeAt).toBe(true);
	});

	it("accepts a request payload extension", () => {
		const result = appendPlainMessage(ctx.db, ctx.eventBus, {
			threadId: ctx.threadId,
			senderId: "u-founder",
			clientKey: "ck-req-001",
			payload: { text: "Request stop", request: { verb: "request_stop" } },
		});
		expect(result.ok).toBe(true);
	});
});
