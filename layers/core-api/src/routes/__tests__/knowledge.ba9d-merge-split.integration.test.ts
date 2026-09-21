/**
 * BA9d — Knowledge merge and split route integration tests.
 *
 * Proves the POST /:id/merge and POST /:id/split routes restored in BA9d
 * (D9: merge+split come back, recovered from history at 3efc6c573^).
 *
 * Tests run against the real DB + app fixture. Each test is self-contained.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { documents } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "../../__testing__/test-fixtures.js";

const API_KEY = "test-ba9d-merge-split";
const NOW = "2026-01-01T00:00:00.000Z";

function auth(): Record<string, string> {
	return { "X-API-Key": API_KEY };
}

async function seedKnowledgeItem(
	db: HyperIdleDb,
	id: string,
	opts: { title: string; body: string; status?: string },
): Promise<void> {
	await db.insert(documents).values({
		id,
		title: opts.title,
		body: opts.body,
		status: opts.status ?? "active",
		scopeKind: "factory",
		scopeId: null,
		format: "text",
		version: 1,
		updatedBy: "seed",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /:id/merge
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/knowledge/:id/merge", () => {
	test("404 when target does not exist", async ({ app }) => {
		const res = await app.request("/api/knowledge/no-such-item/merge", {
			method: "POST",
			headers: { ...auth(), "Content-Type": "application/json" },
			body: JSON.stringify({ sourceId: "also-missing", updatedBy: "user-1" }),
		});
		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body).toMatchObject({ code: "NOT_FOUND" });
	});

	test("404 when source does not exist", async ({ db, app }) => {
		await seedKnowledgeItem(db, "target-1", { title: "Target", body: "Target body." });

		const res = await app.request("/api/knowledge/target-1/merge", {
			method: "POST",
			headers: { ...auth(), "Content-Type": "application/json" },
			body: JSON.stringify({ sourceId: "no-such-source", updatedBy: "user-1" }),
		});
		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body).toMatchObject({ code: "NOT_FOUND" });
	});

	test("200: merges source body into target — response contains both bodies", async ({
		db,
		app,
	}) => {
		await seedKnowledgeItem(db, "target-2", { title: "Target Item", body: "Part A." });
		await seedKnowledgeItem(db, "source-2", { title: "Source Item", body: "Part B." });

		const res = await app.request("/api/knowledge/target-2/merge", {
			method: "POST",
			headers: { ...auth(), "Content-Type": "application/json" },
			body: JSON.stringify({ sourceId: "source-2", updatedBy: "user-1" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		// Target id is preserved
		expect(body["id"]).toBe("target-2");
		// Merged body contains both parts
		expect(String(body["body"] ?? "")).toContain("Part A.");
		expect(String(body["body"] ?? "")).toContain("Part B.");
	});

	test("200: source item is archived after merge", async ({ db, app }) => {
		await seedKnowledgeItem(db, "target-3", { title: "T", body: "Body T." });
		await seedKnowledgeItem(db, "source-3", { title: "S", body: "Body S." });

		await app.request("/api/knowledge/target-3/merge", {
			method: "POST",
			headers: { ...auth(), "Content-Type": "application/json" },
			body: JSON.stringify({ sourceId: "source-3", updatedBy: "user-1" }),
		});

		// Verify source is archived via DB query
		const [source] = await db.select().from(documents).where(eq(documents.id, "source-3"));
		expect(source!.status).toBe("archived");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /:id/split
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/knowledge/:id/split", () => {
	test("404 when item does not exist", async ({ app }) => {
		const res = await app.request("/api/knowledge/no-such-item/split", {
			method: "POST",
			headers: { ...auth(), "Content-Type": "application/json" },
			body: JSON.stringify({
				newItems: [
					{ title: "A", body: "Body A." },
					{ title: "B", body: "Body B." },
				],
				updatedBy: "user-1",
			}),
		});
		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body).toMatchObject({ code: "NOT_FOUND" });
	});

	test("200: creates N new items and returns them", async ({ db, app }) => {
		await seedKnowledgeItem(db, "original-1", { title: "Combined", body: "Full body." });

		const res = await app.request("/api/knowledge/original-1/split", {
			method: "POST",
			headers: { ...auth(), "Content-Type": "application/json" },
			body: JSON.stringify({
				newItems: [
					{ title: "Part One", body: "First section." },
					{ title: "Part Two", body: "Second section." },
				],
				updatedBy: "user-1",
			}),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { items: Array<{ id: string; title: string }> };
		expect(body.items).toHaveLength(2);
		// Both new items have IDs
		expect(body.items[0]!.id).toBeTruthy();
		expect(body.items[1]!.id).toBeTruthy();
		// Titles match the request
		expect(body.items[0]!.title).toBe("Part One");
		expect(body.items[1]!.title).toBe("Part Two");
	});

	test("200: original item is archived after split", async ({ db, app }) => {
		await seedKnowledgeItem(db, "original-2", { title: "To Split", body: "Combined." });

		await app.request("/api/knowledge/original-2/split", {
			method: "POST",
			headers: { ...auth(), "Content-Type": "application/json" },
			body: JSON.stringify({
				newItems: [
					{ title: "A", body: "Part A." },
					{ title: "B", body: "Part B." },
				],
				updatedBy: "user-1",
			}),
		});

		// Verify original is archived via DB query
		const [original] = await db.select().from(documents).where(eq(documents.id, "original-2"));
		expect(original!.status).toBe("archived");
	});
});
