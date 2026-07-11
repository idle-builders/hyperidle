import { agentSessionRequests, type HyperIdleDb, notificationQueue, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { defaultNotificationAdapterFactory } from "../notifications/adapter-factory.js";
import { enqueueNotification, flushQueue } from "../notifications/dispatcher.js";
import {
	getKnowledgeProjection,
	upsertKnowledgeProjection,
} from "../services/knowledge/projections.js";
import { test as fixtureTest } from "../test-fixtures.js";

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
		"knowledge projection, routine request, notifications, and git export stay observable",
		async ({ app, db }) => {
			await seedFounder(db);

			const createRes = await app.request("/api/knowledge", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					title: "AU3 preserved knowledge",
					body: "Projection survives runtime migration.",
					format: "markdown",
					updatedBy: "u-au3-founder",
					scopeKind: "factory",
				}),
			});
			expect(createRes.status).toBe(201);
			const created = (await createRes.json()) as { id: string };

			await upsertKnowledgeProjection(db, created.id, {
				layer: "L4",
				kind: "decision",
				relevanceScore: "0.91",
				attentionScore: "0.73",
				confidence: "0.88",
			});
			const projection = await getKnowledgeProjection(db, created.id);
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

			await enqueueNotification(db, {
				eventType: "au3.domain",
				subjectId: created.id,
				severity: "digest",
				title: "AU3 notification",
				body: "Notification path still drains.",
				reason: "digest",
				channel: null,
				now: new Date(),
			});
			const queued = await db.select().from(notificationQueue);
			expect(queued).toHaveLength(1);

			await flushQueue(
				db,
				defaultNotificationAdapterFactory,
				{
					enabled: true,
					primaryChannel: "console",
					digestChannel: "console",
					recipient: { email: null, ntfyTopic: null },
					ntfy: { baseUrl: "https://ntfy.sh", authToken: null },
					smtp: {
						host: null,
						port: 587,
						secure: false,
						username: null,
						password: null,
						from: null,
					},
					flood: { maxPerMinute: 100, coalesceWindowMs: 60_000 },
					testMaxPerHour: 100,
					smtpIgnoreTls: false,
					digestCron: "0 8 * * *",
				},
				new Date(),
			);
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

			const gitStatusRes = await app.request("/api/git-export/status", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(gitStatusRes.status).toBe(200);
			const gitStatus = (await gitStatusRes.json()) as { enabled: boolean; branch: string };
			expect(typeof gitStatus.enabled).toBe("boolean");
			expect(typeof gitStatus.branch).toBe("string");

			const [sent] = await db
				.select()
				.from(notificationQueue)
				.where(eq(notificationQueue.eventType, "au3.domain"));
			expect(sent?.status).toBe("sent");
		},
	);
});
