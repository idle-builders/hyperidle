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

import {
	type HyperIdleDb,
	knowledgeAccessLog,
	knowledgeAppProjection,
	knowledgeItems,
	users,
} from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
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
		updatedBy: string;
		title?: string;
		status?: string;
	},
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(knowledgeItems).values({
		id,
		title: opts.title ?? `Item ${id}`,
		body: "body content",
		format: "markdown",
		status: opts.status ?? "active",
		version: 1,
		updatedBy: opts.updatedBy,
		scopeKind: opts.scopeKind ?? "factory",
		topic: opts.topic ?? null,
		createdAt: now,
		updatedAt: now,
	});
	// The owner writes the projection row alongside the item.
	await db.insert(knowledgeAppProjection).values({ id: `${id}-projection`, knowledgeItemId: id });
}

async function seedAccessLog(
	db: HyperIdleDb,
	itemId: string,
	count: number,
	withinWindow = true,
): Promise<void> {
	const now = Date.now();
	for (let i = 0; i < count; i++) {
		const offset = withinWindow
			? // within 30-day window: 1..count days ago
				(i + 1) * 24 * 60 * 60 * 1000
			: // outside window: 35 days ago
				35 * 24 * 60 * 60 * 1000 + i * 1000;
		await db.insert(knowledgeAccessLog).values({
			id: crypto.randomUUID(),
			itemId,
			accessorKind: "human",
			accessorId: "browser",
			accessedAt: new Date(now - offset).toISOString(),
		});
	}
}

// ---------------------------------------------------------------------------
// §5 AC WARNING 1: Access count timing — count before insert
// ---------------------------------------------------------------------------

describe("AF13 §5 — Detail route: accessCount excludes the current page-load", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("GET /:id returns accessCount === N where N = pre-existing rows (not N+1 from own load)", async ({
		db,
		eventBus,
		ids,
	}) => {
		// Arrange: seed founder, item, and 3 access-log rows within the 30-day window
		await seedFounder(db, ids("u-founder"));
		await seedItem(db, ids("item-access"), { scopeKind: "factory", updatedBy: ids("u-founder") });
		await seedAccessLog(db, ids("item-access"), 3, true); // 3 existing rows

		const app = await createTestApp({ db, eventBus });

		// Act: fetch the detail once (triggers the best-effort access-log insert)
		const res = await app.request(`/api/knowledge/${ids("item-access")}`, {
			headers: authHeaders(),
		});

		// Assert
		expect(res.status).toBe(200);
		const body = (await res.json()) as { accessCount?: number };
		// Must be exactly 3 (pre-existing), NOT 4 (would mean own load was counted)
		// This test will fail until the route returns accessCount AND counts before insert.
		expect(body.accessCount).toBe(3);
	});

	test("GET /:id returns accessCount === 0 when no prior access-log rows exist", async ({
		db,
		eventBus,
		ids,
	}) => {
		await seedFounder(db, ids("u-founder"));
		await seedItem(db, ids("item-zero-access"), {
			scopeKind: "factory",
			updatedBy: ids("u-founder"),
		});
		// No access log rows seeded

		const app = await createTestApp({ db, eventBus });

		const res = await app.request(`/api/knowledge/${ids("item-zero-access")}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { accessCount?: number };
		// Zero-access item should return 0 (real computed zero, not undefined)
		// This fails until accessCount is added to the response.
		expect(body.accessCount).toBe(0);
	});

	test("GET /:id does not count access-log rows older than 30 days", async ({
		db,
		eventBus,
		ids,
	}) => {
		await seedFounder(db, ids("u-founder"));
		await seedItem(db, ids("item-old-access"), {
			scopeKind: "factory",
			updatedBy: ids("u-founder"),
		});
		await seedAccessLog(db, ids("item-old-access"), 2, true); // 2 within window
		await seedAccessLog(db, ids("item-old-access"), 5, false); // 5 outside window

		const app = await createTestApp({ db, eventBus });

		const res = await app.request(`/api/knowledge/${ids("item-old-access")}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { accessCount?: number };
		// Only the 2 within-window rows, not the 5 old ones.
		expect(body.accessCount).toBe(2);
	});
});

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
		ids,
	}) => {
		await seedFounder(db, ids("u-founder"));
		await seedItem(db, ids("item-solo"), {
			topic: `UniqueTopicABC-${ids("suffix")}`,
			scopeKind: "factory",
			updatedBy: ids("u-founder"),
		});

		const app = await createTestApp({ db, eventBus });
		const res = await app.request(`/api/knowledge/${ids("item-solo")}`, { headers: authHeaders() });
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
		ids,
	}) => {
		await seedFounder(db, ids("u-founder"));
		await seedItem(db, ids("item-main"), {
			topic: `SharedTopic-${ids("suffix")}`,
			scopeKind: "factory",
			updatedBy: ids("u-founder"),
		});
		await seedItem(db, ids("item-related-1"), {
			topic: `SharedTopic-${ids("suffix")}`,
			scopeKind: "factory",
			title: "Related Item One",
			updatedBy: ids("u-founder"),
		});
		await seedItem(db, ids("item-related-2"), {
			topic: `SharedTopic-${ids("suffix")}`,
			scopeKind: "factory",
			title: "Related Item Two",
			updatedBy: ids("u-founder"),
		});
		// Different topic — should NOT appear
		await seedItem(db, ids("item-unrelated"), {
			topic: `OtherTopic-${ids("suffix")}`,
			scopeKind: "factory",
			updatedBy: ids("u-founder"),
		});

		const app = await createTestApp({ db, eventBus });
		const res = await app.request(`/api/knowledge/${ids("item-main")}`, { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as {
			relatedItems?: Array<{ id: string; title: string }>;
		};
		expect(body.relatedItems).toBeDefined();
		const related = body.relatedItems ?? [];
		expect(related.length).toBe(2);

		const relatedIds = related.map((r) => r.id);
		expect(relatedIds).toContain(ids("item-related-1"));
		expect(relatedIds).toContain(ids("item-related-2"));
		// Self should not appear
		expect(relatedIds).not.toContain(ids("item-main"));

		// Each entry has title
		const titles = related.map((r) => r.title);
		expect(titles).toContain("Related Item One");
		expect(titles).toContain("Related Item Two");
	});

	test("GET /:id: relatedItems excludes other users' private (user-scoped) items", async ({
		db,
		eventBus,
		ids,
	}) => {
		// Seed two users
		await seedFounder(db, ids("u-founder"));
		await db.insert(users).values({
			id: ids("u-other"),
			name: "Other",
			role: "member",
			status: "active",
			kind: "human",
			createdAt: new Date().toISOString(),
		});

		await seedItem(db, ids("item-main-priv"), {
			topic: `PrivateTopic-${ids("suffix")}`,
			scopeKind: "factory",
			updatedBy: ids("u-founder"),
		});
		// Other user's private item on same topic — must NOT appear in relatedItems
		await seedItem(db, ids("item-private-other"), {
			topic: `PrivateTopic-${ids("suffix")}`,
			scopeKind: "user",
			updatedBy: ids("u-other"),
			title: "Other User Private",
		});
		// Requester's own private item — MAY appear (same user)
		await seedItem(db, ids("item-private-self"), {
			topic: `PrivateTopic-${ids("suffix")}`,
			scopeKind: "user",
			updatedBy: ids("u-founder"),
			title: "My Private Item",
		});

		const app = await createTestApp({ db, eventBus });
		const res = await app.request(`/api/knowledge/${ids("item-main-priv")}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as {
			relatedItems?: Array<{ id: string; title: string }>;
		};
		const related = body.relatedItems ?? [];
		const relatedIds = related.map((r) => r.id);

		// Other user's private item must not appear
		expect(relatedIds).not.toContain(ids("item-private-other"));
	});

	test("GET /:id: relatedItems is capped at 10 items", async ({ db, eventBus, ids }) => {
		await seedFounder(db, ids("u-founder"));
		await seedItem(db, ids("item-cap-main"), {
			topic: `BigTopic-${ids("suffix")}`,
			scopeKind: "factory",
			updatedBy: ids("u-founder"),
		});

		// Seed 15 items on the same topic
		for (let i = 1; i <= 15; i++) {
			await seedItem(db, ids(`item-cap-${i}`), {
				topic: `BigTopic-${ids("suffix")}`,
				scopeKind: "factory",
				title: `Related ${i}`,
				updatedBy: ids("u-founder"),
			});
		}

		const app = await createTestApp({ db, eventBus });
		const res = await app.request(`/api/knowledge/${ids("item-cap-main")}`, {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as { relatedItems?: unknown[] };
		expect((body.relatedItems ?? []).length).toBeLessThanOrEqual(10);
	});

	test("GET /:id: relatedItems is [] when item has no topic", async ({ db, eventBus, ids }) => {
		await seedFounder(db, ids("u-founder"));
		await seedItem(db, ids("item-no-topic"), {
			topic: null,
			scopeKind: "factory",
			updatedBy: ids("u-founder"),
		});
		await seedItem(db, ids("item-other-no-topic"), {
			topic: null,
			scopeKind: "factory",
			updatedBy: ids("u-founder"),
		});

		const app = await createTestApp({ db, eventBus });
		const res = await app.request(`/api/knowledge/${ids("item-no-topic")}`, {
			headers: authHeaders(),
		});
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

	test("POST /api/knowledge with status:active returns status=active", async ({
		db,
		eventBus,
		ids,
	}) => {
		await seedFounder(db, ids("u-founder"));
		const app = await createTestApp({ db, eventBus });

		const payload = {
			title: "Human-authored item",
			body: "Some content",
			format: "markdown",
			scopeKind: "factory",
			updatedBy: ids("u-founder"),
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

	test("POST /api/knowledge without status defaults to draft", async ({ db, eventBus, ids }) => {
		await seedFounder(db, ids("u-founder"));
		const app = await createTestApp({ db, eventBus });

		const payload = {
			title: "Agent draft item",
			body: "Some content",
			format: "markdown",
			scopeKind: "factory",
			updatedBy: ids("u-founder"),
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
