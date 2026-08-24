/**
 * AU20 Ag6a — `notification-queue.ts` repository: read projection/ordering +
 * write effect, one describe block per new public operation.
 *
 * @lore AU44 batch 4: reduced to cover the 3 surviving public filter variants
 * (unread, pending-by-event, by-event-since), simplified enqueue (no dedupeBy),
 * simplified markNotifications (read/seen only), and simplified reap
 * (readAt IS NOT NULL AND createdAt < cutoff).
 */
import type { NewNotificationQueueRow, NotificationQueueRow } from "@hyperidle/db";
import { notificationQueue } from "@hyperidle/db";
import { enqueue, listNotifications, markNotifications, reap } from "@hyperidle/notifications";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "../../__testing__/test-fixtures.js";

function row(
	overrides: Partial<NewNotificationQueueRow> & { id: string },
): NewNotificationQueueRow {
	return {
		eventType: "test_event",
		subjectId: null,
		severity: "digest",
		title: "Title",
		body: "Body",
		reason: "notification_event",
		channel: null,
		status: "pending",
		attempts: 0,
		createdAt: "2026-07-01T00:00:00.000Z",
		...overrides,
	};
}

async function findById(
	db: Parameters<typeof enqueue>[0],
	id: string,
): Promise<NotificationQueueRow | undefined> {
	const [found] = await db
		.select()
		.from(notificationQueue)
		.where(eq(notificationQueue.id, id))
		.limit(1);
	return found;
}

// ── enqueue ──────────────────────────────────────────────────────────────

describe("enqueue", () => {
	test("inserts a full row and returns its id", async ({ db }) => {
		const id = await enqueue(db, row({ id: "n-1", title: "Hello" }));
		expect(id).toBe("n-1");

		const found = await findById(db, "n-1");
		expect(found?.title).toBe("Hello");
		expect(found?.status).toBe("pending");
	});

	test("inserts two rows with different ids independently", async ({ db }) => {
		await enqueue(db, row({ id: "n-a" }));
		await enqueue(db, row({ id: "n-b" }));
		const a = await findById(db, "n-a");
		const b = await findById(db, "n-b");
		expect(a?.id).toBe("n-a");
		expect(b?.id).toBe("n-b");
	});
});

// ── listNotifications ─────────────────────────────────────────────────────

describe("listNotifications — unread", () => {
	test("filters readAt IS NULL, newest first", async ({ db }) => {
		await enqueue(db, row({ id: "u-old", createdAt: "2026-07-01T00:00:00.000Z", readAt: null }));
		await enqueue(db, row({ id: "u-new", createdAt: "2026-07-02T00:00:00.000Z", readAt: null }));
		await enqueue(
			db,
			row({
				id: "u-read",
				createdAt: "2026-07-03T00:00:00.000Z",
				readAt: "2026-07-03T01:00:00.000Z",
			}),
		);

		const unread = await listNotifications(db, { kind: "unread" });
		expect(unread.map((r) => r.id)).toEqual(["u-new", "u-old"]);
	});

	test("respects optional limit", async ({ db }) => {
		await enqueue(db, row({ id: "u-1", readAt: null, createdAt: "2026-07-01T00:00:00.000Z" }));
		await enqueue(db, row({ id: "u-2", readAt: null, createdAt: "2026-07-02T00:00:00.000Z" }));
		await enqueue(db, row({ id: "u-3", readAt: null, createdAt: "2026-07-03T00:00:00.000Z" }));

		const limited = await listNotifications(db, { kind: "unread", limit: 2 });
		expect(limited).toHaveLength(2);
	});
});

describe("listNotifications — pending-by-event", () => {
	test("matches eventType + subjectId + status=pending", async ({ db }) => {
		await enqueue(
			db,
			row({ id: "n-throttle", eventType: "agent.health.degraded", subjectId: "agent-1" }),
		);

		const [found] = await listNotifications(db, {
			kind: "pending-by-event",
			eventType: "agent.health.degraded",
			subjectId: "agent-1",
		});
		expect(found?.id).toBe("n-throttle");

		const [notFound] = await listNotifications(db, {
			kind: "pending-by-event",
			eventType: "agent.health.degraded",
			subjectId: "agent-2",
		});
		expect(notFound).toBeUndefined();
	});

	test("does not match a non-pending row", async ({ db }) => {
		await enqueue(
			db,
			row({
				id: "n-sent",
				eventType: "agent.health.degraded",
				subjectId: "agent-3",
				status: "sent",
			}),
		);

		const result = await listNotifications(db, {
			kind: "pending-by-event",
			eventType: "agent.health.degraded",
			subjectId: "agent-3",
		});
		expect(result).toHaveLength(0);
	});
});

/**
 * AU26 — the notification system counting its OWN rows. The degraded-agent
 * rule is "N failures in 7 days", and the only ledger of those failures is the
 * `agent.health.degraded` rows this repository already owns — no new table, no
 * tally state.
 */
describe("listNotifications — by-event-since (AU26 windowed count)", () => {
	test("matches eventType + subjectId inside the window, any status", async ({ db }) => {
		await enqueue(
			db,
			row({
				id: "since-old",
				eventType: "agent.health.degraded",
				subjectId: "agent-1",
				status: "dropped",
				createdAt: "2026-06-01T00:00:00.000Z",
			}),
		);
		await enqueue(
			db,
			row({
				id: "since-recent-dropped",
				eventType: "agent.health.degraded",
				subjectId: "agent-1",
				status: "dropped",
				createdAt: "2026-07-02T00:00:00.000Z",
			}),
		);
		await enqueue(
			db,
			row({
				id: "since-recent-pending",
				eventType: "agent.health.degraded",
				subjectId: "agent-1",
				status: "pending",
				createdAt: "2026-07-03T00:00:00.000Z",
			}),
		);
		// Different subject — must not leak into another agent's count.
		await enqueue(
			db,
			row({
				id: "since-other-agent",
				eventType: "agent.health.degraded",
				subjectId: "agent-2",
				createdAt: "2026-07-03T00:00:00.000Z",
			}),
		);
		// Different eventType, same subject — must not leak either.
		await enqueue(
			db,
			row({
				id: "since-other-event",
				eventType: "review_request",
				subjectId: "agent-1",
				createdAt: "2026-07-03T00:00:00.000Z",
			}),
		);

		const rows = await listNotifications(db, {
			kind: "by-event-since",
			eventType: "agent.health.degraded",
			subjectId: "agent-1",
			since: "2026-07-01T00:00:00.000Z",
		});
		expect(rows.map((r) => r.id).sort()).toEqual(["since-recent-dropped", "since-recent-pending"]);
	});

	test("returns an empty list when every row predates the window", async ({ db }) => {
		await enqueue(
			db,
			row({
				id: "since-only-old",
				eventType: "agent.health.degraded",
				subjectId: "agent-9",
				createdAt: "2026-06-01T00:00:00.000Z",
			}),
		);
		const rows = await listNotifications(db, {
			kind: "by-event-since",
			eventType: "agent.health.degraded",
			subjectId: "agent-9",
			since: "2026-07-01T00:00:00.000Z",
		});
		expect(rows).toHaveLength(0);
	});
});

// ── markNotifications ─────────────────────────────────────────────────────

describe("markNotifications — seen", () => {
	test("bulk-sets seenAt only on rows where it was null", async ({ db }) => {
		await enqueue(db, row({ id: "s-1", seenAt: null }));
		await enqueue(db, row({ id: "s-2", seenAt: "2026-06-01T00:00:00.000Z" }));
		const now = new Date("2026-07-01T00:00:00.000Z");

		await markNotifications(db, { kind: "all" }, { seen: true }, now);

		const r1 = await findById(db, "s-1");
		const r2 = await findById(db, "s-2");
		expect(r1?.seenAt).toBe(now.toISOString());
		// Already-seen row's original timestamp is untouched.
		expect(r2?.seenAt).toBe("2026-06-01T00:00:00.000Z");
	});
});

describe("markNotifications — read", () => {
	test("sets readAt on the given row only", async ({ db }) => {
		await enqueue(db, row({ id: "r-1" }));
		await enqueue(db, row({ id: "r-2" }));
		const now = new Date("2026-07-01T00:00:00.000Z");

		await markNotifications(db, { kind: "ids", ids: ["r-1"] }, { read: true }, now);

		const r1 = await findById(db, "r-1");
		const r2 = await findById(db, "r-2");
		expect(r1?.readAt).toBe(now.toISOString());
		expect(r2?.readAt).toBeNull();
	});
});

// ── reap ─────────────────────────────────────────────────────────────────

describe("reap", () => {
	test("deletes rows older than cutoff with readAt set, returns deleted ids", async ({ db }) => {
		// Old + read → must be deleted
		await enqueue(
			db,
			row({
				id: "old-read",
				createdAt: "2026-01-01T00:00:00.000Z",
				readAt: "2026-01-02T00:00:00.000Z",
			}),
		);
		// Old + NOT read → must survive (inbox item still relevant)
		await enqueue(
			db,
			row({ id: "old-unread", createdAt: "2026-01-01T00:00:00.000Z", readAt: null }),
		);
		// New + read → must survive (not old enough)
		await enqueue(
			db,
			row({
				id: "new-read",
				createdAt: "2026-07-01T00:00:00.000Z",
				readAt: "2026-07-02T00:00:00.000Z",
			}),
		);

		const deleted = await reap(db, "2026-06-01T00:00:00.000Z");

		expect(deleted).toEqual(["old-read"]);
		expect(await findById(db, "old-read")).toBeUndefined();
		// Old but unread — still in inbox, must survive.
		expect(await findById(db, "old-unread")).toBeDefined();
		// Read but not old enough — must survive.
		expect(await findById(db, "new-read")).toBeDefined();
	});
});
