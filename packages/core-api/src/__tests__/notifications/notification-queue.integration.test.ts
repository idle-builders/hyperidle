/**
 * AU20 Ag6a — `notification-queue.ts` repository: read projection/ordering +
 * write effect, one describe block per new public operation. Migrated from the
 * AU18 per-function tests to the collapsed 4-function surface:
 * `enqueue / listNotifications / markNotifications / reap`.
 *
 * Exact-behavior lock: every behavioral assertion from the original AU18 test
 * is preserved; only the call sites change to the new parameterised API.
 */
import type { NewNotificationQueueRow } from "@hyperidle/db";
import { enqueue, listNotifications, markNotifications, reap } from "@hyperidle/notifications";
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

// ── enqueue ──────────────────────────────────────────────────────────────

describe("enqueue", () => {
	test("inserts a full row and returns its id", async ({ db }) => {
		const id = await enqueue(db, row({ id: "n-1", title: "Hello" }));
		expect(id).toBe("n-1");

		// Verify via listNotifications(by-id)
		const [found] = await listNotifications(db, { kind: "by-id", id: "n-1" });
		expect(found?.title).toBe("Hello");
		expect(found?.status).toBe("pending");
	});

	test("with dedupeBy: returns existing id when pending row matches eventType+subjectId", async ({
		db,
	}) => {
		await enqueue(
			db,
			row({ id: "n-throttle", eventType: "agent.health.degraded", subjectId: "agent-1" }),
		);

		// Same eventType + subjectId → dedup returns existing id without inserting.
		const dedupId = await enqueue(
			db,
			row({ id: "n-new", eventType: "agent.health.degraded", subjectId: "agent-1" }),
			{ dedupeBy: { eventType: "agent.health.degraded", subjectId: "agent-1" } },
		);
		expect(dedupId).toBe("n-throttle");

		// Only the original row exists.
		const all = await listNotifications(db, { kind: "all" });
		expect(all).toHaveLength(1);
	});

	test("with dedupeBy: inserts when no matching pending row exists", async ({ db }) => {
		const id = await enqueue(
			db,
			row({ id: "n-new2", eventType: "agent.health.degraded", subjectId: "agent-2" }),
			{ dedupeBy: { eventType: "agent.health.degraded", subjectId: "agent-2" } },
		);
		expect(id).toBe("n-new2");
		const all = await listNotifications(db, { kind: "all" });
		expect(all).toHaveLength(1);
	});

	test("with dedupeBy: does not dedup against non-pending rows", async ({ db }) => {
		await enqueue(
			db,
			row({
				id: "n-sent",
				eventType: "agent.health.degraded",
				subjectId: "agent-3",
				status: "sent",
			}),
		);

		// Sent row is not pending → dedup finds nothing → new row inserted.
		const id = await enqueue(
			db,
			row({ id: "n-fresh", eventType: "agent.health.degraded", subjectId: "agent-3" }),
			{ dedupeBy: { eventType: "agent.health.degraded", subjectId: "agent-3" } },
		);
		expect(id).toBe("n-fresh");
		expect(await listNotifications(db, { kind: "all" })).toHaveLength(2);
	});
});

// ── listNotifications ─────────────────────────────────────────────────────

describe("listNotifications — all", () => {
	test("returns every row", async ({ db }) => {
		await enqueue(db, row({ id: "a-1" }));
		await enqueue(db, row({ id: "a-2", status: "sent" }));
		const all = await listNotifications(db, { kind: "all" });
		expect(all).toHaveLength(2);
	});
});

describe("listNotifications — by-id", () => {
	test("returns the matching row as a 1-element array", async ({ db }) => {
		await enqueue(db, row({ id: "n-1", title: "Hello" }));
		const [found] = await listNotifications(db, { kind: "by-id", id: "n-1" });
		expect(found?.title).toBe("Hello");
		expect(found?.status).toBe("pending");
	});

	test("returns empty array for a missing id", async ({ db }) => {
		const result = await listNotifications(db, { kind: "by-id", id: "does-not-exist" });
		expect(result).toHaveLength(0);
	});
});

describe("listNotifications — by-status (replaces listByStatus + queueCountByStatus)", () => {
	test("filters by status, orders newest first", async ({ db }) => {
		await enqueue(db, row({ id: "n-old", status: "sent", createdAt: "2026-07-01T00:00:00.000Z" }));
		await enqueue(db, row({ id: "n-new", status: "sent", createdAt: "2026-07-02T00:00:00.000Z" }));
		await enqueue(db, row({ id: "n-pending", status: "pending" }));

		const sent = await listNotifications(db, { kind: "by-status", status: "sent" });
		expect(sent.map((r) => r.id)).toEqual(["n-new", "n-old"]);
	});

	test("count via .length matches the filtered result", async ({ db }) => {
		await enqueue(db, row({ id: "n-p1", status: "pending" }));
		await enqueue(db, row({ id: "n-p2", status: "pending" }));
		await enqueue(db, row({ id: "n-s1", status: "sent" }));

		expect((await listNotifications(db, { kind: "by-status", status: "pending" })).length).toBe(2);
		expect((await listNotifications(db, { kind: "by-status", status: "sent" })).length).toBe(1);
		expect((await listNotifications(db, { kind: "by-status", status: "dropped" })).length).toBe(0);
	});

	test("respects optional limit", async ({ db }) => {
		await enqueue(db, row({ id: "n-1", status: "sent", createdAt: "2026-07-01T00:00:00.000Z" }));
		await enqueue(db, row({ id: "n-2", status: "sent", createdAt: "2026-07-02T00:00:00.000Z" }));
		await enqueue(db, row({ id: "n-3", status: "sent", createdAt: "2026-07-03T00:00:00.000Z" }));

		const limited = await listNotifications(db, { kind: "by-status", status: "sent", limit: 2 });
		expect(limited).toHaveLength(2);
	});
});

describe("listNotifications — pending (replaces listPending)", () => {
	test("returns only pending rows, oldest first", async ({ db }) => {
		await enqueue(db, row({ id: "n-2", status: "pending", createdAt: "2026-07-02T00:00:00.000Z" }));
		await enqueue(db, row({ id: "n-1", status: "pending", createdAt: "2026-07-01T00:00:00.000Z" }));
		await enqueue(db, row({ id: "n-sent", status: "sent" }));

		const pending = await listNotifications(db, { kind: "pending" });
		expect(pending.map((r) => r.id)).toEqual(["n-1", "n-2"]);
	});
});

describe("listNotifications — pending-digest (replaces listPendingDigest)", () => {
	test("filters to pending+digest severity, oldest first", async ({ db }) => {
		await enqueue(
			db,
			row({
				id: "d-2",
				severity: "digest",
				status: "pending",
				createdAt: "2026-07-02T00:00:00.000Z",
			}),
		);
		await enqueue(
			db,
			row({
				id: "d-1",
				severity: "digest",
				status: "pending",
				createdAt: "2026-07-01T00:00:00.000Z",
			}),
		);
		await enqueue(db, row({ id: "b-1", severity: "blocking", status: "pending" }));

		const digests = await listNotifications(db, { kind: "pending-digest" });
		expect(digests.map((r) => r.id)).toEqual(["d-1", "d-2"]);
	});
});

describe("listNotifications — unread (replaces listUnread)", () => {
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

describe("listNotifications — stuck (replaces listStuckLeases)", () => {
	test("finds sending rows claimed before the cutoff", async ({ db }) => {
		await enqueue(
			db,
			row({ id: "stuck", status: "sending", claimedAt: "2026-07-01T00:00:00.000Z" }),
		);
		await enqueue(
			db,
			row({ id: "fresh", status: "sending", claimedAt: "2026-07-03T00:00:00.000Z" }),
		);

		const stuck = await listNotifications(db, {
			kind: "stuck",
			stuckBefore: "2026-07-02T00:00:00.000Z",
		});
		expect(stuck.map((r) => r.id)).toEqual(["stuck"]);
	});
});

describe("listNotifications — by-ids (replaces listByIdsWithStatus)", () => {
	test("filters to the given id set AND status", async ({ db }) => {
		await enqueue(db, row({ id: "a", status: "sending" }));
		await enqueue(db, row({ id: "b", status: "sending" }));
		await enqueue(db, row({ id: "c", status: "pending" }));

		const rows = await listNotifications(db, {
			kind: "by-ids",
			ids: ["a", "b", "c"],
			status: "sending",
		});
		expect(rows.map((r) => r.id).sort()).toEqual(["a", "b"]);
	});

	test("without status filter: returns all matching ids", async ({ db }) => {
		await enqueue(db, row({ id: "x", status: "sent" }));
		await enqueue(db, row({ id: "y", status: "pending" }));

		const rows = await listNotifications(db, { kind: "by-ids", ids: ["x", "y"] });
		expect(rows.map((r) => r.id).sort()).toEqual(["x", "y"]);
	});
});

describe("listNotifications — pending-by-event (replaces findPendingByEventSubject)", () => {
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

// ── markNotifications ─────────────────────────────────────────────────────

describe("markNotifications — claim (replaces claimForSend)", () => {
	test("pending → sending with onlyIfStatus guard: returns 1 on success", async ({ db }) => {
		await enqueue(db, row({ id: "claim-1", status: "pending" }));
		const now = new Date("2026-07-01T12:00:00.000Z");

		const count = await markNotifications(
			db,
			{ kind: "ids", ids: ["claim-1"], onlyIfStatus: "pending" },
			{ status: "sending", claimedAt: now.toISOString() },
			now,
		);
		expect(count).toBe(1);

		const [found] = await listNotifications(db, { kind: "by-id", id: "claim-1" });
		expect(found?.status).toBe("sending");
		expect(found?.claimedAt).toBe(now.toISOString());
	});

	test("returns 0 when the row is not pending (already claimed)", async ({ db }) => {
		await enqueue(db, row({ id: "claim-2", status: "sending" }));

		const count = await markNotifications(
			db,
			{ kind: "ids", ids: ["claim-2"], onlyIfStatus: "pending" },
			{ status: "sending", claimedAt: new Date().toISOString() },
		);
		expect(count).toBe(0);
	});
});

describe("markNotifications — patch (replaces updateStatus)", () => {
	test("applies a partial patch to a single row", async ({ db }) => {
		await enqueue(db, row({ id: "u-1", status: "sending", attempts: 1 }));

		await markNotifications(
			db,
			{ kind: "ids", ids: ["u-1"] },
			{ status: "failed", lastError: "boom", attempts: 2, claimedAt: null },
		);

		const [found] = await listNotifications(db, { kind: "by-id", id: "u-1" });
		expect(found?.status).toBe("failed");
		expect(found?.lastError).toBe("boom");
		expect(found?.attempts).toBe(2);
		expect(found?.claimedAt).toBeNull();
	});
});

describe("markNotifications — requeue (replaces requeueLease)", () => {
	test("sending → pending, clears claimedAt", async ({ db }) => {
		await enqueue(
			db,
			row({ id: "rq-1", status: "sending", claimedAt: "2026-07-01T00:00:00.000Z" }),
		);

		await markNotifications(
			db,
			{ kind: "ids", ids: ["rq-1"] },
			{ status: "pending", claimedAt: null },
		);

		const [found] = await listNotifications(db, { kind: "by-id", id: "rq-1" });
		expect(found?.status).toBe("pending");
		expect(found?.claimedAt).toBeNull();
	});
});

describe("markNotifications — seen (replaces markSeenAll)", () => {
	test("bulk-sets seenAt only on rows where it was null", async ({ db }) => {
		await enqueue(db, row({ id: "s-1", seenAt: null }));
		await enqueue(db, row({ id: "s-2", seenAt: "2026-06-01T00:00:00.000Z" }));
		const now = new Date("2026-07-01T00:00:00.000Z");

		await markNotifications(db, { kind: "all" }, { seen: true }, now);

		const [r1] = await listNotifications(db, { kind: "by-id", id: "s-1" });
		const [r2] = await listNotifications(db, { kind: "by-id", id: "s-2" });
		expect(r1?.seenAt).toBe(now.toISOString());
		// Already-seen row's original timestamp is untouched.
		expect(r2?.seenAt).toBe("2026-06-01T00:00:00.000Z");
	});
});

describe("markNotifications — read (replaces markRead)", () => {
	test("sets readAt on the given row only", async ({ db }) => {
		await enqueue(db, row({ id: "r-1" }));
		await enqueue(db, row({ id: "r-2" }));
		const now = new Date("2026-07-01T00:00:00.000Z");

		await markNotifications(db, { kind: "ids", ids: ["r-1"] }, { read: true }, now);

		const [r1] = await listNotifications(db, { kind: "by-id", id: "r-1" });
		const [r2] = await listNotifications(db, { kind: "by-id", id: "r-2" });
		expect(r1?.readAt).toBe(now.toISOString());
		expect(r2?.readAt).toBeNull();
	});
});

describe("markNotifications — batch (replaces updateManyByIds)", () => {
	test("with onlyIfStatus: claims only rows currently in that status", async ({ db }) => {
		await enqueue(db, row({ id: "m-1", status: "pending" }));
		await enqueue(db, row({ id: "m-2", status: "pending" }));
		await enqueue(db, row({ id: "m-3", status: "sent" }));

		await markNotifications(
			db,
			{ kind: "ids", ids: ["m-1", "m-2", "m-3"], onlyIfStatus: "pending" },
			{ status: "sending", claimedAt: "2026-07-01T00:00:00.000Z" },
		);

		expect((await listNotifications(db, { kind: "by-id", id: "m-1" }))[0]?.status).toBe("sending");
		expect((await listNotifications(db, { kind: "by-id", id: "m-2" }))[0]?.status).toBe("sending");
		// m-3 was not pending, so the CAS-style filter must skip it.
		expect((await listNotifications(db, { kind: "by-id", id: "m-3" }))[0]?.status).toBe("sent");
	});

	test("without onlyIfStatus: unconditionally updates the given ids", async ({ db }) => {
		await enqueue(db, row({ id: "m-4", status: "sending" }));
		await enqueue(db, row({ id: "m-5", status: "sending" }));

		await markNotifications(
			db,
			{ kind: "ids", ids: ["m-4", "m-5"] },
			{ status: "pending", claimedAt: null },
		);

		expect((await listNotifications(db, { kind: "by-id", id: "m-4" }))[0]?.status).toBe("pending");
		expect((await listNotifications(db, { kind: "by-id", id: "m-5" }))[0]?.status).toBe("pending");
	});
});

// ── reap ─────────────────────────────────────────────────────────────────

describe("reap (replaces deleteReaped)", () => {
	test("deletes rows older than cutoff AND in a terminal status, returns deleted ids", async ({
		db,
	}) => {
		await enqueue(
			db,
			row({ id: "old-sent", status: "sent", createdAt: "2026-01-01T00:00:00.000Z" }),
		);
		await enqueue(
			db,
			row({ id: "old-pending", status: "pending", createdAt: "2026-01-01T00:00:00.000Z" }),
		);
		await enqueue(
			db,
			row({ id: "new-sent", status: "sent", createdAt: "2026-07-01T00:00:00.000Z" }),
		);

		const deleted = await reap(db, "2026-06-01T00:00:00.000Z", ["sent", "failed", "dropped"]);

		expect(deleted).toEqual(["old-sent"]);
		expect(await listNotifications(db, { kind: "by-id", id: "old-sent" })).toHaveLength(0);
		// Not terminal status → survives even though old.
		expect(await listNotifications(db, { kind: "by-id", id: "old-pending" })).toHaveLength(1);
		// Terminal status but not old enough → survives.
		expect(await listNotifications(db, { kind: "by-id", id: "new-sent" })).toHaveLength(1);
	});
});
