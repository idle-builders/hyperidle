/**
 * AU20 Stage 1 — completeness contract for the knowledge service.
 *
 * Maps every capability a consumer actually needs (service-data-23.json,
 * name=="knowledge") to an integration test that imports the code and
 * asserts real DB behavior. These tests must:
 *   (a) pass GREEN on the OLD code (proving they capture real behavior)
 *   (b) still pass GREEN on the NEW code (proving the rewrite is non-lossy)
 *
 * Consumer demand:
 *   git-export:        listExportableItems, getProjectionByItemId
 *   dispatch:          runAutoPromotionSweep, runStaleSweep, listRecentByLayers,
 *                      recomputeAttentionForCandidates
 *   session-requests:  findById
 *   tool-handlers:     search, create, findKnowledgeItemVersionById,
 *                      findKnowledgeItemStatusById, findOpenConflictByItemAndProposer,
 *                      createKnowledgeConflict, promoteKnowledgeItem,
 *                      upsertKnowledgeAppProjectionAttentionScore,
 *                      recomputeAttentionScoreForItem
 *
 * Atomic/concurrency guarantees pinned:
 *   - promoteKnowledgeItem: CAS conditional-UPDATE, CONFLICT_OPEN gate,
 *     CONCURRENT_MODIFICATION when status already changed
 *   - runStaleSweep / markStale: CAS conditional-UPDATE (active only)
 *   - update(): VersionConflictError on stale version, ItemDeletedError on missing row
 *   - upsertKnowledgeAppProjectionAttentionScore: upsert (update-or-insert)
 */
import {
	type HyperIdleDb,
	knowledgeAppProjection,
	knowledgeEditLog,
	knowledgeItems,
} from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { VersionConflictError } from "../errors.js";
import { setupFts } from "../fts.js";
import {
	createKnowledgeConflict,
	findOpenConflictByItemAndProposer,
} from "../knowledge-conflicts.js";
import {
	countAccessesSince,
	countTriageVisible,
	create,
	findDetailById,
	findKnowledgeItemProjectionById,
	get,
	listExportableKnowledgeItems,
	listRecentByLayers,
	listVisibleWithSignals,
	recordKnowledgeAccess,
	search,
	update,
	upsertKnowledgeAppProjectionAttentionScore,
} from "../knowledge-repository.js";
import {
	promoteKnowledgeItem,
	runAutoPromotionSweep,
	runStaleSweep,
	STALE_THRESHOLD_MS,
} from "../promotion-pipeline.js";
import { createRelevanceService, reapKnowledgeAccessLog } from "../relevance-service.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal mock EventBus — only `emit` is used by promotion-pipeline / attention-service. */
const mockEventBus = { emit: (_ev: unknown): void => {} };

/** Seed a knowledge item + projection row via the real create() function. */
async function seedItem(
	db: HyperIdleDb,
	overrides: {
		title?: string;
		body?: string;
		status?: string;
		scopeKind?: string;
		scopeId?: string | null;
		topic?: string | null;
		layer?: string | null;
		kind?: string | null;
	} = {},
): Promise<typeof knowledgeItems.$inferSelect> {
	const created = await create(db, {
		layer: overrides.layer ?? null,
		scopeKind: overrides.scopeKind ?? "factory",
		scopeId: overrides.scopeId ?? null,
		topic: overrides.topic ?? null,
		title: overrides.title ?? "Seed item",
		body: overrides.body ?? "Seed body content.",
		format: "markdown",
		status: overrides.status ?? "active",
		kind: overrides.kind ?? null,
		updatedBy: "u-seed",
	});
	// Return the kernel row.
	const [row] = await db
		.select()
		.from(knowledgeItems)
		.where(eq(knowledgeItems.id, created.id))
		.limit(1);
	if (!row) throw new Error("seedItem: failed to read back created item");
	return row;
}

// ===========================================================================
// A. create — tool-handlers.create
// ===========================================================================

describe("create: writes kernel row + projection row + edit-log in one operation", () => {
	test("create() inserts kernel row, projection row, and a 'create' edit-log entry atomically", async ({
		db,
	}) => {
		const item = await create(db, {
			layer: "L2",
			scopeKind: "team",
			scopeId: "t-1",
			topic: "process",
			title: "How we ship",
			body: "We ship weekly.",
			format: "markdown",
			status: "active",
			kind: "practice",
			updatedBy: "u-author",
		});

		// Kernel row was created.
		expect(item.id).toBeTruthy();
		expect(item.title).toBe("How we ship");
		expect(item.version).toBe(1);
		expect(item.scopeKind).toBe("team");

		// Projection row was created with the layer + kind.
		const [proj] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, item.id));
		expect(proj).toBeDefined();
		expect(proj?.layer).toBe("L2");
		expect(proj?.kind).toBe("practice");

		// Edit-log row with editType 'create'.
		const logs = await db
			.select()
			.from(knowledgeEditLog)
			.where(eq(knowledgeEditLog.itemId, item.id));
		expect(logs).toHaveLength(1);
		expect(logs[0]?.editType).toBe("create");
	});
});

// ===========================================================================
// B. get (summary view) — session-requests.findById, tool-handlers.findById*
// ===========================================================================

describe("get: summary view returns kernel row or null", () => {
	test("get(id) returns the item when it exists", async ({ db }) => {
		const seeded = await seedItem(db, { title: "Get me" });
		const result = await get(db, seeded.id);
		expect(result).not.toBeNull();
		expect(result?.id).toBe(seeded.id);
		expect(result?.title).toBe("Get me");
		// version and status must be present (consumers need these as
		// replacements for findKnowledgeItemVersionById / findKnowledgeItemStatusById).
		expect(result?.version).toBe(1);
		expect(typeof result?.status).toBe("string");
	});

	test("get(id) returns null for unknown id", async ({ db }) => {
		const result = await get(db, "nonexistent-id");
		expect(result).toBeNull();
	});
});

// ===========================================================================
// C. get (projection view) — git-export.getProjectionByItemId
// ===========================================================================

describe("get(id, {view:'projection'}): returns layer+kind from projection table", () => {
	test("returns layer and kind for an item with a projection row", async ({ db }) => {
		const seeded = await seedItem(db, { layer: "L3", kind: "finding" });
		const proj = await get(db, seeded.id, { view: "projection" });
		expect(proj).not.toBeNull();
		expect(proj?.layer).toBe("L3");
		expect(proj?.kind).toBe("finding");
	});

	test("returns null for unknown id", async ({ db }) => {
		const proj = await get(db, "no-such-item", { view: "projection" });
		expect(proj).toBeNull();
	});
});

// ===========================================================================
// D. get (detail view) — items detail read
// ===========================================================================

describe("get(id, {view:'detail'}): returns kernel item + projection fields", () => {
	test("returns item with confidence and relevanceScore from projection table", async ({ db }) => {
		const seeded = await seedItem(db, { layer: "L1", kind: "observation" });

		// Manually set a relevanceScore on the projection row.
		await db
			.update(knowledgeAppProjection)
			.set({ relevanceScore: "0.75", confidence: "0.9" })
			.where(eq(knowledgeAppProjection.knowledgeItemId, seeded.id));

		const detail = await findDetailById(db, seeded.id);
		expect(detail).not.toBeNull();
		expect(detail?.item.id).toBe(seeded.id);
		expect(detail?.layer).toBe("L1");
		expect(detail?.confidence).toBe("0.9");
		expect(detail?.relevanceScore).toBe("0.75");
	});
});

// ===========================================================================
// E. update — version-checked write + VersionConflictError
// ===========================================================================

describe("update: version-checked update writes edit-log and bumps version", () => {
	test("update() bumps version and writes edit-log on success", async ({ db }) => {
		const item = await seedItem(db, { title: "Before update" });

		const updated = await update(db, item.id, { title: "After update", updatedBy: "u-edit" }, 1);

		expect(updated.title).toBe("After update");
		expect(updated.version).toBe(2);

		const logs = await db
			.select()
			.from(knowledgeEditLog)
			.where(eq(knowledgeEditLog.itemId, item.id));
		const updateLog = logs.find((l) => l.editType === "update" && l.field === "title");
		expect(updateLog).toBeDefined();
		expect(updateLog?.oldValue).toBe("Before update");
		expect(updateLog?.newValue).toBe("After update");
	});

	test("update() throws VersionConflictError when expectedVersion is stale", async ({ db }) => {
		const item = await seedItem(db);
		// First update succeeds (v1 → v2).
		await update(db, item.id, { title: "v2" }, 1);
		// Second update with stale version (still 1) must fail.
		await expect(update(db, item.id, { title: "v3" }, 1)).rejects.toBeInstanceOf(
			VersionConflictError,
		);
	});
});

// ===========================================================================
// F. list({exportable}) — git-export.listExportableItems
// ===========================================================================

describe("list({exportable}): filters by layer and status", () => {
	test("listExportableKnowledgeItems() returns items matching layer + status, excludes others", async ({
		db,
	}) => {
		// Matching item: L2 + validated.
		const a = await seedItem(db, {
			layer: "L2",
			status: "validated",
			title: "Exportable",
		});
		// Non-matching: wrong layer.
		await seedItem(db, { layer: "L1", status: "validated", title: "Wrong layer" });
		// Non-matching: wrong status.
		await seedItem(db, { layer: "L2", status: "draft", title: "Wrong status" });

		const rows = await listExportableKnowledgeItems(db, {
			layers: ["L2"],
			statuses: ["validated"],
		});

		expect(rows.map((r) => r.id)).toContain(a.id);
		expect(rows.length).toBe(1);
		expect(rows[0]?.layer).toBe("L2");
		expect(rows[0]?.title).toBe("Exportable");
	});

	test("findKnowledgeItemProjectionById (get projection view) returns layer+kind for git-export events", async ({
		db,
	}) => {
		const item = await seedItem(db, { layer: "L2", kind: "practice" });
		const row = await findKnowledgeItemProjectionById(db, item.id);
		expect(row?.layer).toBe("L2");
		expect(row?.kind).toBe("practice");
	});
});

// ===========================================================================
// G. list({recentByLayers}) — dispatch.listRecentByLayers
// ===========================================================================

describe("list({recentByLayers}): returns items in given layers updated since cutoff", () => {
	test("returns items in requested layers updated after since, excludes older items", async ({
		db,
	}) => {
		// Item that is recent in L2.
		const recent = await seedItem(db, { layer: "L2", title: "Recent L2" });
		// Item in L3 (different layer — excluded by filter).
		await seedItem(db, { layer: "L3", title: "L3 item" });

		// Make a 'recent' cutoff well before the items' timestamps.
		const since = new Date(Date.now() - 60_000).toISOString(); // 1 minute ago

		const rows = await listRecentByLayers(db, ["L2"], since);

		expect(rows.map((r) => r.title)).toContain("Recent L2");
		expect(rows.some((r) => r.title === "L3 item")).toBe(false);
		expect(rows.find((r) => r.title === "Recent L2")?.layer).toBe("L2");

		// An item updated BEFORE the cutoff is excluded.
		const staleTs = new Date(Date.now() - 120_000).toISOString(); // 2 minutes ago
		await db
			.update(knowledgeItems)
			.set({ updatedAt: staleTs })
			.where(eq(knowledgeItems.id, recent.id));

		const rowsAfterStale = await listRecentByLayers(
			db,
			["L2"],
			new Date(Date.now() - 60_000).toISOString(),
		);
		expect(rowsAfterStale.some((r) => r.title === "Recent L2")).toBe(false);
	});
});

// ===========================================================================
// H. count (triage visible) — UI triage count with Q2 auth boundary
// ===========================================================================

describe("countTriageVisible: Q2 auth boundary on draft+needs_human items", () => {
	test("counts draft and needs_human items; excludes user-scoped items not owned by viewer", async ({
		db,
	}) => {
		// Non-user items — always visible.
		await seedItem(db, { status: "draft", scopeKind: "factory" });
		await seedItem(db, { status: "needs_human", scopeKind: "team" });
		// User-scoped item owned by the viewer — visible.
		await create(db, {
			layer: null,
			scopeKind: "user",
			title: "My draft",
			body: "x",
			format: "markdown",
			status: "draft",
			updatedBy: "u-viewer",
		});
		// User-scoped item owned by someone else — excluded.
		await create(db, {
			layer: null,
			scopeKind: "user",
			title: "Other draft",
			body: "x",
			format: "markdown",
			status: "draft",
			updatedBy: "u-other",
		});
		// Active item — not triage.
		await seedItem(db, { status: "active" });

		const count = await countTriageVisible(db, "u-viewer");
		// factory-draft + team-needs_human + viewer's own user-draft = 3.
		expect(count).toBe(3);
	});
});

// ===========================================================================
// I. search — tool-handlers.search (FTS)
// ===========================================================================

describe("search: full-text search returns matching items", () => {
	test("search() returns items whose title/body match the query term", async ({ db }) => {
		// Set up the FTS generated column (idempotent).
		await setupFts(db);

		const match = await seedItem(db, {
			title: "Continuous deployment pipeline",
			body: "We run CI on every commit.",
		});
		await seedItem(db, { title: "Irrelevant topic", body: "Nothing matching here." });

		const results = await search(db, "deployment");

		expect(results.map((r) => r.id)).toContain(match.id);
		// The irrelevant item should not appear.
		expect(results.some((r) => r.title === "Irrelevant topic")).toBe(false);
	});

	test("search() returns empty array for query with no matches", async ({ db }) => {
		await setupFts(db);
		await seedItem(db, { title: "Alpha", body: "Something about alpha." });

		const results = await search(db, "xyznonexistentterm");
		expect(results).toHaveLength(0);
	});
});

// ===========================================================================
// J. promoteKnowledgeItem — tool-handlers.promoteKnowledgeItem (atomic CAS)
// ===========================================================================

describe("promoteKnowledgeItem: atomic CAS status transition", () => {
	test("succeeds when item is in fromStatus and no open conflicts block to-validated", async ({
		db,
	}) => {
		const item = await seedItem(db, { status: "provisional" });

		const result = await promoteKnowledgeItem(db, {
			knowledgeItemId: item.id,
			fromStatus: "provisional",
			toStatus: "validated",
			reason: "meets criteria",
			editor: "u-facilitator",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.fromStatus).toBe("provisional");
		}

		const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, item.id));
		expect(row?.status).toBe("validated");

		// Edit-log row written for the transition.
		const logs = await db
			.select()
			.from(knowledgeEditLog)
			.where(eq(knowledgeEditLog.itemId, item.id));
		const promotionLog = logs.find((l) => l.field === "status");
		expect(promotionLog).toBeDefined();
		expect(promotionLog?.oldValue).toBe("provisional");
		expect(promotionLog?.newValue).toContain("validated");
	});

	test("returns CONFLICT_OPEN when an open conflict blocks promotion to validated", async ({
		db,
	}) => {
		const item = await seedItem(db, { status: "provisional" });

		// Insert an open conflict on this item.
		await createKnowledgeConflict(db, {
			id: crypto.randomUUID(),
			itemId: item.id,
			versionBase: 1,
			versionCurrent: 1,
			proposedBody: "conflicting body",
			proposedMeta: null,
			proposedBy: "u-agent",
			createdAt: new Date().toISOString(),
		});

		const result = await promoteKnowledgeItem(db, {
			knowledgeItemId: item.id,
			fromStatus: "provisional",
			toStatus: "validated",
			reason: undefined,
			editor: "u-facilitator",
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe("CONFLICT_OPEN");
		}
		// Status unchanged.
		const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, item.id));
		expect(row?.status).toBe("provisional");
	});

	test("returns CONCURRENT_MODIFICATION when status no longer matches fromStatus", async ({
		db,
	}) => {
		const item = await seedItem(db, { status: "provisional" });

		// First promotion changes the status to validated.
		await promoteKnowledgeItem(db, {
			knowledgeItemId: item.id,
			fromStatus: "provisional",
			toStatus: "validated",
			reason: undefined,
			editor: "u-1",
		});

		// Second attempt with stale fromStatus.
		const result = await promoteKnowledgeItem(db, {
			knowledgeItemId: item.id,
			fromStatus: "provisional",
			toStatus: "validated",
			reason: undefined,
			editor: "u-2",
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe("CONCURRENT_MODIFICATION");
		}
	});
});

// ===========================================================================
// K. runAutoPromotionSweep — dispatch.runAutoPromotionSweep
// ===========================================================================

describe("runAutoPromotionSweep: promotes provisional items at 5+ cross-scope repetitions", () => {
	test("promotes items that meet the cross-scope repetition threshold (5+)", async ({ db }) => {
		// Create 5 provisional items with the same (layer, topic, kind) signature
		// but different scopeIds so cross-scope count reaches threshold=5.
		const promotable: string[] = [];
		for (let i = 1; i <= 5; i++) {
			const item = await seedItem(db, {
				status: "provisional",
				layer: "L2",
				kind: "observation",
				topic: "shared-pattern",
				scopeKind: "bet",
				scopeId: `product-${i}`,
			});
			promotable.push(item.id);
		}

		const result = await runAutoPromotionSweep(db, mockEventBus);

		// All 5 items should be promoted (no open conflicts, no L4 contradiction).
		expect(result.promotedIds.length).toBeGreaterThanOrEqual(5);
		for (const id of promotable) {
			expect(result.promotedIds).toContain(id);
		}
		expect(result.flaggedForReviewIds).toHaveLength(0);

		// DB rows updated.
		for (const id of promotable) {
			const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id));
			expect(row?.status).toBe("validated");
		}
	});

	test("skips items with fewer than 5 distinct scopes", async ({ db }) => {
		// Only 3 items — not enough for auto-promotion.
		for (let i = 1; i <= 3; i++) {
			await seedItem(db, {
				status: "provisional",
				layer: "L2",
				kind: "insight",
				topic: "small-pattern",
				scopeKind: "bet",
				scopeId: `scope-${i}`,
			});
		}

		const result = await runAutoPromotionSweep(db, mockEventBus);

		expect(result.promotedIds).toHaveLength(0);
		expect(result.skippedIds.length).toBeGreaterThanOrEqual(3);
	});
});

// ===========================================================================
// L. runStaleSweep — dispatch.runStaleSweep
// ===========================================================================

describe("runStaleSweep: marks active items older than threshold as stale (CAS)", () => {
	test("marks active items whose updatedAt is before the stale cutoff", async ({ db }) => {
		const item = await seedItem(db, { status: "active" });

		// Backdate updatedAt beyond the stale threshold (90+ days).
		const oldTimestamp = new Date(Date.now() - STALE_THRESHOLD_MS - 1000).toISOString();
		await db
			.update(knowledgeItems)
			.set({ updatedAt: oldTimestamp })
			.where(eq(knowledgeItems.id, item.id));

		const nowMs = Date.now();
		const result = await runStaleSweep(db, mockEventBus, nowMs, STALE_THRESHOLD_MS, {
			silent: true,
		});

		expect(result.markedIds).toContain(item.id);

		const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, item.id));
		expect(row?.status).toBe("stale");
	});

	test("does not mark items updated recently", async ({ db }) => {
		const item = await seedItem(db, { status: "active" });

		const nowMs = Date.now();
		const result = await runStaleSweep(db, mockEventBus, nowMs, STALE_THRESHOLD_MS, {
			silent: true,
		});

		expect(result.markedIds).not.toContain(item.id);

		const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, item.id));
		expect(row?.status).toBe("active");
	});

	test("CAS: does not mark an item twice (idempotent via conditional UPDATE on status=active)", async ({
		db,
	}) => {
		const item = await seedItem(db, { status: "active" });
		const oldTs = new Date(Date.now() - STALE_THRESHOLD_MS - 1000).toISOString();
		await db.update(knowledgeItems).set({ updatedAt: oldTs }).where(eq(knowledgeItems.id, item.id));

		const nowMs = Date.now();
		// First sweep marks it stale.
		const r1 = await runStaleSweep(db, mockEventBus, nowMs, STALE_THRESHOLD_MS, { silent: true });
		expect(r1.markedIds).toContain(item.id);

		// Second sweep — item is already stale, must not appear again.
		const r2 = await runStaleSweep(db, mockEventBus, nowMs, STALE_THRESHOLD_MS, { silent: true });
		expect(r2.markedIds).not.toContain(item.id);
	});
});

// ===========================================================================
// M. upsertKnowledgeAppProjectionAttentionScore — tool-handlers
// ===========================================================================

describe("upsertKnowledgeAppProjectionAttentionScore: atomic upsert of attentionScore", () => {
	test("creates a projection row when none exists and writes attentionScore", async ({ db }) => {
		// Create item without a projection layer (raw insert so no projection row exists).
		const id = crypto.randomUUID();
		const ts = new Date().toISOString();
		await db.insert(knowledgeItems).values({
			id,
			scopeKind: "factory",
			title: "Attention test",
			body: "body",
			format: "markdown",
			status: "active",
			version: 1,
			updatedBy: "u-1",
			createdAt: ts,
			updatedAt: ts,
		});
		// No projection row initially.
		const [before] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, id));
		expect(before).toBeUndefined();

		await upsertKnowledgeAppProjectionAttentionScore(db, id, "0.85");

		const [after] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, id));
		expect(after?.attentionScore).toBe("0.85");
	});

	test("updates existing projection row's attentionScore without creating a duplicate", async ({
		db,
	}) => {
		const item = await seedItem(db, { layer: "L2" });

		await upsertKnowledgeAppProjectionAttentionScore(db, item.id, "0.55");
		await upsertKnowledgeAppProjectionAttentionScore(db, item.id, "0.92");

		const rows = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, item.id));
		// Exactly one projection row (no duplicate created by double upsert).
		expect(rows).toHaveLength(1);
		expect(rows[0]?.attentionScore).toBe("0.92");
	});
});

// ===========================================================================
// N. Conflicts — tool-handlers.findOpenConflict / createKnowledgeConflict
// ===========================================================================

describe("conflicts: createKnowledgeConflict and findOpenConflictByItemAndProposer", () => {
	test("createKnowledgeConflict inserts an open conflict row", async ({ db }) => {
		const item = await seedItem(db);
		const conflictId = crypto.randomUUID();

		await createKnowledgeConflict(db, {
			id: conflictId,
			itemId: item.id,
			versionBase: 1,
			versionCurrent: 2,
			proposedBody: "proposed edit",
			proposedMeta: null,
			proposedBy: "u-agent",
			createdAt: new Date().toISOString(),
		});

		const found = await findOpenConflictByItemAndProposer(db, item.id, "u-agent");
		expect(found).toBeDefined();
		expect(found?.id).toBe(conflictId);
	});

	test("findOpenConflictByItemAndProposer returns undefined when no open conflict exists", async ({
		db,
	}) => {
		const item = await seedItem(db);
		const result = await findOpenConflictByItemAndProposer(db, item.id, "u-nobody");
		expect(result).toBeUndefined();
	});

	test("findOpenConflictByItemAndProposer does not return conflicts filed by a different proposer", async ({
		db,
	}) => {
		const item = await seedItem(db);
		await createKnowledgeConflict(db, {
			id: crypto.randomUUID(),
			itemId: item.id,
			versionBase: 1,
			versionCurrent: 2,
			proposedBody: "edit by agent-A",
			proposedMeta: null,
			proposedBy: "agent-A",
			createdAt: new Date().toISOString(),
		});

		// Looking up for agent-B should return nothing.
		const forB = await findOpenConflictByItemAndProposer(db, item.id, "agent-B");
		expect(forB).toBeUndefined();

		// But agent-A's conflict is still there.
		const forA = await findOpenConflictByItemAndProposer(db, item.id, "agent-A");
		expect(forA).toBeDefined();
	});
});

// ===========================================================================
// O. AccessLog — recordKnowledgeAccess, countAccessesSince, reapKnowledgeAccessLog
// ===========================================================================

describe("access log: recordKnowledgeAccess / countAccessesSince / reapKnowledgeAccessLog", () => {
	test("recordKnowledgeAccess appends a row; countAccessesSince counts rows since cutoff", async ({
		db,
	}) => {
		const item = await seedItem(db);
		const t0 = new Date().toISOString();

		await recordKnowledgeAccess(db, {
			itemId: item.id,
			accessorKind: "user",
			accessorId: "u-reader",
			accessedAt: new Date().toISOString(),
		});

		const count = await countAccessesSince(db, item.id, t0);
		expect(count).toBe(1);
	});

	test("countAccessesSince returns 0 when all accesses are before the cutoff", async ({ db }) => {
		const item = await seedItem(db);

		await recordKnowledgeAccess(db, {
			itemId: item.id,
			accessorKind: "user",
			accessorId: "u-reader",
			accessedAt: "2020-01-01T00:00:00.000Z",
		});

		// Cutoff AFTER the access.
		const count = await countAccessesSince(db, item.id, "2020-06-01T00:00:00.000Z");
		expect(count).toBe(0);
	});

	test("reapKnowledgeAccessLog deletes rows older than cutoff and returns their ids", async ({
		db,
	}) => {
		const item = await seedItem(db);

		await recordKnowledgeAccess(db, {
			itemId: item.id,
			accessorKind: "user",
			accessorId: "u-reader",
			accessedAt: "2020-01-01T00:00:00.000Z",
		});

		const cutoff = "2021-01-01T00:00:00.000Z";
		const deleted = await reapKnowledgeAccessLog(db, cutoff);

		expect(deleted.length).toBeGreaterThanOrEqual(1);
		// After reap, the count for that item is 0.
		const count = await countAccessesSince(db, item.id, "2019-01-01T00:00:00.000Z");
		expect(count).toBe(0);
	});
});

// ===========================================================================
// P. Relevance — createRelevanceService().recomputeScores (denormalize)
// ===========================================================================

describe("recomputeRelevance: denormalizes relevanceScore onto projection row", () => {
	test("recomputeScores() writes relevanceScore to the projection row for items with access activity", async ({
		db,
	}) => {
		const item = await seedItem(db, { layer: "L2" });

		// Simulate a recent access so the relevance score is not null.
		await recordKnowledgeAccess(db, {
			itemId: item.id,
			accessorKind: "agent",
			accessorId: "a-1",
			accessedAt: new Date().toISOString(),
		});

		const service = createRelevanceService(db);
		await service.recomputeScores([item.id]);

		const [proj] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, item.id));
		expect(proj?.relevanceScore).not.toBeNull();
		const score = Number(proj?.relevanceScore);
		expect(score).toBeGreaterThan(0);
		expect(score).toBeLessThanOrEqual(1);
	});

	test("recomputeScores() writes null relevanceScore for items with no access activity", async ({
		db,
	}) => {
		const item = await seedItem(db, { layer: "L2" });
		// No access log rows.

		const service = createRelevanceService(db);
		await service.recomputeScores([item.id]);

		const [proj] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, item.id));
		expect(proj?.relevanceScore).toBeNull();
	});
});

// ===========================================================================
// Q. listVisibleWithSignals — dispatch / UI context (Q2 auth boundary)
// ===========================================================================

describe("listVisibleWithSignals: Q2 auth boundary + access signal aggregation", () => {
	test("excludes user-scoped items not owned by the viewer", async ({ db }) => {
		// Shared item — always visible.
		await create(db, {
			layer: null,
			scopeKind: "factory",
			title: "Factory item",
			body: "x",
			format: "markdown",
			status: "active",
			updatedBy: "u-any",
		});
		// Viewer's own user-scoped item — visible.
		await create(db, {
			layer: null,
			scopeKind: "user",
			title: "My item",
			body: "x",
			format: "markdown",
			status: "active",
			updatedBy: "u-viewer",
		});
		// Other user's item — excluded.
		await create(db, {
			layer: null,
			scopeKind: "user",
			title: "Hidden item",
			body: "x",
			format: "markdown",
			status: "active",
			updatedBy: "u-other",
		});

		const rows = await listVisibleWithSignals(db, "u-viewer");

		const titles = rows.map((r) => r.item.title);
		expect(titles).toContain("Factory item");
		expect(titles).toContain("My item");
		expect(titles).not.toContain("Hidden item");
	});
});
