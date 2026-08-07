/**
 * AU20 STAGE 1 — Notifications service completeness contract.
 *
 * Pins every capability the notifications service must deliver via its
 * PUBLIC barrel (`@hyperidle/notifications`). All tests run against the
 * CURRENT (pre-rewrite) code. Stage 2 keeps these green on the new API,
 * proving zero capability loss.
 *
 * Gaps this file fills (all missing from existing integration tests):
 *   1. enqueue: queue-cap eviction — blocking evicts oldest digest at capacity
 *   2. enqueue: queue-cap drop — digest silently dropped when queue full
 *   3. readConfig: direct function call with secret redaction
 *   4. readPreferences: direct function call (empty; after updatePreferences)
 *   5. deliver digest: direct call — sends batched notification, marks rows sent
 *   6. deliver digest: direct call — noop when no pending digest rows
 *   7. deliver test: direct call — sends through adapter, no queue write
 *   8. deliver test: direct call — ok:false when recipient not configured for channel
 *   9. updateConfig: SSRF guard rejects private-IP ntfy URL (direct call)
 *  10. deliver flush: returns disabled:true when notifications not enabled
 *
 * @lore AU20 Stage 2: flush/runDigest/sendTest removed from public surface.
 * Tests migrated to deliver({kind:"flush"|"digest"|"test"}) with discriminated
 * DeliveryResult — result.kind narrows access to kind-specific fields.
 */

import type { NewNotificationQueueRow } from "@hyperidle/db";
import {
	deliver,
	enqueue,
	listNotifications,
	type Notification,
	type NotificationAdapter,
	type NotificationChannel,
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
		reason: "digest",
		channel: "console",
		status: "pending",
		attempts: 0,
		createdAt: "2026-07-01T00:00:00.000Z",
		...overrides,
	};
}

interface AdapterCall {
	recipient: { channelId: string };
	notification: Notification;
}

function createFakeAdapter(channel: NotificationChannel = "console"): NotificationAdapter & {
	calls: AdapterCall[];
} {
	const calls: AdapterCall[] = [];
	return {
		name: channel,
		calls,
		async send(recipient, notification) {
			calls.push({ recipient, notification });
			return { ok: true, channel, sentAt: new Date().toISOString() };
		},
	};
}

// ---------------------------------------------------------------------------
// 1. enqueue — queue-cap eviction (blocking evicts oldest digest)
// ---------------------------------------------------------------------------

describe("enqueue — queue-cap eviction", () => {
	test("blocking row at cap evicts the oldest digest row", async ({ db }) => {
		await enqueue(
			db,
			pendingRow({ id: "d-oldest", severity: "digest", createdAt: "2026-07-01T00:00:00.000Z" }),
		);
		await enqueue(
			db,
			pendingRow({ id: "d-newer", severity: "digest", createdAt: "2026-07-01T00:01:00.000Z" }),
		);
		await enqueue(
			db,
			pendingRow({ id: "b-existing", severity: "blocking", createdAt: "2026-07-01T00:02:00.000Z" }),
		);

		const digestRows = await listNotifications(db, { kind: "pending-digest" });
		expect(digestRows.map((r) => r.id)).toEqual(["d-oldest", "d-newer"]);

		const allPending = await listNotifications(db, { kind: "pending" });
		expect(allPending.map((r) => r.id)).toEqual(["d-oldest", "d-newer", "b-existing"]);
	});

	test("digest row is silently dropped when queue is at cap (no blocking/digest eviction of blocking rows)", async ({
		db,
	}) => {
		await enqueue(db, pendingRow({ id: "b-only", severity: "blocking" }));

		const digestRows = await listNotifications(db, { kind: "pending-digest" });
		expect(digestRows).toHaveLength(0);

		const allPending = await listNotifications(db, { kind: "pending" });
		expect(allPending.map((r) => r.id)).toEqual(["b-only"]);
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

	test("returns SafeNotificationConfig with SMTP password and ntfy token redacted", async ({
		db,
	}) => {
		await updateConfig(
			db,
			{
				enabled: true,
				primaryChannel: "console",
				smtpHost: "smtp.example.com",
				smtpPassword: "super-secret",
				ntfyAuthToken: "tk_verysecret",
				smtpFrom: "ops@example.com",
			},
			notificationsDeps,
		);

		const cfg = await readConfig(db, notificationsDeps);

		expect(cfg.enabled).toBe(true);
		expect(cfg.smtp.passwordSet).toBe(true);
		expect(cfg.smtp.password).toBe("***");
		expect(cfg.ntfy.authTokenSet).toBe(true);
		expect(cfg.ntfy.authToken).toBe("***");

		const serialized = JSON.stringify(cfg as unknown);
		expect(serialized).not.toContain("super-secret");
		expect(serialized).not.toContain("tk_verysecret");
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
// 5–6. deliver digest — direct function call
// ---------------------------------------------------------------------------

describe("deliver digest — direct call", () => {
	test("sends a batched notification for pending digest rows and marks them sent", async ({
		db,
	}) => {
		await updateConfig(
			db,
			{
				enabled: true,
				primaryChannel: "console",
				digestChannel: "console",
			},
			notificationsDeps,
		);

		const now = "2026-07-01T08:00:00.000Z";
		for (const id of ["dg-a", "dg-b", "dg-c"]) {
			await enqueue(
				db,
				pendingRow({
					id,
					severity: "digest",
					reason: "digest",
					channel: "console",
					createdAt: now,
				}),
			);
		}

		const adapter = createFakeAdapter();
		const result = await deliver(db, { kind: "digest" }, notificationsDeps, {
			adapterOverride: adapter,
		});

		expect(result.kind).toBe("digest");
		if (result.kind !== "digest") throw new Error("unexpected kind");
		expect(result.status).toBe("sent");
		expect(result.notificationsIncluded).toBe(3);
		expect(adapter.calls).toHaveLength(1);

		const rows = await listNotifications(db, { kind: "all" });
		expect(rows.every((r) => r.status === "sent")).toBe(true);
	});

	test("returns noop when no pending digest rows exist", async ({ db }) => {
		await updateConfig(
			db,
			{ enabled: true, primaryChannel: "console", digestChannel: "console" },
			notificationsDeps,
		);

		const adapter = createFakeAdapter();
		const result = await deliver(db, { kind: "digest" }, notificationsDeps, {
			adapterOverride: adapter,
		});

		expect(result.kind).toBe("digest");
		if (result.kind !== "digest") throw new Error("unexpected kind");
		expect(result.status).toBe("noop");
		expect(result.notificationsIncluded).toBe(0);
		expect(adapter.calls).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// 7–8. deliver test — direct function call
// ---------------------------------------------------------------------------

describe("deliver test — direct call", () => {
	test("sends through the adapter and does NOT write to the notification queue", async ({ db }) => {
		await updateConfig(db, { enabled: true, primaryChannel: "console" }, notificationsDeps);

		const adapter = createFakeAdapter();
		const result = await deliver(db, { kind: "test", channel: "console" }, notificationsDeps, {
			adapterOverride: adapter,
		});

		expect(result.kind).toBe("test");
		if (result.kind !== "test") throw new Error("unexpected kind");
		expect(result.ok).toBe(true);
		expect(result.channel).toBe("console");
		expect(adapter.calls).toHaveLength(1);
		expect(adapter.calls[0]!.notification.title).toContain("test");

		const rows = await listNotifications(db, { kind: "all" });
		expect(rows).toHaveLength(0);
	});

	test("returns ok:false when the recipient is not configured for the requested channel", async ({
		db,
	}) => {
		await updateConfig(db, { enabled: true, primaryChannel: "console" }, notificationsDeps);

		const result = await deliver(db, { kind: "test", channel: "ntfy" }, notificationsDeps);

		expect(result.kind).toBe("test");
		if (result.kind !== "test") throw new Error("unexpected kind");
		expect(result.ok).toBe(false);
		expect(result.channel).toBe("ntfy");
		expect(result.error).toContain("recipient not configured");
	});

	test("defaults to primary channel when channel is omitted from spec", async ({ db }) => {
		await updateConfig(db, { enabled: true, primaryChannel: "console" }, notificationsDeps);

		const adapter = createFakeAdapter();
		const result = await deliver(db, { kind: "test" }, notificationsDeps, {
			adapterOverride: adapter,
		});

		expect(result.kind).toBe("test");
		if (result.kind !== "test") throw new Error("unexpected kind");
		expect(result.ok).toBe(true);
		expect(result.channel).toBe("console");
	});
});

// ---------------------------------------------------------------------------
// 9. updateConfig — SSRF guard, direct function call
// ---------------------------------------------------------------------------

describe("updateConfig — validation (direct call)", () => {
	test("throws NOTIFICATIONS_VALIDATION_ERROR for a private-IP ntfy URL", async ({ db }) => {
		await expect(
			updateConfig(db, { ntfyBaseUrl: "https://169.254.169.254/" }, notificationsDeps),
		).rejects.toMatchObject({ code: "NOTIFICATIONS_VALIDATION_ERROR" });
	});

	test("throws NOTIFICATIONS_VALIDATION_ERROR for a private-range IP ntfy URL", async ({ db }) => {
		await expect(
			updateConfig(db, { ntfyBaseUrl: "https://10.0.0.5/" }, notificationsDeps),
		).rejects.toMatchObject({ code: "NOTIFICATIONS_VALIDATION_ERROR" });
	});

	test("throws NOTIFICATIONS_VALIDATION_ERROR for a malformed email", async ({ db }) => {
		await expect(
			updateConfig(db, { recipientEmail: "not-an-email" }, notificationsDeps),
		).rejects.toMatchObject({ code: "NOTIFICATIONS_VALIDATION_ERROR" });
	});

	test("throws NOTIFICATIONS_VALIDATION_ERROR for an SMTP credential with CR/LF injection", async ({
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
				recipientEmail: "ops@example.com",
				recipientNtfyTopic: "factory-alerts",
			},
			notificationsDeps,
		);

		expect(cfg.enabled).toBe(true);
		expect(cfg.recipient.email).toBe("ops@example.com");
		expect(cfg.recipient.ntfyTopic).toBe("factory-alerts");
	});
});

// ---------------------------------------------------------------------------
// 10. deliver flush — disabled path
// ---------------------------------------------------------------------------

describe("deliver flush — disabled path", () => {
	test("returns disabled:true when notifications are not enabled", async ({ db }) => {
		const adapter = createFakeAdapter();
		const result = await deliver(db, { kind: "flush" }, notificationsDeps, {
			adapterOverride: adapter,
		});

		expect(result.kind).toBe("flush");
		if (result.kind !== "flush") throw new Error("unexpected kind");
		expect(result.disabled).toBe(true);
		expect(result.flushed).toBe(0);
		expect(result.failed).toBe(0);
		expect(result.deferred).toBe(0);
		expect(adapter.calls).toHaveLength(0);
	});

	test("returns disabled:true after explicitly disabling notifications", async ({ db }) => {
		await updateConfig(db, { enabled: true, primaryChannel: "console" }, notificationsDeps);
		await updateConfig(db, { enabled: false }, notificationsDeps);

		const adapter = createFakeAdapter();
		const result = await deliver(db, { kind: "flush" }, notificationsDeps, {
			adapterOverride: adapter,
		});

		expect(result.kind).toBe("flush");
		if (result.kind !== "flush") throw new Error("unexpected kind");
		expect(result.disabled).toBe(true);
		expect(adapter.calls).toHaveLength(0);
	});
});
