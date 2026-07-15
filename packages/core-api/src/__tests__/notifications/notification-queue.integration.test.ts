/**
 * AU18 — `notification-queue.ts` repository: read projection/ordering +
 * write effect, one describe block per exported function. Exact-behavior
 * lock against the raw queries it replaces in dispatcher.ts/digest.ts/
 * routes/notifications-routes.ts/services/retention-reaper.ts.
 */
import type { NewNotificationQueueRow } from "@hyperidle/db";
import {
	claimForSend,
	deleteReaped,
	findById,
	findPendingByEventSubject,
	insertNotification,
	listAll,
	listByIdsWithStatus,
	listByStatus,
	listPending,
	listPendingDigest,
	listStuckLeases,
	listUnread,
	markRead,
	markSeenAll,
	queueCountByStatus,
	requeueLease,
	updateManyByIds,
	updateStatus,
} from "@hyperidle/notifications";
import { describe, expect, test } from "../../test-fixtures.js";

function row(
	overrides: Partial<NewNotificationQueueRow> & { id: string },
): NewNotificationQueueRow {
	return {
		eventType: "test_event",
		subjectId: null,
		severity: "digest",
		title: "Title",
		body: "Body",
		reason: "digest",
		channel: "console",
		status: "pending",
		attempts: 0,
		createdAt: "2026-07-01T00:00:00.000Z",
		...overrides,
	};
}

describe("insertNotification + findById + listAll", () => {
	test("inserts a full row, readable back by findById and by listAll", async ({ db }) => {
		await insertNotification(db, row({ id: "n-1", title: "Hello" }));

		const found = await findById(db, "n-1");
		expect(found?.title).toBe("Hello");
		expect(found?.status).toBe("pending");

		const all = await listAll(db);
		expect(all).toHaveLength(1);
		expect(all[0]?.id).toBe("n-1");
	});

	test("findById returns undefined for a missing id", async ({ db }) => {
		const found = await findById(db, "does-not-exist");
		expect(found).toBeUndefined();
	});
});

describe("queueCountByStatus", () => {
	test("counts only rows matching the given status", async ({ db }) => {
		await insertNotification(db, row({ id: "n-p1", status: "pending" }));
		await insertNotification(db, row({ id: "n-p2", status: "pending" }));
		await insertNotification(db, row({ id: "n-s1", status: "sent" }));

		expect(await queueCountByStatus(db, "pending")).toBe(2);
		expect(await queueCountByStatus(db, "sent")).toBe(1);
		expect(await queueCountByStatus(db, "dropped")).toBe(0);
	});
});

describe("listByStatus", () => {
	test("filters by status, orders newest first", async ({ db }) => {
		await insertNotification(
			db,
			row({ id: "n-old", status: "sent", createdAt: "2026-07-01T00:00:00.000Z" }),
		);
		await insertNotification(
			db,
			row({ id: "n-new", status: "sent", createdAt: "2026-07-02T00:00:00.000Z" }),
		);
		await insertNotification(db, row({ id: "n-pending", status: "pending" }));

		const sent = await listByStatus(db, "sent");
		expect(sent.map((r) => r.id)).toEqual(["n-new", "n-old"]);
	});
});

describe("listPending", () => {
	test("returns only pending rows, oldest first", async ({ db }) => {
		await insertNotification(
			db,
			row({ id: "n-2", status: "pending", createdAt: "2026-07-02T00:00:00.000Z" }),
		);
		await insertNotification(
			db,
			row({ id: "n-1", status: "pending", createdAt: "2026-07-01T00:00:00.000Z" }),
		);
		await insertNotification(db, row({ id: "n-sent", status: "sent" }));

		const pending = await listPending(db);
		expect(pending.map((r) => r.id)).toEqual(["n-1", "n-2"]);
	});
});

describe("listPendingDigest", () => {
	test("filters to pending+digest severity, oldest first", async ({ db }) => {
		await insertNotification(
			db,
			row({
				id: "d-2",
				severity: "digest",
				status: "pending",
				createdAt: "2026-07-02T00:00:00.000Z",
			}),
		);
		await insertNotification(
			db,
			row({
				id: "d-1",
				severity: "digest",
				status: "pending",
				createdAt: "2026-07-01T00:00:00.000Z",
			}),
		);
		await insertNotification(db, row({ id: "b-1", severity: "blocking", status: "pending" }));

		const digests = await listPendingDigest(db);
		expect(digests.map((r) => r.id)).toEqual(["d-1", "d-2"]);
	});
});

describe("listUnread", () => {
	test("filters readAt IS NULL, newest first", async ({ db }) => {
		await insertNotification(
			db,
			row({ id: "u-old", createdAt: "2026-07-01T00:00:00.000Z", readAt: null }),
		);
		await insertNotification(
			db,
			row({ id: "u-new", createdAt: "2026-07-02T00:00:00.000Z", readAt: null }),
		);
		await insertNotification(
			db,
			row({
				id: "u-read",
				createdAt: "2026-07-03T00:00:00.000Z",
				readAt: "2026-07-03T01:00:00.000Z",
			}),
		);

		const unread = await listUnread(db);
		expect(unread.map((r) => r.id)).toEqual(["u-new", "u-old"]);
	});
});

describe("listStuckLeases", () => {
	test("finds sending rows claimed before the cutoff", async ({ db }) => {
		await insertNotification(
			db,
			row({ id: "stuck", status: "sending", claimedAt: "2026-07-01T00:00:00.000Z" }),
		);
		await insertNotification(
			db,
			row({ id: "fresh", status: "sending", claimedAt: "2026-07-03T00:00:00.000Z" }),
		);

		const stuck = await listStuckLeases(db, "2026-07-02T00:00:00.000Z");
		expect(stuck.map((r) => r.id)).toEqual(["stuck"]);
	});
});

describe("listByIdsWithStatus", () => {
	test("filters to the given id set AND status", async ({ db }) => {
		await insertNotification(db, row({ id: "a", status: "sending" }));
		await insertNotification(db, row({ id: "b", status: "sending" }));
		await insertNotification(db, row({ id: "c", status: "pending" }));

		const rows = await listByIdsWithStatus(db, ["a", "b", "c"], "sending");
		expect(rows.map((r) => r.id).sort()).toEqual(["a", "b"]);
	});
});

describe("findPendingByEventSubject", () => {
	test("matches eventType + subjectId + status=pending", async ({ db }) => {
		await insertNotification(
			db,
			row({ id: "n-throttle", eventType: "agent.health.degraded", subjectId: "agent-1" }),
		);

		const found = await findPendingByEventSubject(db, "agent.health.degraded", "agent-1");
		expect(found?.id).toBe("n-throttle");

		expect(await findPendingByEventSubject(db, "agent.health.degraded", "agent-2")).toBeUndefined();
	});

	test("does not match a non-pending row", async ({ db }) => {
		await insertNotification(
			db,
			row({
				id: "n-sent",
				eventType: "agent.health.degraded",
				subjectId: "agent-3",
				status: "sent",
			}),
		);
		expect(await findPendingByEventSubject(db, "agent.health.degraded", "agent-3")).toBeUndefined();
	});
});

describe("claimForSend", () => {
	test("pending → sending, sets claimedAt, returns the id", async ({ db }) => {
		await insertNotification(db, row({ id: "claim-1", status: "pending" }));
		const now = new Date("2026-07-01T12:00:00.000Z");

		const claimed = await claimForSend(db, "claim-1", now);
		expect(claimed?.id).toBe("claim-1");

		const found = await findById(db, "claim-1");
		expect(found?.status).toBe("sending");
		expect(found?.claimedAt).toBe(now.toISOString());
	});

	test("returns undefined when the row is not pending (already claimed)", async ({ db }) => {
		await insertNotification(db, row({ id: "claim-2", status: "sending" }));
		const claimed = await claimForSend(db, "claim-2", new Date());
		expect(claimed).toBeUndefined();
	});
});

describe("updateStatus", () => {
	test("applies a partial patch to a single row", async ({ db }) => {
		await insertNotification(db, row({ id: "u-1", status: "sending", attempts: 1 }));
		await updateStatus(db, "u-1", {
			status: "failed",
			lastError: "boom",
			attempts: 2,
			claimedAt: null,
		});
		const found = await findById(db, "u-1");
		expect(found?.status).toBe("failed");
		expect(found?.lastError).toBe("boom");
		expect(found?.attempts).toBe(2);
		expect(found?.claimedAt).toBeNull();
	});
});

describe("requeueLease", () => {
	test("sending → pending, clears claimedAt", async ({ db }) => {
		await insertNotification(
			db,
			row({ id: "rq-1", status: "sending", claimedAt: "2026-07-01T00:00:00.000Z" }),
		);
		await requeueLease(db, "rq-1");
		const found = await findById(db, "rq-1");
		expect(found?.status).toBe("pending");
		expect(found?.claimedAt).toBeNull();
	});
});

describe("markSeenAll", () => {
	test("bulk-sets seenAt only on rows where it was null", async ({ db }) => {
		await insertNotification(db, row({ id: "s-1", seenAt: null }));
		await insertNotification(db, row({ id: "s-2", seenAt: "2026-06-01T00:00:00.000Z" }));
		const now = new Date("2026-07-01T00:00:00.000Z");

		await markSeenAll(db, now);

		const r1 = await findById(db, "s-1");
		const r2 = await findById(db, "s-2");
		expect(r1?.seenAt).toBe(now.toISOString());
		// Already-seen row's original timestamp is untouched.
		expect(r2?.seenAt).toBe("2026-06-01T00:00:00.000Z");
	});
});

describe("markRead", () => {
	test("sets readAt on the given row only", async ({ db }) => {
		await insertNotification(db, row({ id: "r-1" }));
		await insertNotification(db, row({ id: "r-2" }));
		const now = new Date("2026-07-01T00:00:00.000Z");

		await markRead(db, "r-1", now);

		const r1 = await findById(db, "r-1");
		const r2 = await findById(db, "r-2");
		expect(r1?.readAt).toBe(now.toISOString());
		expect(r2?.readAt).toBeNull();
	});
});

describe("updateManyByIds", () => {
	test("with onlyIfStatus: claims only rows currently in that status", async ({ db }) => {
		await insertNotification(db, row({ id: "m-1", status: "pending" }));
		await insertNotification(db, row({ id: "m-2", status: "pending" }));
		await insertNotification(db, row({ id: "m-3", status: "sent" }));

		await updateManyByIds(
			db,
			["m-1", "m-2", "m-3"],
			{ status: "sending", claimedAt: "2026-07-01T00:00:00.000Z" },
			"pending",
		);

		expect((await findById(db, "m-1"))?.status).toBe("sending");
		expect((await findById(db, "m-2"))?.status).toBe("sending");
		// m-3 was not pending, so the CAS-style filter must skip it.
		expect((await findById(db, "m-3"))?.status).toBe("sent");
	});

	test("without onlyIfStatus: unconditionally updates the given ids", async ({ db }) => {
		await insertNotification(db, row({ id: "m-4", status: "sending" }));
		await insertNotification(db, row({ id: "m-5", status: "sending" }));

		await updateManyByIds(db, ["m-4", "m-5"], { status: "pending", claimedAt: null });

		expect((await findById(db, "m-4"))?.status).toBe("pending");
		expect((await findById(db, "m-5"))?.status).toBe("pending");
	});
});

describe("deleteReaped", () => {
	test("deletes rows older than cutoff AND in a terminal status, returns deleted ids", async ({
		db,
	}) => {
		await insertNotification(
			db,
			row({ id: "old-sent", status: "sent", createdAt: "2026-01-01T00:00:00.000Z" }),
		);
		await insertNotification(
			db,
			row({ id: "old-pending", status: "pending", createdAt: "2026-01-01T00:00:00.000Z" }),
		);
		await insertNotification(
			db,
			row({ id: "new-sent", status: "sent", createdAt: "2026-07-01T00:00:00.000Z" }),
		);

		const deleted = await deleteReaped(db, "2026-06-01T00:00:00.000Z", [
			"sent",
			"failed",
			"dropped",
		]);

		expect(deleted).toEqual(["old-sent"]);
		expect(await findById(db, "old-sent")).toBeUndefined();
		// Not terminal status → survives even though old.
		expect(await findById(db, "old-pending")).toBeDefined();
		// Terminal status but not old enough → survives.
		expect(await findById(db, "new-sent")).toBeDefined();
	});
});
