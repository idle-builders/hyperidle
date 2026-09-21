/**
 * @lore nested-knowledge-items architecture.md §3 / review.md B12 & B13 —
 * `PATCH /api/knowledge/:id` refuses an illegal move with a 4xx naming the
 * rule, and never partially commits: a title change bundled with an illegal
 * move must not land while the move is refused.
 */
import { documents, type HyperIdleDb, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";
import { createTestApp } from "../../__testing__/test-utils.js";

const TEST_API_KEY = "test-key-illegal-move";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function seedFounder(db: HyperIdleDb): Promise<void> {
	await db.insert(users).values({
		id: "u-founder",
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
	opts: { title: string; parentId?: string | null; scopeKind?: string },
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(documents).values({
		id,
		title: opts.title,
		body: "body",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "u-founder",
		scopeKind: opts.scopeKind ?? "factory",
		parentKind: opts.parentId ? "document" : null,
		parentId: opts.parentId ?? null,
		createdAt: now,
		updatedAt: now,
	});
}

describe("PATCH /api/knowledge/:id — illegal move (review.md B12/B13)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("a cycle is refused with a 4xx naming the rule, and the bundled title change is not committed", async ({
		db,
		eventBus,
	}) => {
		await seedFounder(db);
		await seedItem(db, "ki-root", { title: "Root" });
		await seedItem(db, "ki-child", { title: "Child", parentId: "ki-root" });

		const app = await createTestApp({ db, eventBus });

		// Parenting the root under its own child would create a cycle.
		const res = await app.request("/api/knowledge/ki-root", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				version: 1,
				updatedBy: "u-founder",
				title: "Root — renamed during an illegal move",
				parentKind: "document",
				parentId: "ki-child",
			}),
		});

		expect(res.status).toBeGreaterThanOrEqual(400);
		expect(res.status).toBeLessThan(500);
		const body = (await res.json()) as { error: string; details?: { rule?: string } };
		expect(body.details?.rule).toBe("cycle");

		// Nothing was written: title unchanged, version unchanged, parent unchanged.
		const getRes = await app.request("/api/knowledge/ki-root", { headers: authHeaders() });
		const item = (await getRes.json()) as {
			title: string;
			version: number;
			parentId: string | null;
		};
		expect(item.title).toBe("Root");
		expect(item.version).toBe(1);
		expect(item.parentId).toBeNull();
	});

	test("a move under a non-existent knowledge item is refused with a 4xx, not 500", async ({
		db,
		eventBus,
	}) => {
		await seedFounder(db);
		await seedItem(db, "ki-solo", { title: "Solo" });

		const app = await createTestApp({ db, eventBus });

		const res = await app.request("/api/knowledge/ki-solo", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				version: 1,
				updatedBy: "u-founder",
				parentKind: "document",
				parentId: "ki-does-not-exist",
			}),
		});

		expect(res.status).toBeGreaterThanOrEqual(400);
		expect(res.status).toBeLessThan(500);
		const body = (await res.json()) as { details?: { rule?: string } };
		expect(body.details?.rule).toBe("parent-not-found");
	});

	test("a move to a non-existent task is refused with a 400 before any write (review.md B13)", async ({
		db,
		eventBus,
	}) => {
		await seedFounder(db);
		await seedItem(db, "ki-solo-2", { title: "Solo 2" });

		const app = await createTestApp({ db, eventBus });

		const res = await app.request("/api/knowledge/ki-solo-2", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				version: 1,
				updatedBy: "u-founder",
				title: "Should not be committed",
				parentKind: "task",
				parentId: "task-does-not-exist",
			}),
		});

		expect(res.status).toBe(400);

		const getRes = await app.request("/api/knowledge/ki-solo-2", { headers: authHeaders() });
		const item = (await getRes.json()) as { title: string; version: number };
		expect(item.title).toBe("Solo 2");
		expect(item.version).toBe(1);
	});

	test("a legal move still succeeds (200) — the reordering does not break the ordinary path", async ({
		db,
		eventBus,
	}) => {
		await seedFounder(db);
		await seedItem(db, "ki-root-2", { title: "Root 2" });
		await seedItem(db, "ki-leaf-2", { title: "Leaf 2" });

		const app = await createTestApp({ db, eventBus });

		const res = await app.request("/api/knowledge/ki-leaf-2", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				version: 1,
				updatedBy: "u-founder",
				title: "Leaf 2 — renamed",
				parentKind: "document",
				parentId: "ki-root-2",
			}),
		});

		expect(res.status).toBe(200);
		const updated = (await res.json()) as {
			title: string;
			parentId: string | null;
			version: number;
		};
		expect(updated.title).toBe("Leaf 2 — renamed");
		expect(updated.parentId).toBe("ki-root-2");
		expect(updated.version).toBe(2);
	});
});
