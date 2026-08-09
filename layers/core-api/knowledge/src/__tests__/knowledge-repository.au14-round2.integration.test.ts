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
import { create as createKnowledgeItem, remove, transition } from "../knowledge-repository.js";
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

describe("mergeItems exact-behavior lock", () => {
	test("merges body, bumps target version, archives source, writes exactly 2 merge edit-log rows", async ({
		db,
	}) => {
		const target = await seedItem(db, { title: "Target", body: "Target body." });
		const source = await seedItem(db, { title: "Source", body: "Source body." });

		const merged = await transition(db, target.id, {
			target: "merge",
			sourceId: source.id,
			updatedBy: "u-merge",
		});

		expect(merged.body).toBe(`${target.body}\n\n---\n\n${source.body}`);
		expect(merged.version).toBe(target.version + 1);

		const [sourceRow] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, source.id));
		expect(sourceRow?.status).toBe("archived");

		const logs = await db
			.select()
			.from(knowledgeEditLog)
			.where(eq(knowledgeEditLog.editType, "merge"));
		expect(logs).toHaveLength(2);
		const targetLog = logs.find((l) => l.itemId === target.id);
		const sourceLog = logs.find((l) => l.itemId === source.id);
		expect(targetLog?.field).toBe("body");
		expect(sourceLog?.field).toBe("status");
	});
});

describe("splitItem exact-behavior lock", () => {
	test("creates draft rows at version one inheriting scope, archives original, one split row, zero create rows, layer-only projection", async ({
		db,
	}) => {
		const original = await seedItem(db, {
			title: "Combined",
			body: "Part A. Part B.",
			scopeKind: "team",
			scopeId: "team-123",
		});

		const created = await transition(db, original.id, {
			target: "split",
			newItems: [
				{ title: "Part A", body: "Part A content." },
				{ title: "Part B", body: "Part B content." },
			],
			updatedBy: "u-split",
		});

		expect(created).toHaveLength(2);
		for (const item of created) {
			expect(item.version).toBe(1);
			expect(item.status).toBe("draft");
			expect(item.scopeKind).toBe("team");
			expect(item.scopeId).toBe("team-123");
			expect(item.format).toBe(original.format);
		}

		const [originalRow] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, original.id));
		expect(originalRow?.status).toBe("archived");

		const splitLogs = await db
			.select()
			.from(knowledgeEditLog)
			.where(eq(knowledgeEditLog.editType, "split"));
		expect(splitLogs).toHaveLength(1);
		expect(splitLogs[0]?.itemId).toBe(original.id);
		expect(splitLogs[0]?.field).toBe("status");

		const createLogsForNewItems = await db.select().from(knowledgeEditLog);
		const spuriousCreateRows = createLogsForNewItems.filter(
			(l) => l.editType === "create" && created.some((c) => c.id === l.itemId),
		);
		expect(spuriousCreateRows).toHaveLength(0);

		for (const item of created) {
			const [projection] = await db
				.select()
				.from(knowledgeAppProjection)
				.where(eq(knowledgeAppProjection.knowledgeItemId, item.id));
			expect(projection).toBeDefined();
			expect(projection?.scopeId).toBeNull();
			expect(projection?.kind).toBeNull();
		}
	});
});

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

describe("flagItem exact-behavior lock", () => {
	test("status draft, version/updatedBy unchanged, 1 flag row with exact newValue format", async ({
		db,
	}) => {
		const item = await seedItem(db, { updatedBy: "u-original-author" });
		const preVersion = item.version;
		const preUpdatedBy = item.updatedBy;
		const editId = crypto.randomUUID();
		const reason = "Needs a second look";

		await transition(db, item.id, { target: "flag", reason, editId });

		const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, item.id));
		expect(row?.status).toBe("draft");
		expect(row?.version).toBe(preVersion);
		expect(row?.updatedBy).toBe(preUpdatedBy);

		const logs = await db
			.select()
			.from(knowledgeEditLog)
			.where(eq(knowledgeEditLog.editType, "flag"));
		expect(logs).toHaveLength(1);
		expect(logs[0]?.id).toBe(editId);
		expect(logs[0]?.newValue).toBe(`flagged (reason: ${reason})`);
	});
});

describe("flagItem rollback lock", () => {
	test("outer transaction abort after flagItem returns rolls back BOTH the status change and the edit-log row", async ({
		db,
	}) => {
		const item = await seedItem(db, { status: "active" });
		const editId = crypto.randomUUID();

		await expect(
			db.transaction(async (tx) => {
				await transition(tx as HyperIdleDb, item.id, {
					target: "flag",
					reason: "will roll back",
					editId,
				});
				throw new Error("forced rollback");
			}),
		).rejects.toThrow("forced rollback");

		const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, item.id));
		expect(row?.status).toBe("active");
		expect(row?.status).not.toBe("draft");

		const logs = await db
			.select()
			.from(knowledgeEditLog)
			.where(eq(knowledgeEditLog.editType, "flag"));
		expect(logs).toHaveLength(0);
	});
});

describe("flagItem's own two writes stay atomic with each other (AU31 review B2)", () => {
	test("a fault on the edit-log insert rolls back the status change too, called on a plain pooled handle", async ({
		db,
	}) => {
		const item = await seedItem(db, { status: "active" });
		const editId = crypto.randomUUID();

		await db.execute(
			sql`drop trigger if exists au31_b2_reject_knowledge_edit_log on knowledge_edit_log`,
		);
		await db.execute(sql`
			create or replace function au31_b2_reject_knowledge_edit_log() returns trigger as $$
			begin raise exception 'AU31 B2 injected knowledge_edit_log write failure'; end;
			$$ language plpgsql
		`);
		await db.execute(sql`
			create trigger au31_b2_reject_knowledge_edit_log
			before insert on knowledge_edit_log
			for each row execute function au31_b2_reject_knowledge_edit_log()
		`);

		try {
			// `db` here is the plain pooled handle `routes/knowledge.ts` passes —
			// not a caller-opened transaction — so this proves `transition`'s
			// "flag" case wraps its own two writes rather than relying on a
			// caller to.
			await expect(
				transition(db, item.id, { target: "flag", reason: "will roll back", editId }),
			).rejects.toThrow();

			const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, item.id));
			expect(row?.status).toBe("active");
			expect(row?.status).not.toBe("draft");

			const logs = await db
				.select()
				.from(knowledgeEditLog)
				.where(eq(knowledgeEditLog.editType, "flag"));
			expect(logs).toHaveLength(0);
		} finally {
			// The pool reuses one PGlite instance across test files (truncate,
			// not drop), so the injected trigger must not outlive this test.
			await db.execute(
				sql`drop trigger if exists au31_b2_reject_knowledge_edit_log on knowledge_edit_log`,
			);
		}
	});
});

describe("changeScope exact-behavior lock", () => {
	test("writes editType scope_change rows with the exact newValue format", async ({ db }) => {
		const existing = await seedItem(db, { scopeKind: "user", scopeId: "u-founder" });
		const reason = "Promoted to product knowledge";

		await transition(db, existing.id, {
			target: "changeScope",
			scopeKind: "product",
			scopeId: "prod-123",
			reason,
			updatedBy: "u-founder",
		});

		const logs = await db
			.select()
			.from(knowledgeEditLog)
			.where(eq(knowledgeEditLog.itemId, existing.id));

		const scopeKindLog = logs.find((l) => l.field === "scope_kind");
		const scopeIdLog = logs.find((l) => l.field === "scope_id");

		expect(scopeKindLog).toBeDefined();
		expect(scopeKindLog?.editType).toBe("scope_change");
		expect(scopeKindLog?.newValue).toBe(`product (reason: ${reason})`);

		expect(scopeIdLog).toBeDefined();
		expect(scopeIdLog?.editType).toBe("scope_change");
		expect(scopeIdLog?.newValue).toBe("prod-123");
	});
});
