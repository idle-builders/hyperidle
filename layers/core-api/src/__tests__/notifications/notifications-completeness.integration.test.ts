/**
 * AU20 STAGE 1 — Notifications service completeness contract.
 *
 * Pins every capability the notifications service must deliver via its
 * PUBLIC barrel (`@hyperidle/notifications`).
 *
 * @lore AU44 batch 4: tests for flush, digest, ntfy, and dead filter variants
 * deleted along with those features. Queue-cap eviction test updated to use
 * direct DB query. readConfig test updated to remove ntfy/recipient fields.
 * SSRF tests for ntfy URL removed (ntfy feature deleted). deliver{kind:"test"}
 * updated to match new API (no channel field, no adapterOverride).
 *
 * Surviving tests:
 *   1. enqueue: queue-cap eviction — oldest pending row evicted at capacity
 *   2. readConfig: direct function call with SMTP password secret redaction
 *   3. readPreferences: direct function call (empty; after updatePreferences)
 *   4. deliver test: direct call — returns a DeliveryResult shape
 *   5. updateConfig: validation rejects SMTP injection
 */

import type { NewNotificationQueueRow } from "@hyperidle/db";
import { type HyperIdleDb, notificationQueue } from "@hyperidle/db";
import {
	deliver,
	enqueue,
	readConfig,
	readPreferences,
	updateConfig,
	updatePreferences,
} from "@hyperidle/notifications";
import { afterEach, beforeEach, vi } from "vitest";
import { describe, expect, test } from "../../__testing__/test-fixtures.js";
import { notificationsDeps } from "../notifications-test-deps.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pendingRow(
	overrides: Partial<NewNotificationQueueRow> & { id: string },
): NewNotificationQueueRow {
	return {
		eventType: "test_event",
		subjectId: null,
		severity: "digest",
		title: overrides.id,
		body: "body",
		reason: "notification_event",
		channel: null,
		status: "pending",
		attempts: 0,
		createdAt: "2026-07-01T00:00:00.000Z",
		...overrides,
	};
}

async function allRows(db: HyperIdleDb) {
	return db.select().from(notificationQueue);
}

// ---------------------------------------------------------------------------
// 1. enqueue — queue-cap eviction (validates the cap logic survives)
// ---------------------------------------------------------------------------

describe("enqueue — queue-cap eviction", () => {
	test("two pending rows are inserted and both survive without eviction", async ({ db }) => {
		await enqueue(db, pendingRow({ id: "e-a", createdAt: "2026-07-01T00:00:00.000Z" }));
		await enqueue(db, pendingRow({ id: "e-b", createdAt: "2026-07-01T00:01:00.000Z" }));

		const rows = await allRows(db);
		expect(rows.map((r) => r.id).sort()).toEqual(["e-a", "e-b"]);
	});

	test("ten thousand pending rows trigger eviction of the oldest on the next insert", async ({
		db,
	}) => {
		// Insert a sentinel row that should be evicted (oldest createdAt)
		const oldTs = "2026-01-01T00:00:00.000Z";
		await enqueue(db, pendingRow({ id: "oldest", createdAt: oldTs }));

		// Fill the rest of the cap with newer rows
		const cap = 10_000;
		for (let i = 0; i < cap - 1; i++) {
			await enqueue(
				db,
				pendingRow({ id: `fill-${i}`, createdAt: new Date(Date.now() + i).toISOString() }),
			);
		}
		// Queue is now exactly at cap. One more insert should evict "oldest".
		await enqueue(
			db,
			pendingRow({ id: "newcomer", createdAt: new Date(Date.now() + cap).toISOString() }),
		);

		const ids = (await allRows(db)).map((r) => r.id);
		// "oldest" changed to "dropped" status; it is still present in the table
		// but NOT pending anymore — the cap predicate only counts pending rows.
		const oldestRow = (await allRows(db)).find((r) => r.id === "oldest");
		expect(oldestRow?.status).toBe("dropped");
		// newcomer was inserted successfully
		expect(ids).toContain("newcomer");
	});
});

// ---------------------------------------------------------------------------
// 2. readConfig — direct function call, secrets redacted
// ---------------------------------------------------------------------------

describe("readConfig — direct call", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", "test-key-readconfig-completeness");
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns SafeNotificationConfig with SMTP password redacted", async ({ db }) => {
		await updateConfig(
			db,
			{
				enabled: true,
				smtpHost: "smtp.example.com",
				smtpPassword: "super-secret",
				smtpFrom: "ops@example.com",
			},
			notificationsDeps,
		);

		const cfg = await readConfig(db, notificationsDeps);

		expect(cfg.enabled).toBe(true);
		expect(cfg.smtp.passwordSet).toBe(true);
		expect(cfg.smtp.password).toBe("***");

		const serialized = JSON.stringify(cfg as unknown);
		expect(serialized).not.toContain("super-secret");
	});

	test("returns disabled config before any config write", async ({ db }) => {
		const cfg = await readConfig(db, notificationsDeps);
		expect(cfg.enabled).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 3–4. readPreferences — direct function call
// ---------------------------------------------------------------------------

describe("readPreferences — direct call", () => {
	test("returns an empty array when no types are muted", async ({ db }) => {
		const prefs = await readPreferences(db, notificationsDeps);
		expect(Array.isArray(prefs)).toBe(true);
		expect(prefs).toHaveLength(0);
	});

	test("returns muted type keys after updatePreferences", async ({ db }) => {
		await updatePreferences(db, "review_request", true, notificationsDeps);

		const prefs = await readPreferences(db, notificationsDeps);
		expect(prefs).toContain("review_request");

		await updatePreferences(db, "review_request", false, notificationsDeps);
		const afterUnmute = await readPreferences(db, notificationsDeps);
		expect(afterUnmute).not.toContain("review_request");
	});

	test("muting a second type adds it alongside the first", async ({ db }) => {
		await updatePreferences(db, "review_request", true, notificationsDeps);
		await updatePreferences(db, "blocker_alert", true, notificationsDeps);

		const prefs = await readPreferences(db, notificationsDeps);
		expect(prefs).toContain("review_request");
		expect(prefs).toContain("blocker_alert");
	});

	test("idempotent: muting an already-muted type does not duplicate it", async ({ db }) => {
		await updatePreferences(db, "review_request", true, notificationsDeps);
		await updatePreferences(db, "review_request", true, notificationsDeps);

		const prefs = await readPreferences(db, notificationsDeps);
		const count = prefs.filter((k) => k === "review_request").length;
		expect(count).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// 5. deliver test — direct function call
// ---------------------------------------------------------------------------

describe("deliver test — direct call", () => {
	test("returns a DeliveryResult with kind=test when SMTP is not configured", async ({ db }) => {
		const result = await deliver(db, { kind: "test" }, notificationsDeps);

		expect(result.kind).toBe("test");
		// With no SMTP config, ok will be false and error will describe the missing config
		expect(typeof result.ok).toBe("boolean");
		if (!result.ok) {
			expect(typeof result.error).toBe("string");
		}
		// test deliver does NOT write to the notification queue
		expect(await allRows(db)).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// 6. updateConfig — validation
// ---------------------------------------------------------------------------

describe("updateConfig — validation (direct call)", () => {
	test("throws NOTIFICATIONS_VALIDATION_ERROR for SMTP username with CR/LF injection", async ({
		db,
	}) => {
		await expect(
			updateConfig(db, { smtpUsername: "user\r\nDATA\r\nSubject: injected" }, notificationsDeps),
		).rejects.toMatchObject({ code: "NOTIFICATIONS_VALIDATION_ERROR" });
	});

	test("persists a valid partial patch and returns the updated SafeNotificationConfig", async ({
		db,
	}) => {
		const cfg = await updateConfig(
			db,
			{
				enabled: true,
				smtpHost: "smtp.example.com",
				smtpFrom: "ops@example.com",
			},
			notificationsDeps,
		);

		expect(cfg.enabled).toBe(true);
		expect(cfg.smtp.host).toBe("smtp.example.com");
		expect(cfg.smtp.from).toBe("ops@example.com");
	});
});
