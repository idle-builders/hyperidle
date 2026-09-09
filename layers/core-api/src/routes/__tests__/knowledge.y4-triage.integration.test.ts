/**
 * Y4 — Knowledge Triage Improvements: Server-side tests.
 *
 * Covers:
 * - GET /api/knowledge returns attentionScore in signals
 * - GET /api/knowledge/triage-count returns the count of proposed items
 * - triage-count endpoint uses same auth middleware (requires API key)
 *
 * @lore nested-knowledge-items: the status ladder collapsed from 7 values to
 * 4 (proposed | active | stale | archived). `draft`/`captured`/`provisional`/
 * `needs_human` all fold into `proposed` — `needs_human` is the same state as
 * `draft`, an item awaiting human attention, not one that is done with.
 * Triage is therefore just `status === "proposed"` — the former "PATCH
 * accepts needs_human status" describe block tested a status value that no
 * longer exists and is deleted, not adapted.
 */

import { type HyperIdleDb, knowledgeAppProjection, knowledgeItems, users } from "@hyperidle/db";
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
			attentionScore,
		});
	}
}

// ---------------------------------------------------------------------------
// GET /api/knowledge — attentionScore in signals
// ---------------------------------------------------------------------------

// @lore AU44 batch 4 row 13 SIMPLIFY: the `signals` wrapper object was removed per
// FULL-AUDIT.md row 13. attentionScore is now a flat field on each item (parsed from
// the stored text to a JS number in the list route, matching the detail route's behaviour).
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
			items: Array<{ id: string; attentionScore: number | null }>;
		};
		const item = body.items.find((i) => i.id === "ki-1");
		expect(item).toBeDefined();
		expect(item).toHaveProperty("attentionScore");
		expect(typeof item?.attentionScore).toBe("number");
		expect(item?.attentionScore).toBeCloseTo(0.85);
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
			items: Array<{ id: string; attentionScore: number | null }>;
		};
		const item = body.items.find((i) => i.id === "ki-2");
		expect(item).toBeDefined();
		expect(item?.attentionScore).toBeNull();
	});

	test("returns attentionScore as null when no fabric row exists for item", async ({ db, app }) => {
		await seedFounder(db, "founder");
		await seedKnowledgeItem(db, "ki-3", "active");
		// No fabric row seeded

		const res = await app.request("/api/knowledge", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as {
			items: Array<{ id: string; attentionScore: number | null }>;
		};
		const item = body.items.find((i) => i.id === "ki-3");
		expect(item).toBeDefined();
		expect(item?.attentionScore).toBeNull();
	});

	test("parses attentionScore from string to number (stored as text in DB)", async ({
		db,
		app,
	}) => {
		await seedFounder(db, "founder");
		await seedKnowledgeItem(db, "ki-4", "proposed");
		await seedFabricWithAttentionScore(db, "ki-4", "0.72");

		const res = await app.request("/api/knowledge", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as {
			items: Array<{ id: string; attentionScore: number | null }>;
		};
		const item = body.items.find((i) => i.id === "ki-4");
		expect(item).toBeDefined();
		// Must be a JS number, not the string "0.72"
		expect(item?.attentionScore).toBe(0.72);
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

	test("counts proposed items only", async ({ db, app }) => {
		await seedFounder(db, "founder");
		await seedKnowledgeItem(db, "ki-proposed-1", "proposed");
		await seedKnowledgeItem(db, "ki-proposed-2", "proposed");
		await seedKnowledgeItem(db, "ki-active", "active");
		await seedKnowledgeItem(db, "ki-archived", "archived");

		const res = await app.request("/api/knowledge/triage-count", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { count: number };
		expect(body.count).toBe(2);
	});

	// A proposed skill or rule must not inflate the
	// sidebar badge — it appears in neither the knowledge list nor the
	// skills-and-rules list's own count, which reads as a bug with no way to
	// clear it.
	test("does NOT count a proposed skill or a proposed rule", async ({ db, app }) => {
		await seedFounder(db, "founder");
		await seedKnowledgeItem(db, "ki-proposed-ordinary", "proposed");
		const now = new Date().toISOString();
		await db.insert(knowledgeItems).values([
			{
				id: "ki-proposed-skill",
				title: "A skill",
				body: "body",
				format: "markdown",
				status: "proposed",
				role: "skill",
				version: 1,
				updatedBy: "founder",
				scopeKind: "factory",
				createdAt: now,
				updatedAt: now,
			},
			{
				id: "ki-proposed-rule",
				title: "A rule",
				body: "body",
				format: "markdown",
				status: "proposed",
				role: "rule",
				version: 1,
				updatedBy: "founder",
				scopeKind: "factory",
				createdAt: now,
				updatedAt: now,
			},
		]);

		const res = await app.request("/api/knowledge/triage-count", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { count: number };
		expect(body.count).toBe(1);
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
		await seedKnowledgeItem(db, "ki-proposed-factory", "proposed", "founder", "factory");
		// User-scoped item authored by a different user
		await db.insert(knowledgeItems).values({
			id: "ki-private-other",
			title: "Private item from other user",
			body: "body",
			format: "markdown",
			status: "proposed",
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
		// Only the factory-scoped proposed item should count (not the other-user's private one)
		expect(body.count).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// PATCH /api/knowledge/:id — status transitions on the collapsed ladder
// ---------------------------------------------------------------------------

describe("Y4 — PATCH /api/knowledge/:id status transitions", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("PATCH from proposed to active returns 200 (triage validate flow)", async ({ db, app }) => {
		await seedFounder(db, "founder");
		await seedKnowledgeItem(db, "ki-proposed", "proposed");

		const patchRes = await app.request("/api/knowledge/ki-proposed", {
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

	test("PATCH from proposed to archived returns 200 (triage reject flow)", async ({ db, app }) => {
		await seedFounder(db, "founder");
		await seedKnowledgeItem(db, "ki-reject", "proposed");

		const patchRes = await app.request("/api/knowledge/ki-reject", {
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
		await seedKnowledgeItem(db, "ki-bad-status", "proposed");

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

	// @lore nested-knowledge-items: needs_human is a retired status value —
	// PATCHing it must now 400, the same as any other unrecognized string.
	test("PATCH with status=needs_human returns 400 (retired status value)", async ({ db, app }) => {
		await seedFounder(db, "founder");
		await seedKnowledgeItem(db, "ki-nh-retired", "proposed");

		const patchRes = await app.request("/api/knowledge/ki-nh-retired", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				version: 1,
				updatedBy: "founder",
				status: "needs_human",
			}),
		});
		expect(patchRes.status).toBe(400);
	});
});
