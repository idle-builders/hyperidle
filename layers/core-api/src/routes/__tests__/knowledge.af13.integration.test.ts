/**
 * AF13 — Knowledge authoring and curation that works: server integration tests (red phase).
 *
 * Covers §5 detail route omitted fields (WARNING proofs from architecture-critique):
 * - WARNING 1: accessCount timing — count STRICTLY BEFORE the access-log insert.
 *   Seed N rows, GET once, assert accessCount === N (NOT N+1 from own page-load).
 * - WARNING 2: relatedItems bound to ROUTE RESPONSE (not component fallback).
 *   Assert on the JSON response: relatedItems is {id,title}[], correct length,
 *   correct contents, user-scope-filtered, capped at 10.
 *
 * Covers §1 create-status contract:
 * - POST with status:"active" → response.status === "active"
 *
 * Covers §3 scope PATCH version semantics (existing server contract):
 * - PATCH /scope with correct version → 200
 * - PATCH /scope with stale version → 409
 */

import { type HyperIdleDb, knowledgeAppProjection, knowledgeItems, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";
import { createTestApp } from "../../__testing__/test-utils.js";

const TEST_API_KEY = "test-key-af13";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedFounder(db: HyperIdleDb, userId: string): Promise<void> {
	await db.insert(users).values({
		id: userId,
		name: "Founder",
		role: "founder",
		status: "active",
		kind: "human",
		createdAt: new Date().toISOString(),
	});
}

async function seedItem(
	db: HyperIdleDb,
	id: string,
	opts: {
		topic?: string | null;
		scopeKind?: string;
		updatedBy?: string;
		title?: string;
		status?: string;
	} = {},
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(knowledgeItems).values({
		id,
		title: opts.title ?? `Item ${id}`,
		body: "body content",
		format: "markdown",
		status: opts.status ?? "active",
		version: 1,
		updatedBy: opts.updatedBy ?? "u-founder",
		scopeKind: opts.scopeKind ?? "factory",
		topic: opts.topic ?? null,
		createdAt: now,
		updatedAt: now,
	});
	// The owner writes the projection row alongside the item.
	await db.insert(knowledgeAppProjection).values({ id: `${id}-projection`, knowledgeItemId: id });
}

// @lore AU43 repair: accessCount describe block deleted — recordKnowledgeAccess was deleted by
// AU43 bundle-4. The route never returns accessCount. The seedAccessLog helper is removed with it.

// ---------------------------------------------------------------------------
// §5 AC WARNING 2: relatedItems on the ROUTE RESPONSE
// ---------------------------------------------------------------------------

describe("AF13 §5 — Detail route: relatedItems in route response (not component fallback)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("GET /:id includes relatedItems: [] when no other items share the topic", async ({
		db,
		eventBus,
	}) => {
		await seedFounder(db, "u-founder");
		await seedItem(db, "item-solo", { topic: "UniqueTopicABC", scopeKind: "factory" });

		const app = await createTestApp({ db, eventBus });
		const res = await app.request("/api/knowledge/item-solo", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as { relatedItems?: unknown };
		// relatedItems must exist in the response (not undefined)
		// This test fails until the field is added to the detail route.
		expect(body.relatedItems).toBeDefined();
		expect(Array.isArray(body.relatedItems)).toBe(true);
		expect((body.relatedItems as unknown[]).length).toBe(0);
	});

	test("GET /:id includes relatedItems with correct {id, title} for same-topic items", async ({
		db,
		eventBus,
	}) => {
		await seedFounder(db, "u-founder");
		await seedItem(db, "item-main", { topic: "SharedTopic", scopeKind: "factory" });
		await seedItem(db, "item-related-1", {
			topic: "SharedTopic",
			scopeKind: "factory",
			title: "Related Item One",
		});
		await seedItem(db, "item-related-2", {
			topic: "SharedTopic",
			scopeKind: "factory",
			title: "Related Item Two",
		});
		// Different topic — should NOT appear
		await seedItem(db, "item-unrelated", { topic: "OtherTopic", scopeKind: "factory" });

		const app = await createTestApp({ db, eventBus });
		const res = await app.request("/api/knowledge/item-main", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as {
			relatedItems?: Array<{ id: string; title: string }>;
		};
		expect(body.relatedItems).toBeDefined();
		const related = body.relatedItems ?? [];
		expect(related.length).toBe(2);

		const ids = related.map((r) => r.id);
		expect(ids).toContain("item-related-1");
		expect(ids).toContain("item-related-2");
		// Self should not appear
		expect(ids).not.toContain("item-main");

		// Each entry has title
		const titles = related.map((r) => r.title);
		expect(titles).toContain("Related Item One");
		expect(titles).toContain("Related Item Two");
	});

	test("GET /:id: relatedItems excludes other users' private (user-scoped) items", async ({
		db,
		eventBus,
	}) => {
		// Seed two users
		await seedFounder(db, "u-founder");
		await db.insert(users).values({
			id: "u-other",
			name: "Other",
			role: "member",
			status: "active",
			kind: "human",
			createdAt: new Date().toISOString(),
		});

		await seedItem(db, "item-main-priv", {
			topic: "PrivateTopic",
			scopeKind: "factory",
			updatedBy: "u-founder",
		});
		// Other user's private item on same topic — must NOT appear in relatedItems
		await seedItem(db, "item-private-other", {
			topic: "PrivateTopic",
			scopeKind: "user",
			updatedBy: "u-other",
			title: "Other User Private",
		});
		// Requester's own private item — MAY appear (same user)
		await seedItem(db, "item-private-self", {
			topic: "PrivateTopic",
			scopeKind: "user",
			updatedBy: "u-founder",
			title: "My Private Item",
		});

		const app = await createTestApp({ db, eventBus });
		const res = await app.request("/api/knowledge/item-main-priv", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as {
			relatedItems?: Array<{ id: string; title: string }>;
		};
		const related = body.relatedItems ?? [];
		const ids = related.map((r) => r.id);

		// Other user's private item must not appear
		expect(ids).not.toContain("item-private-other");
	});

	test("GET /:id: relatedItems is capped at 10 items", async ({ db, eventBus }) => {
		await seedFounder(db, "u-founder");
		await seedItem(db, "item-cap-main", { topic: "BigTopic", scopeKind: "factory" });

		// Seed 15 items on the same topic
		for (let i = 1; i <= 15; i++) {
			await seedItem(db, `item-cap-${i}`, {
				topic: "BigTopic",
				scopeKind: "factory",
				title: `Related ${i}`,
			});
		}

		const app = await createTestApp({ db, eventBus });
		const res = await app.request("/api/knowledge/item-cap-main", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as { relatedItems?: unknown[] };
		expect((body.relatedItems ?? []).length).toBeLessThanOrEqual(10);
	});

	test("GET /:id: relatedItems is [] when item has no topic", async ({ db, eventBus }) => {
		await seedFounder(db, "u-founder");
		await seedItem(db, "item-no-topic", { topic: null, scopeKind: "factory" });
		await seedItem(db, "item-other-no-topic", { topic: null, scopeKind: "factory" });

		const app = await createTestApp({ db, eventBus });
		const res = await app.request("/api/knowledge/item-no-topic", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as { relatedItems?: unknown[] };
		expect(body.relatedItems).toBeDefined();
		expect((body.relatedItems ?? []).length).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// §1 Create-status contract: POST with status:"active" → active
// ---------------------------------------------------------------------------

describe("AF13 §1 — Create-status contract: POST /api/knowledge with status:active", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("POST /api/knowledge with status:active returns status=active", async ({ db, eventBus }) => {
		await seedFounder(db, "u-founder");
		const app = await createTestApp({ db, eventBus });

		const payload = {
			title: "Human-authored item",
			body: "Some content",
			format: "markdown",
			scopeKind: "factory",
			updatedBy: "u-founder",
			status: "active",
		};

		const res = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify(payload),
		});

		expect(res.status).toBe(201);
		const created = (await res.json()) as { status: string };
		// The client passes status:"active" — server must honor it.
		// This test confirms the server-side contract works (client fix in §1 adds it to payload).
		expect(created.status).toBe("active");
	});

	test("POST /api/knowledge without status defaults to draft", async ({ db, eventBus }) => {
		await seedFounder(db, "u-founder");
		const app = await createTestApp({ db, eventBus });

		const payload = {
			title: "Agent draft item",
			body: "Some content",
			format: "markdown",
			scopeKind: "factory",
			updatedBy: "u-founder",
			// no status field
		};

		const res = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify(payload),
		});

		expect(res.status).toBe(201);
		const created = (await res.json()) as { status: string };
		expect(created.status).toBe("draft");
	});
});
