/**
 * L15 — `appendPlainMessage` helper unit tests.
 *
 * Source: L15-plan.md § 5.4 (helper signature) + § 12 protected row
 * `append-plain-message.test.ts`.
 *
 * The helper is the single chokepoint for plain-type message writes (used
 * by both POST /api/threads/:id/messages when type === "plain" AND
 * POST /api/tasks/:id/request).
 *
 * Red phase: the service does not exist yet — the import fails.
 */

import {
	agents,
	bets,
	createTestDb,
	type HyperIdleDb,
	products,
	tasks,
	teams,
	threads as threadsTable,
} from "@hyperidle/db";
import { type DomainEvent, EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
// @ts-expect-error — module does not exist in red phase; green phase creates it.
import { appendPlainMessage } from "../append-plain-message.js";

interface Setup {
	db: HyperIdleDb;
	eventBus: EventBus;
	events: DomainEvent[];
	threadId: string;
}

function setup(): Setup {
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
	db.insert(agents)
		.values({ id: "agent-1", name: "A", role: "builder", status: "active", createdAt: now })
		.run();
	db.insert(bets)
		.values({
			id: "bet-x",
			productId: "p1",
			teamId: "t1",
			pitch: "x",
			appetite: "small",
			status: "in_progress",
			createdAt: now,
		})
		.run();
	db.insert(tasks)
		.values({
			id: "task-1",
			betId: "bet-x",
			productId: "p1",
			teamId: "t1",
			title: "T",
			state: "in_progress",
			createdAt: now,
			updatedAt: now,
		})
		.run();

	const threadId = "thread-fixed-id-1";
	db.insert(threadsTable)
		.values({
			id: threadId,
			hostKind: "task",
			hostId: "task-1",
			initiatorId: "u-founder",
			participants: JSON.stringify(["u-founder", "agent-1"]),
			pinned: 0,
			lastActiveAt: now,
			createdAt: now,
		})
		.run();

	return { db, eventBus, events, threadId };
}

describe("appendPlainMessage", () => {
	let s: Setup;

	beforeEach(() => {
		s = setup();
	});

	it("inserts a plain message into an existing thread", async () => {
		const result = appendPlainMessage(s.db, s.eventBus, {
			threadId: s.threadId,
			senderId: "u-founder",
			clientKey: "append-key-1",
			payload: { text: "hello" },
		});
		expect(result.ok).toBe(true);
		expect(result.status).toBe(201);
		expect(result.message.type).toBe("plain");
		expect(result.message.payload).toEqual({ text: "hello" });
	});

	it("bumps thread.lastActiveAt", async () => {
		const before = s.db
			.select({ lastActiveAt: threadsTable.lastActiveAt })
			.from(threadsTable)
			.where(eq(threadsTable.id, s.threadId))
			.get();

		// Pause to ensure ISO string strictly increases.
		await new Promise((r) => setTimeout(r, 5));

		appendPlainMessage(s.db, s.eventBus, {
			threadId: s.threadId,
			senderId: "u-founder",
			clientKey: "bump-key-1",
			payload: { text: "ping" },
		});

		const after = s.db
			.select({ lastActiveAt: threadsTable.lastActiveAt })
			.from(threadsTable)
			.where(eq(threadsTable.id, s.threadId))
			.get();
		expect(after).toBeDefined();
		expect(before).toBeDefined();
		expect(after?.lastActiveAt > (before?.lastActiveAt ?? "")).toBe(true);
	});

	it("emits `thread_message_appended` event", async () => {
		appendPlainMessage(s.db, s.eventBus, {
			threadId: s.threadId,
			senderId: "u-founder",
			clientKey: "event-key-1",
			payload: { text: "hi" },
		});
		const evt = s.events.find((e) => e.type === "thread_message_appended");
		expect(evt).toBeDefined();
	});

	it("is idempotent on (threadId, senderId, clientKey) — same payload returns 200 with same message id", async () => {
		const first = appendPlainMessage(s.db, s.eventBus, {
			threadId: s.threadId,
			senderId: "u-founder",
			clientKey: "idem-key-same",
			payload: { text: "ping" },
		});
		expect(first.ok).toBe(true);

		const second = appendPlainMessage(s.db, s.eventBus, {
			threadId: s.threadId,
			senderId: "u-founder",
			clientKey: "idem-key-same",
			payload: { text: "ping" },
		});
		expect(second.ok).toBe(true);
		expect(second.status).toBe(200);
		expect(second.message.id).toBe(first.message.id);
	});

	it("returns 409 idempotency_conflict when same clientKey carries divergent payload", async () => {
		appendPlainMessage(s.db, s.eventBus, {
			threadId: s.threadId,
			senderId: "u-founder",
			clientKey: "idem-key-divergent",
			payload: { text: "first" },
		});

		const second = appendPlainMessage(s.db, s.eventBus, {
			threadId: s.threadId,
			senderId: "u-founder",
			clientKey: "idem-key-divergent",
			payload: { text: "DIFFERENT" },
		});
		expect(second.ok).toBe(false);
		expect(second.status).toBe(409);
		expect(second.code).toBe("idempotency_conflict");
	});

	it("returns 404 when the thread does not exist", async () => {
		const res = appendPlainMessage(s.db, s.eventBus, {
			threadId: "missing-thread",
			senderId: "u-founder",
			clientKey: "missing-key-1",
			payload: { text: "x" },
		});
		expect(res.ok).toBe(false);
		expect(res.status).toBe(404);
	});

	it("returns 403 when senderId is not in the thread's participants[]", async () => {
		const res = appendPlainMessage(s.db, s.eventBus, {
			threadId: s.threadId,
			senderId: "stranger-id",
			clientKey: "stranger-key-1",
			payload: { text: "x" },
		});
		expect(res.ok).toBe(false);
		expect(res.status).toBe(403);
	});
});
