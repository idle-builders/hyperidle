/**
 * AU14 round 2 — net-new exact-behavior lock tests for the 5 new write
 * repository functions (mergeItems/splitItem/archiveItem/flagItem/changeScope).
 *
 * Test 1 (searchByText LIKE-vs-FTS) and test 5b (route-level flag atomic
 * positive path) live in routes/__tests__/knowledge.au14-round2.integration.test.ts
 * since they exercise HTTP handlers via the `app` fixture.
 *
 * These tests call the repository functions directly (no HTTP) — TDD red
 * phase: written before the corresponding repo functions exist, so they
 * fail to import/compile against pre-round-2 code.
 */
import { type DocumentRow, documents, type HyperIdleDb } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import type { KernelKnowledgeStatus } from "@hyperidle/domain-model";
import { eq } from "drizzle-orm";
import { create as createKnowledgeItem, remove, update } from "../knowledge-repository.js";
import type { KnowledgeStatus } from "../types.js";

async function seedItem(
	db: HyperIdleDb,
	overrides: Partial<{
		id: string;
		title: string;
		body: string;
		status: KnowledgeStatus | KernelKnowledgeStatus;
		scopeKind: string;
		scopeId: string | null;
		updatedBy: string;
		version: number;
	}> = {},
): Promise<DocumentRow> {
	const created = await createKnowledgeItem(db, {
		scopeKind: overrides.scopeKind ?? "factory",
		scopeId: overrides.scopeId ?? null,
		title: overrides.title ?? "Seed title",
		body: overrides.body ?? "Seed body",
		format: "markdown",
		status: overrides.status ?? "active",
		updatedBy: overrides.updatedBy ?? "u-seed",
	});
	const [row] = await db.select().from(documents).where(eq(documents.id, created.id)).limit(1);
	if (!row) throw new Error("seedItem: failed to read back seeded item");
	return row;
}

describe("archiveItem exact-behavior lock", () => {
	test("does NOT bump version, does NOT change updatedBy, sets status archived", async ({ db }) => {
		const item = await seedItem(db, { updatedBy: "u-original-author" });
		const preVersion = item.version;
		const preUpdatedBy = item.updatedBy;

		const archived = await remove(db, item);

		expect(archived.version).toBe(preVersion);
		expect(archived.updatedBy).toBe(preUpdatedBy);
		expect(archived.status).toBe("archived");
	});
});

describe("scope is an ordinary edited field", () => {
	/**
	 * Scope used to move through its own `changeScope` transition, which demanded
	 * a `reason` and glued it into an edit-log value as `"product (reason: …)"`.
	 * Scope is now a field on the document, edited through `update()` like any
	 * other field, and the row is the only place the new value lives.
	 */
	test("update() writes the new scope onto the row", async ({ db }) => {
		const existing = await seedItem(db, { scopeKind: "user", scopeId: "u-founder" });

		await update(
			db,
			existing.id,
			{ scopeKind: "team", scopeId: "prod-123", updatedBy: "u-founder" },
			existing.version,
		);

		const [row] = await db.select().from(documents).where(eq(documents.id, existing.id));

		expect(row?.scopeKind).toBe("team");
		expect(row?.scopeId).toBe("prod-123");
	});
});
