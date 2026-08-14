/**
 * Y4 — Knowledge Triage Improvements: Server-side tests (red phase).
 *
 * Covers:
 * - GET /api/knowledge returns attentionScore in signals
 * - GET /api/knowledge/triage-count returns correct count for draft + needs_human items
 * - PATCH /api/knowledge/:id accepts needs_human status
 * - triage-count endpoint uses same auth middleware (requires API key)
 * - needs_human added to KERNEL_KNOWLEDGE_STATUSES (shared types)
 *
 * All tests in this file should FAIL until implementation is complete.
 */

import { type HyperIdleDb, knowledgeAppProjection, knowledgeItems, users } from "@hyperidle/db";
import { KERNEL_KNOWLEDGE_STATUSES } from "@hyperidle/domain-model";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-y4-triage";

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

async function seedKnowledgeItem(
	db: HyperIdleDb,
	id: string,
	status: string,
	updatedBy = "founder",
	scopeKind = "factory",
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(knowledgeItems).values({
		id,
		title: `Item ${id}`,
		body: "body",
		format: "markdown",
		status,
		version: 1,
		updatedBy,
		scopeKind,
		createdAt: now,
		updatedAt: now,
	});
}

async function seedFabricWithAttentionScore(
	db: HyperIdleDb,
	knowledgeItemId: string,
	attentionScore: string | null,
): Promise<void> {
	const [existing] = await db
		.select()
		.from(knowledgeAppProjection)
		.where(eq(knowledgeAppProjection.knowledgeItemId, knowledgeItemId))
		.limit(1);

	if (existing) {
		await db
			.update(knowledgeAppProjection)
			.set({ attentionScore })
			.where(eq(knowledgeAppProjection.knowledgeItemId, knowledgeItemId));
	} else {
		await db.insert(knowledgeAppProjection).values({
			id: crypto.randomUUID(),
			knowledgeItemId,
			layer: "L4",
			attentionScore,
		});
	}
}

// ---------------------------------------------------------------------------
// Shared types: needs_human in KERNEL_KNOWLEDGE_STATUSES
// ---------------------------------------------------------------------------

describe("Y4 — KERNEL_KNOWLEDGE_STATUSES includes needs_human", () => {
	test("KERNEL_KNOWLEDGE_STATUSES contains 'needs_human'", () => {
		// This test verifies the shared types constant is widened.
		// Red: currently KERNEL_KNOWLEDGE_STATUSES = ["draft", "active", "archived"]
		expect(KERNEL_KNOWLEDGE_STATUSES).toContain("needs_human");
	});
});

// ---------------------------------------------------------------------------
// GET /api/knowledge — attentionScore in signals
// ---------------------------------------------------------------------------

describe("Y4 — GET /api/knowledge returns attentionScore in signals", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns attentionScore as a number when fabric row has attentionScore", async ({
		db,
		app,
	}) => {
		await seedFounder(db, "founder");
		await seedKnowledgeItem(db, "ki-1", "active");
		await seedFabricWithAttentionScore(db, "ki-1", "0.85");

		const res = await app.request("/api/knowledge", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as {
			items: Array<{ id: string; signals: { attentionScore: number | null } }>;
		};
		const item = body.items.find((i) => i.id === "ki-1");
		expect(item).toBeDefined();
		expect(item?.signals).toHaveProperty("attentionScore");
		expect(typeof item?.signals.attentionScore).toBe("number");
		expect(item?.signals.attentionScore).toBeCloseTo(0.85);
	});

	test("returns attentionScore as null when fabric row has no attentionScore", async ({
		db,
		app,
	}) => {
		await seedFounder(db, "founder");
		await seedKnowledgeItem(db, "ki-2", "active");
		// Seed fabric row without attentionScore (null)
		await seedFabricWithAttentionScore(db, "ki-2", null);

		const res = await app.request("/api/knowledge", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as {
			items: Array<{ id: string; signals: { attentionScore: number | null } }>;
		};
		const item = body.items.find((i) => i.id === "ki-2");
		expect(item).toBeDefined();
		expect(item?.signals.attentionScore).toBeNull();
	});

	test("returns attentionScore as null when no fabric row exists for item", async ({ db, app }) => {
		await seedFounder(db, "founder");
		await seedKnowledgeItem(db, "ki-3", "active");
		// No fabric row seeded

		const res = await app.request("/api/knowledge", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as {
			items: Array<{ id: string; signals: { attentionScore: number | null } }>;
		};
		const item = body.items.find((i) => i.id === "ki-3");
		expect(item).toBeDefined();
		expect(item?.signals.attentionScore).toBeNull();
	});

	test("parses attentionScore from string to number (stored as text in DB)", async ({
		db,
		app,
	}) => {
		await seedFounder(db, "founder");
		await seedKnowledgeItem(db, "ki-4", "draft");
		await seedFabricWithAttentionScore(db, "ki-4", "0.72");

		const res = await app.request("/api/knowledge", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as {
			items: Array<{ id: string; signals: { attentionScore: number | null } }>;
		};
		const item = body.items.find((i) => i.id === "ki-4");
		expect(item).toBeDefined();
		// Must be a JS number, not the string "0.72"
		expect(item?.signals.attentionScore).toBe(0.72);
	});
});

// ---------------------------------------------------------------------------
// GET /api/knowledge/triage-count — new endpoint
// ---------------------------------------------------------------------------

describe("Y4 — GET /api/knowledge/triage-count", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns { count: 0 } when no items exist", async ({ db, app }) => {
		await seedFounder(db, "founder");
		const res = await app.request("/api/knowledge/triage-count", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { count: number };
		expect(body).toHaveProperty("count");
		expect(body.count).toBe(0);
	});

	test("counts draft items only when no needs_human items exist", async ({ db, app }) => {
		await seedFounder(db, "founder");
		await seedKnowledgeItem(db, "ki-draft-1", "draft");
		await seedKnowledgeItem(db, "ki-draft-2", "draft");
		await seedKnowledgeItem(db, "ki-active", "active");
		await seedKnowledgeItem(db, "ki-archived", "archived");

		const res = await app.request("/api/knowledge/triage-count", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { count: number };
		expect(body.count).toBe(2);
	});

	test("counts needs_human items in addition to draft items", async ({ db, app }) => {
		await seedFounder(db, "founder");
		await seedKnowledgeItem(db, "ki-draft-a", "draft");
		await seedKnowledgeItem(db, "ki-draft-b", "draft");
		await seedKnowledgeItem(db, "ki-draft-c", "draft");
		await seedKnowledgeItem(db, "ki-nh-1", "needs_human");
		await seedKnowledgeItem(db, "ki-nh-2", "needs_human");
		await seedKnowledgeItem(db, "ki-active", "active");

		const res = await app.request("/api/knowledge/triage-count", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { count: number };
		// 3 draft + 2 needs_human = 5
		expect(body.count).toBe(5);
	});

	test("does NOT count active or archived items", async ({ db, app }) => {
		await seedFounder(db, "founder");
		await seedKnowledgeItem(db, "ki-active-1", "active");
		await seedKnowledgeItem(db, "ki-active-2", "active");
		await seedKnowledgeItem(db, "ki-archived-1", "archived");

		const res = await app.request("/api/knowledge/triage-count", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { count: number };
		expect(body.count).toBe(0);
	});

	test("returns { count: number } response shape (not an array or nested object)", async ({
		db,
		app,
	}) => {
		await seedFounder(db, "founder");
		const res = await app.request("/api/knowledge/triage-count", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(typeof body).toBe("object");
		expect(body).not.toBeNull();
		expect(typeof body.count).toBe("number");
		// No extra keys (items, data, etc.)
		expect(Object.keys(body)).toEqual(["count"]);
	});

	test("requires authentication — returns 401 without API key", async ({ requestWithoutAuth }) => {
		const res = await requestWithoutAuth("/api/knowledge/triage-count");
		// Must use the same auth middleware as other knowledge routes
		expect(res.status).toBe(401);
	});

	test("excludes user-scoped items from other users in the count", async ({ db, app }) => {
		await seedFounder(db, "founder");
		// Seed a different human user, then switch to them
		// The triage-count endpoint should only count items visible to the requesting user
		await seedKnowledgeItem(db, "ki-draft-factory", "draft", "founder", "factory");
		// User-scoped item authored by a different user
		await db.insert(knowledgeItems).values({
			id: "ki-private-other",
			title: "Private item from other user",
			body: "body",
			format: "markdown",
			status: "draft",
			version: 1,
			updatedBy: "other-user",
			scopeKind: "user",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});

		// Auth resolves to "founder" (the only human user). The private item from
		// "other-user" with scope_kind="user" should not be counted.
		const res = await app.request("/api/knowledge/triage-count", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { count: number };
		// Only the factory-scoped draft should count (not the other-user's private draft)
		expect(body.count).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// PATCH /api/knowledge/:id — accepts needs_human status
// ---------------------------------------------------------------------------

describe("Y4 — PATCH /api/knowledge/:id accepts needs_human status", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("PATCH with status=needs_human returns 200", async ({ db, app }) => {
		await seedFounder(db, "founder");
		// First create a draft item via POST
		const createRes = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				title: "Item to flag",
				body: "body",
				format: "markdown",
				updatedBy: "founder",
				scopeKind: "factory",
			}),
		});
		expect(createRes.status).toBe(201);
		const created = (await createRes.json()) as { id: string; version: number };

		const patchRes = await app.request(`/api/knowledge/${created.id}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				version: created.version,
				updatedBy: "founder",
				status: "needs_human",
			}),
		});
		expect(patchRes.status).toBe(200);
	});

	test("PATCH with status=needs_human persists the new status", async ({ db, app }) => {
		await seedFounder(db, "founder");
		const createRes = await app.request("/api/knowledge", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				title: "Flaggable item",
				body: "body",
				format: "markdown",
				updatedBy: "founder",
				scopeKind: "factory",
			}),
		});
		expect(createRes.status).toBe(201);
		const created = (await createRes.json()) as { id: string; version: number };

		await app.request(`/api/knowledge/${created.id}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				version: created.version,
				updatedBy: "founder",
				status: "needs_human",
			}),
		});

		// Read back the item via GET /:id and verify status
		const getRes = await app.request(`/api/knowledge/${created.id}`, {
			headers: authHeaders(),
		});
		expect(getRes.status).toBe(200);
		const item = (await getRes.json()) as { status: string };
		expect(item.status).toBe("needs_human");
	});

	test("PATCH from needs_human to active returns 200 (triage validate flow)", async ({
		db,
		app,
	}) => {
		await seedFounder(db, "founder");
		// Seed a needs_human item directly
		await seedKnowledgeItem(db, "ki-needs-human", "needs_human");

		const patchRes = await app.request("/api/knowledge/ki-needs-human", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				version: 1,
				updatedBy: "founder",
				status: "active",
			}),
		});
		expect(patchRes.status).toBe(200);
		const updated = (await patchRes.json()) as { status: string };
		expect(updated.status).toBe("active");
	});

	test("PATCH from needs_human to archived returns 200 (triage reject flow)", async ({
		db,
		app,
	}) => {
		await seedFounder(db, "founder");
		await seedKnowledgeItem(db, "ki-nh-reject", "needs_human");

		const patchRes = await app.request("/api/knowledge/ki-nh-reject", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				version: 1,
				updatedBy: "founder",
				status: "archived",
			}),
		});
		expect(patchRes.status).toBe(200);
	});

	test("PATCH with an unknown status still returns 400", async ({ db, app }) => {
		await seedFounder(db, "founder");
		await seedKnowledgeItem(db, "ki-bad-status", "draft");

		const patchRes = await app.request("/api/knowledge/ki-bad-status", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				version: 1,
				updatedBy: "founder",
				status: "invalid_status_xyz",
			}),
		});
		expect(patchRes.status).toBe(400);
	});
});
