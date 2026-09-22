import { agentSessionRequests, type HyperIdleDb, users } from "@hyperidle/db";
import { enqueue, listNotifications } from "@hyperidle/notifications";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test as fixtureTest } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-au3-domain";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedFounder(db: HyperIdleDb): Promise<void> {
	await db.insert(users).values({
		id: "u-au3-founder",
		name: "Founder",
		role: "founder",
		status: "active",
		kind: "human",
		createdAt: new Date().toISOString(),
	});
}

describe("app runtime domain observability", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	fixtureTest(
		"document projection, routine request, and notifications stay observable",
		async ({ app, db }) => {
			await seedFounder(db);

			// @lore document-module B20: the route this drove (`POST`/`GET
			// /api/knowledge`) is deleted; the door is `POST /api/actions/<name>`
			// now — `edit_document` (upsert) then `open_document` (read back).
			const createRes = await app.request("/api/actions/edit_document", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					title: "AU3 preserved document",
					body: "Projection survives runtime migration.",
					format: "markdown",
					scopeKind: "factory",
				}),
			});
			expect(createRes.status).toBe(200);
			const created = (await createRes.json()) as {
				ok: boolean;
				data: { document: { id: string } };
			};
			expect(created.ok).toBe(true);
			const createdId = created.data.document.id;

			const detailRes = await app.request("/api/actions/open_document", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ id: createdId }),
			});
			expect(detailRes.status).toBe(200);
			const detail = (await detailRes.json()) as {
				ok: boolean;
				data: { document: { id: string; title: string } };
			};
			expect(detail.ok).toBe(true);
			expect(detail.data.document).toMatchObject({
				id: createdId,
				title: "AU3 preserved document",
			});

			// @lore AU20 Ag6b: `enqueueNotification` removed from public API; use `enqueue`.
			// @lore AU44 batch 4: flush/deliver deleted — dispatcher abstraction removed.
			// Notification observability is verified by the row persisting in the inbox
			// (unread filter) rather than transitioning to "sent" via a flush.
			const notifId = crypto.randomUUID();
			await enqueue(db, {
				id: notifId,
				eventType: "au3.domain",
				subjectId: createdId,
				severity: "digest",
				title: "AU3 notification",
				body: "Notification path still persists.",
				reason: "notification_event",
				channel: null,
				status: "pending",
				attempts: 0,
				createdAt: new Date().toISOString(),
			});
			const queued = await listNotifications(db, { kind: "unread" });
			expect(queued.some((r) => r.eventType === "au3.domain")).toBe(true);

			const routinesRes = await app.request("/api/routines", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(routinesRes.status).toBe(200);

			const requests = await db.select().from(agentSessionRequests);
			expect(Array.isArray(requests)).toBe(true);

			// Verify the notification row is still in the inbox (inbox is the surviving delivery path)
			const inbox = await listNotifications(db, { kind: "unread" });
			const found = inbox.find((r) => r.eventType === "au3.domain");
			expect(found?.status).toBe("pending");
		},
	);
});
