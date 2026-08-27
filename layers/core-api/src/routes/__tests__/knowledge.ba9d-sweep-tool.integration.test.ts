/**
 * BA9d — Firing-level proof for POST /api/knowledge/sweep.
 *
 * The sweep route replaced the dead builtin-routine sweep path. This test
 * proves end-to-end: seed eligible knowledge items, call the route, assert
 * the items actually changed state in the DB.
 *
 * Sanity-break: comment out the INSERT that seeds the stale item and the
 * `processed` assertion flips from 1 to 0 — proving the wiring reads the
 * DB, not a constant.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { knowledgeAppProjection, knowledgeItems } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "../../__testing__/test-fixtures.js";

const API_KEY = "test-ba9d-sweep-tool";

function auth(): Record<string, string> {
	return { "X-API-Key": API_KEY, "Content-Type": "application/json" };
}

const OLD_DATE = "2020-01-01T00:00:00.000Z";
const NOW = new Date().toISOString();

async function seedActiveItem(
	db: HyperIdleDb,
	id: string,
	opts: { updatedAt: string } = { updatedAt: OLD_DATE },
): Promise<void> {
	await db.insert(knowledgeItems).values({
		id,
		title: `Stale item ${id}`,
		body: "Some old knowledge.",
		status: "active",
		scopeKind: "factory",
		scopeId: null,
		format: "text",
		version: 1,
		updatedBy: "seed",
		createdAt: opts.updatedAt,
		updatedAt: opts.updatedAt,
	});
	await db.insert(knowledgeAppProjection).values({ id: `${id}-proj`, knowledgeItemId: id });
}

describe("POST /api/knowledge/sweep", () => {
	test("400 when kind is missing", async ({ app }) => {
		const res = await app.request("/api/knowledge/sweep", {
			method: "POST",
			headers: auth(),
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
	});

	test("400 when kind is unknown", async ({ app }) => {
		const res = await app.request("/api/knowledge/sweep", {
			method: "POST",
			headers: auth(),
			body: JSON.stringify({ kind: "garbage" }),
		});
		expect(res.status).toBe(400);
	});

	describe("kind=stale — marks old active items as stale", () => {
		test("returns processed count matching DB state change", async ({ db, app }) => {
			// Sanity-break: remove the seedActiveItem call and processed drops to 0.
			await seedActiveItem(db, "sweep-stale-1", { updatedAt: OLD_DATE });

			const res = await app.request("/api/knowledge/sweep", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({ kind: "stale" }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as { kind: string; processed: number };
			expect(body.kind).toBe("stale");
			expect(body.processed).toBeGreaterThanOrEqual(1);

			// Verify DB: item is now stale
			const [row] = await db
				.select({ status: knowledgeItems.status })
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, "sweep-stale-1"));
			expect(row?.status).toBe("stale");
		});

		test("returns processed=0 when no stale items exist", async ({ db, app }) => {
			// Seed a recently-updated item — not past the 90-day threshold.
			await seedActiveItem(db, "sweep-fresh-1", { updatedAt: NOW });

			const res = await app.request("/api/knowledge/sweep", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({ kind: "stale" }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as { kind: string; processed: number };
			expect(body.kind).toBe("stale");
			expect(body.processed).toBe(0);

			// Verify DB: recent item is still active
			const [row] = await db
				.select({ status: knowledgeItems.status })
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, "sweep-fresh-1"));
			expect(row?.status).toBe("active");
		});
	});

	describe("kind=autoPromotion — returns processed count", () => {
		test("returns processed=0 when no provisional items exist", async ({ app }) => {
			const res = await app.request("/api/knowledge/sweep", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({ kind: "autoPromotion" }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as { kind: string; processed: number };
			expect(body.kind).toBe("autoPromotion");
			expect(body.processed).toBe(0);
		});
	});
});
