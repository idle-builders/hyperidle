/**
 * AU14 round 2 — net-new exact-behavior lock tests for the 5 new write
 * repository functions (mergeItems/splitItem/archiveItem/flagItem/changeScope),
 * per plans/AU14/architecture-round2.md §11 tests 2, 3, 4, 5a, 5c, 6.
 *
 * Test 1 (searchByText LIKE-vs-FTS) and test 5b (route-level flag atomic
 * positive path) live in routes/__tests__/knowledge.au14-round2.integration.test.ts
 * since they exercise HTTP handlers via the `app` fixture.
 *
 * These tests call the repository functions directly (no HTTP) — TDD red
 * phase: written before the corresponding repo functions exist, so they
 * fail to import/compile against pre-round-2 code.
 */
import {
	type HyperIdleDb,
	knowledgeAppProjection,
	knowledgeEditLog,
	knowledgeItems,
} from "@hyperidle/db";
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
		topic: string | null;
		status: KnowledgeStatus | KernelKnowledgeStatus;
		scopeKind: string;
		scopeId: string | null;
		updatedBy: string;
		version: number;
	}> = {},
): Promise<typeof knowledgeItems.$inferSelect> {
	const created = await createKnowledgeItem(db, {
		layer: null,
		scopeKind: overrides.scopeKind ?? "factory",
		scopeId: overrides.scopeId ?? null,
		topic: overrides.topic ?? null,
		title: overrides.title ?? "Seed title",
		body: overrides.body ?? "Seed body",
		format: "markdown",
		status: overrides.status ?? "active",
		updatedBy: overrides.updatedBy ?? "u-seed",
	});
	const [row] = await db
		.select()
		.from(knowledgeItems)
		.where(eq(knowledgeItems.id, created.id))
		.limit(1);
	if (!row) throw new Error("seedItem: failed to read back seeded item");
	return row;
}

describe("archiveItem exact-behavior lock", () => {
	test("does NOT bump version, does NOT change updatedBy, sets status archived, writes 1 archive edit-log row", async ({
		db,
	}) => {
		const item = await seedItem(db, { updatedBy: "u-original-author" });
		const preVersion = item.version;
		const preUpdatedBy = item.updatedBy;

		const archived = await remove(db, item);

		expect(archived.version).toBe(preVersion);
		expect(archived.updatedBy).toBe(preUpdatedBy);
		expect(archived.status).toBe("archived");

		const logs = await db
			.select()
			.from(knowledgeEditLog)
			.where(eq(knowledgeEditLog.editType, "archive"));
		expect(logs).toHaveLength(1);
		expect(logs[0]?.field).toBe("status");
		expect(logs[0]?.oldValue).toBe(item.status);
		expect(logs[0]?.editor).toBe(item.updatedBy);
	});
});

describe("scope is an ordinary edited field", () => {
	/**
	 * Scope used to move through its own `changeScope` transition, which demanded
	 * a `reason` and glued it into the edit-log value as
	 * `"product (reason: …)"`. Nothing ever parsed that string. Scope is now a
	 * field on the document, edited through `update()`, and logged the way every
	 * other field is: the field name, the old value, the new value.
	 */
	test("records a scope change in the edit log like any other field", async ({ db }) => {
		const existing = await seedItem(db, { scopeKind: "user", scopeId: "u-founder" });

		await update(
			db,
			existing.id,
			{ scopeKind: "product", scopeId: "prod-123", updatedBy: "u-founder" },
			existing.version,
		);

		const logs = await db
			.select()
			.from(knowledgeEditLog)
			.where(eq(knowledgeEditLog.itemId, existing.id));

		const scopeKindLog = logs.find((l) => l.field === "scopeKind");
		const scopeIdLog = logs.find((l) => l.field === "scopeId");

		expect(scopeKindLog?.oldValue).toBe("user");
		expect(scopeKindLog?.newValue).toBe("product");
		expect(scopeIdLog?.oldValue).toBe("u-founder");
		expect(scopeIdLog?.newValue).toBe("prod-123");
		// No reason is smuggled into the value any more.
		expect(scopeKindLog?.newValue).not.toContain("reason:");
	});

	test("moves the kernel and the projection together", async ({ db }) => {
		const existing = await seedItem(db, { scopeKind: "user", scopeId: "u-founder" });

		await update(
			db,
			existing.id,
			{ scopeKind: "product", scopeId: "prod-123", updatedBy: "u-founder" },
			existing.version,
		);

		const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, existing.id));
		const [proj] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, existing.id));

		expect(row?.scopeId).toBe("prod-123");
		expect(proj?.scopeId).toBe("prod-123");
	});
});
