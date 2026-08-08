import {
	agentSessionRequests,
	type HyperIdleDb,
	knowledgeAppProjection,
	users,
} from "@hyperidle/db";
import { deliver, enqueue, listNotifications, updateConfig } from "@hyperidle/notifications";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test as fixtureTest } from "../__testing__/test-fixtures.js";
import { notificationsDeps } from "./notifications-test-deps.js";

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
		"knowledge projection, routine request, and notifications stay observable",
		async ({ app, db }) => {
			await seedFounder(db);

			// @lore the raw projection UPDATE this test used to run is gone: the owner's `create`
			// (invoked by POST /api/knowledge) already inserts the projection row, so a second write
			// completing it is a rewrite, not a fix — and `layer`/`kind` are accepted directly in the
			// POST body, which is all this test actually asserts on (the three score fields the old
			// UPDATE also set were never read by any assertion here).
			const createRes = await app.request("/api/knowledge", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					title: "AU3 preserved knowledge",
					body: "Projection survives runtime migration.",
					format: "markdown",
					updatedBy: "u-au3-founder",
					scopeKind: "factory",
					kind: "decision",
					layer: "L4",
				}),
			});
			expect(createRes.status).toBe(201);
			const created = (await createRes.json()) as { id: string };

			const [projection] = await db
				.select()
				.from(knowledgeAppProjection)
				.where(eq(knowledgeAppProjection.knowledgeItemId, created.id))
				.limit(1);
			expect(projection).toMatchObject({
				knowledgeItemId: created.id,
				layer: "L4",
				kind: "decision",
			});

			const detailRes = await app.request(`/api/knowledge/${created.id}`, {
				method: "GET",
				headers: authHeaders(),
			});
			expect(detailRes.status).toBe(200);
			const detail = (await detailRes.json()) as { layer?: string; kind?: string };
			expect(detail).toMatchObject({ layer: "L4", kind: "decision" });

			// @lore AU20 Ag6b: `enqueueNotification` removed from public API; use `enqueue`
			// with explicit id/status/attempts/createdAt fields. `flush` wraps
			// loadNotificationConfig+flushQueue internally; no inline config needed.
			await enqueue(db, {
				id: crypto.randomUUID(),
				eventType: "au3.domain",
				subjectId: created.id,
				severity: "digest",
				title: "AU3 notification",
				body: "Notification path still drains.",
				reason: "digest",
				channel: null,
				status: "pending",
				attempts: 0,
				createdAt: new Date().toISOString(),
			});
			const queued = await listNotifications(db, { kind: "all" });
			expect(queued).toHaveLength(1);

			// Enable notifications so flush actually delivers (default config has enabled=false)
			await updateConfig(
				db,
				{
					enabled: true,
					primaryChannel: "console",
					digestChannel: "console",
					floodMaxPerMinute: 100,
					floodCoalesceWindowMs: 60_000,
				},
				notificationsDeps,
			);

			await deliver(db, { kind: "flush" }, notificationsDeps);
			const queueRes = await app.request("/api/notifications/queue?status=sent", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(queueRes.status).toBe(200);

			const routinesRes = await app.request("/api/routines", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(routinesRes.status).toBe(200);

			const requests = await db.select().from(agentSessionRequests);
			expect(Array.isArray(requests)).toBe(true);

			const sent = (await listNotifications(db, { kind: "all" })).find(
				(r) => r.eventType === "au3.domain",
			);
			expect(sent?.status).toBe("sent");
		},
	);
});
