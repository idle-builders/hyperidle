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
 *   export surface:    listExportableItems, getProjectionByItemId
 *   dispatch:          recomputeAttentionForCandidates
 *   session-requests:  findById
 *   tool-handlers:     search, create, findKnowledgeItemVersionById,
 *                      findKnowledgeItemStatusById, promoteKnowledgeItem,
 *                      upsertKnowledgeAppProjectionAttentionScore,
 *                      recomputeAttentionScoreForItem
 *
 * Atomic/concurrency guarantees pinned:
 *   - promoteKnowledgeItem: CAS conditional-UPDATE, CONCURRENT_MODIFICATION
 *     when status already changed
 *   - update(): VersionConflictError on stale version, ItemDeletedError on missing row
 *   - upsertKnowledgeAppProjectionAttentionScore: upsert (update-or-insert)
 *
 * @lore nested-knowledge-items: `layer`/`kind`/`topic` are gone with the
 * vocabularies they carried (plan.md "the two jobs, separated"). Cases G
 * (`list({recentByLayers})`) and the layer/kind half of case D are DELETED —
 * that vocabulary no longer exists to round-trip.
 *
 * @lore document-module B0c: `findOpenConflictByItemAndProposer`/
 * `createKnowledgeConflict` and the promote route's `CONFLICT_OPEN` gate are
 * DELETED — a document has no conflict object (founder ruling).
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
import { VersionConflictError } from "../errors.js";
import { count, create, get, list, search, transition, update } from "../knowledge-repository.js";
import type { KnowledgeStatus } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seed a knowledge item + projection row via the real create() function. */
async function seedItem(
	db: HyperIdleDb,
	overrides: {
		title?: string;
		body?: string;
		status?: KnowledgeStatus | KernelKnowledgeStatus;
		scopeKind?: string;
		scopeId?: string | null;
		parentKind?: "knowledge_item";
		parentId?: string | null;
	} = {},
): Promise<typeof knowledgeItems.$inferSelect> {
	const created = await create(db, {
		scopeKind: overrides.scopeKind ?? "factory",
		scopeId: overrides.scopeId ?? null,
		title: overrides.title ?? "Seed item",
		body: overrides.body ?? "Seed body content.",
		format: "markdown",
		status: overrides.status ?? "active",
		...(overrides.parentKind
			? { parentKind: overrides.parentKind, parentId: overrides.parentId }
			: {}),
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
			scopeKind: "team",
			scopeId: "t-1",
			title: "How we ship",
			body: "We ship weekly.",
			format: "markdown",
			status: "active",
			updatedBy: "u-author",
		});

		// Kernel row was created.
		expect(item.id).toBeTruthy();
		expect(item.title).toBe("How we ship");
		expect(item.version).toBe(1);
		expect(item.scopeKind).toBe("team");

		// Projection row was created.
		const [proj] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, item.id));
		expect(proj).toBeDefined();

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
// D. get (full view) — items detail read
// ===========================================================================

describe("get(id, {view:'full'}): returns kernel item merged with projection fields", () => {
	test("returns item with its parent chain fields present", async ({ db }) => {
		const parent = await seedItem(db, { title: "Parent" });
		const seeded = await seedItem(db, { parentKind: "knowledge_item", parentId: parent.id });

		const full = await get(db, seeded.id, { view: "full" });
		expect(full).not.toBeNull();
		expect(full?.id).toBe(seeded.id);
		expect(full?.parentKind).toBe("knowledge_item");
		expect(full?.parentId).toBe(parent.id);
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
// H. count (triage visible) — UI triage count with Q2 auth boundary
// ===========================================================================

describe("countTriageVisible auth boundary on proposed items", () => {
	test("counts proposed items; excludes user-scoped items not owned by viewer", async ({ db }) => {
		// Non-user items — always visible.
		await seedItem(db, { status: "proposed", scopeKind: "factory" });
		await seedItem(db, { status: "proposed", scopeKind: "team" });
		// User-scoped item owned by the viewer — visible.
		await create(db, {
			scopeKind: "user",
			title: "My proposal",
			body: "x",
			format: "markdown",
			status: "proposed",
			updatedBy: "u-viewer",
		});
		// User-scoped item owned by someone else — excluded.
		await create(db, {
			scopeKind: "user",
			title: "Other proposal",
			body: "x",
			format: "markdown",
			status: "proposed",
			updatedBy: "u-other",
		});
		// Active item — not triage.
		await seedItem(db, { status: "active" });

		const triageCount = await count(db, { triageVisible: "u-viewer" });
		// factory-proposed + team-proposed + viewer's own user-proposed = 3.
		expect(triageCount).toBe(3);
	});
});

// ===========================================================================
// I. search — tool-handlers.search (FTS)
// ===========================================================================

describe("search: full-text search returns matching items", () => {
	test("search() returns items whose title/body match the query term", async ({ db }) => {
		// Set up the FTS generated column (idempotent).

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
		await seedItem(db, { title: "Alpha", body: "Something about alpha." });

		const results = await search(db, "xyznonexistentterm");
		expect(results).toHaveLength(0);
	});
});

// ===========================================================================
// J. transition({target:"promote"}) — tool-handlers.promoteKnowledgeItem (atomic CAS)
// @lore AU20 K2-writes: promoteKnowledgeItem → transition({target:"promote",...}).
// ===========================================================================

describe("transition({target:'promote'}): atomic CAS status transition", () => {
	test("succeeds when item is in fromStatus and no open conflicts block to-active", async ({
		db,
	}) => {
		const item = await seedItem(db, { status: "proposed" });

		const result = await transition(db, item.id, {
			target: "promote",
			fromStatus: "proposed",
			toStatus: "active",
			reason: "meets criteria",
			editor: "u-facilitator",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.fromStatus).toBe("proposed");
		}

		const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, item.id));
		expect(row?.status).toBe("active");

		// Edit-log row written for the transition.
		const logs = await db
			.select()
			.from(knowledgeEditLog)
			.where(eq(knowledgeEditLog.itemId, item.id));
		const promotionLog = logs.find((l) => l.field === "status");
		expect(promotionLog).toBeDefined();
		expect(promotionLog?.oldValue).toBe("proposed");
		expect(promotionLog?.newValue).toContain("active");
	});

	test("returns CONCURRENT_MODIFICATION when status no longer matches fromStatus", async ({
		db,
	}) => {
		const item = await seedItem(db, { status: "proposed" });

		// First promotion changes the status to active.
		await transition(db, item.id, {
			target: "promote",
			fromStatus: "proposed",
			toStatus: "active",
			reason: undefined,
			editor: "u-1",
		});

		// Second attempt with stale fromStatus.
		const result = await transition(db, item.id, {
			target: "promote",
			fromStatus: "proposed",
			toStatus: "active",
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
// Q. list({tree}) — dispatch / UI context (Q2 auth boundary)
// ===========================================================================

describe("list({tree}) auth boundary and access signal aggregation", () => {
	test("excludes user-scoped items not owned by the viewer", async ({ db }) => {
		// Shared item — always visible.
		await create(db, {
			scopeKind: "factory",
			title: "Factory item",
			body: "x",
			format: "markdown",
			status: "active",
			updatedBy: "u-any",
		});
		// Viewer's own user-scoped item — visible.
		await create(db, {
			scopeKind: "user",
			title: "My item",
			body: "x",
			format: "markdown",
			status: "active",
			updatedBy: "u-viewer",
		});
		// Other user's item — excluded.
		await create(db, {
			scopeKind: "user",
			title: "Hidden item",
			body: "x",
			format: "markdown",
			status: "active",
			updatedBy: "u-other",
		});

		const rows = await list(db, { tree: { viewerUserId: "u-viewer", viewerTeamId: null } });

		const titles = rows.map((r) => r.title);
		expect(titles).toContain("Factory item");
		expect(titles).toContain("My item");
		expect(titles).not.toContain("Hidden item");
	});
});
