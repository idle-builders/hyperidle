/**
 * AU14 round 2 — route-level net-new locks (plans/AU14/architecture-round2.md §11):
 * - Test 1: `searchByText` LIKE-vs-FTS lock — a topic-only substring match FTS
 *   (title+body only) would not return.
 * - Test 5b: `flagItem`'s route-level cross-domain atomic composition — with
 *   `agentId` present, both the flag edit-log row AND an `agentWorkIntents` row
 *   exist, keyed by the shared idempotencyKey; without `agentId`, no intent row.
 */
import { agentWorkIntents, type HyperIdleDb, knowledgeEditLog, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-au14-round2";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("GET /api/knowledge/search LIKE-vs-FTS substring lock", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("GET /api/knowledge/search matches a topic-only substring FTS would not find", async ({
		app,
	}) => {
		// title/body deliberately do NOT contain the query term — only topic does.
		// FTS indexes title+body only (fts.ts), so an FTS-backed search would miss this.
		const createRes = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				topic: "kubernetes-networking",
				title: "Cluster setup notes",
				body: "General notes about the cluster environment.",
				format: "markdown",
				scopeKind: "factory",
				updatedBy: "human",
			}),
		});
		expect(createRes.status).toBe(201);
		const created = (await createRes.json()) as { id: string };

		const res = await app.request("/api/knowledge/search?q=kubernetes", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { results: Array<{ id: string }> };
		expect(body.results.some((r) => r.id === created.id)).toBe(true);
	});
});

describe("POST /:id/flag cross-domain atomic composition with agent work intents", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	async function seedAgent(db: HyperIdleDb, id: string): Promise<void> {
		await db.insert(users).values({
			id,
			name: "Agent",
			role: "agent",
			status: "active",
			kind: "agent",
			createdAt: new Date().toISOString(),
		});
	}

	async function createItem(app: Pick<Hono, "request">): Promise<{ id: string }> {
		const res = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				title: "Flag me",
				body: "Body content",
				format: "markdown",
				scopeKind: "factory",
				updatedBy: "human",
			}),
		});
		return (await res.json()) as { id: string };
	}

	test("flag WITH agentId commits both the flag edit-log row and the agentWorkIntents row atomically", async ({
		db,
		app,
		ids,
	}) => {
		await seedAgent(db, ids("agent-flagger"));
		const item = await createItem(app);

		const res = await app.request(`/api/knowledge/${item.id}/flag`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ reason: "Needs review", agentId: ids("agent-flagger") }),
		});
		expect(res.status).toBe(200);

		const logs = await db
			.select()
			.from(knowledgeEditLog)
			.where(eq(knowledgeEditLog.itemId, item.id));
		const flagLog = logs.find((l) => l.editType === "flag");
		expect(flagLog).toBeDefined();
		const editId = flagLog?.id as string;

		const intents = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.idempotencyKey, `knowledge:${item.id}:review:${editId}`));
		expect(intents).toHaveLength(1);
		expect(intents[0]?.requestedBy).toBe(ids("agent-flagger"));
	});

	test("flag WITHOUT agentId records the flag edit-log row but creates no agentWorkIntents row", async ({
		db,
		app,
	}) => {
		const item = await createItem(app);

		const res = await app.request(`/api/knowledge/${item.id}/flag`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ reason: "Needs review" }),
		});
		expect(res.status).toBe(200);

		const logs = await db
			.select()
			.from(knowledgeEditLog)
			.where(eq(knowledgeEditLog.itemId, item.id));
		const flagLog = logs.find((l) => l.editType === "flag");
		expect(flagLog).toBeDefined();

		// AU38 P4: the absence claim is scoped to this test's own item — in a
		// populated world other tests' intent rows exist.
		const relatedIntents = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, `knowledge:${item.id}`));
		expect(relatedIntents).toHaveLength(0);
	});
});
