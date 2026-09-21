/**
 * @lore O2: knowledge-repository split canonical item rows from app projection rows.
 * - knowledgeItems table no longer has layer, scopeId, kind, attentionScore,
 *   relevanceScore, citationCount, lastCitedAt, confidence, meta columns.
 * - These fields are now stored in knowledgeAppProjection (extension table).
 * - create() inserts into both tables; update() updates both tables;
 *   list() JOINs against extension table for filter/sort on projection fields.
 * - KnowledgeItem type is augmented with optional projection fields from the
 *   extension table via KnowledgeItemWithProjection.
 *
 * @lore AU20 K1-reads: all individual read function declarations (findById,
 * findDetailById, findKnowledgeItemProjectionById, listVisibleWithSignals,
 * findRetroKnowledgeItemForBet, listTitlesByIds, listRecentByLayers,
 * listExportableKnowledgeItems, findRelatedByTopic, countTriageVisible,
 * countAccessesSince, searchByText, searchVisibleByText) are DELETED from
 * source. Their logic is inlined into get(), list(), count(), countAccesses(),
 * and the extended search(). Callers use the general entry points only.
 */
import {
	type HyperIdleDb,
	type KnowledgeItem,
	knowledgeAppProjection,
	knowledgeEditLog,
	knowledgeItems,
	type WriteExecutor,
} from "@hyperidle/db";

import type {
	KernelKnowledgeStatus,
	KnowledgeParentKind,
	KnowledgeRole,
} from "@hyperidle/domain-model";
import { and, desc, eq, inArray, isNull, ne, or, type SQL, sql } from "drizzle-orm";
import { InvalidReparentError, ItemDeletedError, VersionConflictError } from "./errors.js";
import type { KnowledgeStatus } from "./types.js";

/**
 * @lore nested-knowledge-items §3: scope narrows as you descend — factory is
 * widest, user is narrowest. A child's rank must be >= its parent's.
 */
const SCOPE_RANK: Readonly<Record<string, number>> = { factory: 0, team: 1, user: 2 };

function scopeRank(scopeKind: string): number {
	return SCOPE_RANK[scopeKind] ?? 0;
}

/** Any executor `create`/`update`/`reparent` can run their invariant checks against. */
type Executor = HyperIdleDb | WriteExecutor;

/** Max tree depth (architecture.md §3) — a backstop; the real guard is the cycle check. */
const MAX_TREE_DEPTH = 32;

/**
 * Walk up the `knowledge_item` parent chain starting at `startId`, stopping
 * at the first non-`knowledge_item` parent or a root. Returns `[startId,
 * ..., topmostKnowledgeItemAncestor]` — `chain.length` is exactly the number
 * of `knowledge_item` ancestors a child parented under `startId` would
 * inherit, so `chain.length + 1` is that child's resulting depth.
 */
async function walkKnowledgeItemAncestorChain(
	tx: Executor,
	startId: string,
): Promise<readonly string[]> {
	const chain: string[] = [];
	let currentId: string | null = startId;
	let guard = 0;
	while (currentId) {
		// A real cycle already in the stored tree would otherwise spin forever
		// (architecture §3) — this bound only exists to fail loud instead.
		if (guard++ > 10_000) {
			throw new Error(
				"walkKnowledgeItemAncestorChain: exceeded safety bound — an existing cycle in the stored tree",
			);
		}
		chain.push(currentId);
		const [row] = await tx
			.select({ parentKind: knowledgeItems.parentKind, parentId: knowledgeItems.parentId })
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, currentId))
			.limit(1);
		if (row?.parentKind !== "knowledge_item" || !row.parentId) break;
		currentId = row.parentId;
	}
	return chain;
}

/**
 * The three tree invariants (architecture.md §3), run inside the same
 * transaction as the write that sets a parent — a reparent must re-read live
 * state, not the pre-transaction snapshot, or two concurrent reparents can
 * each look legal and together produce a cycle.
 *
 * Only evaluated when the new parent is a `knowledge_item` — a task/thread/
 * routine/agent parent inherits nothing and is never part of a cycle
 * (architecture §3, "walks stop at the first non-knowledge_item parent").
 */
async function assertParentInvariants(
	tx: Executor,
	input: {
		/** Omitted for `create()` — a brand-new id cannot already be an ancestor. */
		readonly itemId?: string;
		readonly newParentId: string;
		readonly childScopeKind: string;
	},
): Promise<void> {
	const chain = await walkKnowledgeItemAncestorChain(tx, input.newParentId);

	if (input.itemId && chain.includes(input.itemId)) {
		throw new InvalidReparentError(
			"cycle",
			`reparent: parenting ${input.itemId} under ${input.newParentId} would create a cycle`,
		);
	}
	if (chain.length >= MAX_TREE_DEPTH) {
		throw new InvalidReparentError(
			"depth-exceeded",
			`reparent: resulting depth would exceed the maximum of ${MAX_TREE_DEPTH}`,
		);
	}

	const parentId = chain[0];
	const [parentRow] = await tx
		.select({ scopeKind: knowledgeItems.scopeKind })
		.from(knowledgeItems)
		.where(eq(knowledgeItems.id, parentId ?? input.newParentId))
		.limit(1);
	if (!parentRow) {
		throw new InvalidReparentError(
			"parent-not-found",
			`reparent: parent knowledge item ${input.newParentId} does not exist`,
		);
	}
	if (scopeRank(input.childScopeKind) < scopeRank(parentRow.scopeKind)) {
		throw new InvalidReparentError(
			"scope-too-wide",
			`reparent: scope '${input.childScopeKind}' is wider than parent scope '${parentRow.scopeKind}'`,
		);
	}
}

/** Append-at-end position for a new or moved child of one parent (or among roots). */
async function nextPositionForParent(
	tx: Executor,
	parentKind: string | null,
	parentId: string | null,
): Promise<number> {
	const condition =
		parentKind === null || parentId === null
			? and(isNull(knowledgeItems.parentKind), isNull(knowledgeItems.parentId))
			: and(eq(knowledgeItems.parentKind, parentKind), eq(knowledgeItems.parentId, parentId));
	const [row] = await tx
		.select({ maxPos: sql<number | null>`MAX(${knowledgeItems.position})` })
		.from(knowledgeItems)
		.where(condition);
	const max = row?.maxPos;
	return max == null ? 0 : Number(max) + 1;
}

/**
 * D5 — narrowing a parent's scope cascades to its subtree. Walks the tree
 * breadth-first from `rootId`; a descendant whose own scope is now WIDER
 * than `newScopeKind` is clamped to it (a descendant already narrower than
 * the new parent scope is left alone — cascading must never WIDEN a scope
 * someone deliberately narrowed).
 */
async function cascadeScopeNarrowing(
	tx: Executor,
	rootId: string,
	newScopeKind: string,
): Promise<void> {
	let frontier: readonly string[] = [rootId];
	let guard = 0;
	while (frontier.length > 0) {
		if (guard++ > 10_000) {
			throw new Error(
				"cascadeScopeNarrowing: exceeded safety bound — an existing cycle in the tree",
			);
		}
		const children = await tx
			.select({ id: knowledgeItems.id, scopeKind: knowledgeItems.scopeKind })
			.from(knowledgeItems)
			.where(
				and(
					eq(knowledgeItems.parentKind, "knowledge_item"),
					inArray(knowledgeItems.parentId, [...frontier]),
				),
			);
		const toNarrow = children.filter((c) => scopeRank(c.scopeKind) < scopeRank(newScopeKind));
		if (toNarrow.length > 0) {
			await tx
				.update(knowledgeItems)
				.set({ scopeKind: newScopeKind })
				.where(
					inArray(
						knowledgeItems.id,
						toNarrow.map((c) => c.id),
					),
				);
		}
		frontier = children.map((c) => c.id);
	}
}

// ---------------------------------------------------------------------------
// Input shapes (public — used by callers of create/update)
// ---------------------------------------------------------------------------

export interface CreateKnowledgeItemInput {
	/** @lore R7: scopeKind written to the kernel table so items are queryable by
	 * scope without a JOIN against the extension table. Defaults to "factory"
	 * when not provided (preserves existing behavior for callers that don't set scope). */
	scopeKind?: string | null;
	scopeId?: string | null;
	/**
	 * What context assembly does with this document: an ordinary knowledge file,
	 * a SKILL.md in the harness skills directory, a rule, or an agent file bound
	 * to one agent. Absent leaves the column default (`ordinary`).
	 */
	role?: KnowledgeRole;
	/**
	 * @lore knowledge-attachment-slot / nested-knowledge-items: which entity
	 * this item hangs off — another knowledge item (the tree), a routine's
	 * prompt, an agent's identity, a task, a thread. Optional: "no parent" is
	 * a root. Both present or both absent — the kernel table's
	 * `ki_parent_pair_ck` enforces the pairing. Setting `parentKind:
	 * 'knowledge_item'` runs the tree invariants (cycle — vacuous for a
	 * brand-new id, scope-no-wider-than-parent, depth<=32) inside the same
	 * transaction as the insert.
	 */
	parentKind?: KnowledgeParentKind | null;
	parentId?: string | null;
	title: string;
	body: string;
	/**
	 * @lore AU14: widened from `KnowledgeFormat` to `string`. The kernel
	 * `knowledgeItems.format` DB column is unconstrained text (no check
	 * constraint) — `KnowledgeFormat` ("markdown" | "toon") is an app-runtime
	 * convention that validated callers (write-memory.ts's `z.enum`, writeback.ts's
	 * literal) already respect, not a DB-level guarantee. The HTTP route's schema
	 * has never validated `format` beyond `z.string()`; narrowing it now to route
	 * through the repository would be a new validation behavior change AU14 forbids.
	 */
	format: string;
	/**
	 * @lore R7: widened to `KnowledgeStatus | KernelKnowledgeStatus` so
	 * agent-created items (write_memory) can be created with status="draft"
	 * without polluting the app-runtime promotion-state enum. "draft" items are
	 * triage items until promoted to active/captured/... by a facilitator.
	 */
	status: KnowledgeStatus | KernelKnowledgeStatus;
	updatedBy: string;
	/** @lore AU44 batch 4: meta is a PLUGIN-written field (Ruling 3) retained here so
	 * the retro knowledge-item upsert (bets.ts POST /:id/retro) can write reflection
	 * metadata until the BA curation plugin track provides a replacement. */
	meta?: string | null;
}

export interface UpdateKnowledgeItemInput {
	scopeId?: string | null;
	title?: string;
	body?: string;
	/** @lore AU14: same `string` widening as CreateKnowledgeItemInput.format — see there. */
	format?: string;
	/** @lore AU14: same `KnowledgeStatus | KernelKnowledgeStatus` widening as
	 * CreateKnowledgeItemInput.status (R7) — the PATCH route accepts kernel
	 * statuses (e.g. "draft") that are outside the app-runtime KnowledgeStatus enum. */
	status?: KnowledgeStatus | KernelKnowledgeStatus;
	/**
	 * Scope lives on the kernel row, and `scopeId` is mirrored onto the
	 * projection after the kernel write — `list()` matches either column with an
	 * OR, so leaving one behind silently changes who can find the document.
	 *
	 * @lore nested-knowledge-items D5: narrowing an item's scope cascades to
	 * its subtree (`update()` runs `cascadeScopeNarrowing` in the same
	 * transaction as this write).
	 */
	scopeKind?: string;
	/**
	 * @lore nested-knowledge-items: reparenting is NOT here — `reparent()` is
	 * a separate entry point because it runs the tree invariants (cycle,
	 * scope, depth) against LIVE state inside its own transaction, which a
	 * generic field-diff update cannot do safely for a self-referential
	 * column.
	 */
	updatedBy?: string;
	/** @lore AU44 batch 4: retained so the retro upsert (Ruling 3 PLUGIN row) can write
	 * reflection metadata until the BA curation plugin track provides a replacement. */
	meta?: string | null;
}

/** Base filter for list() — filters on kernel + projection table fields. */
export interface ListFilters {
	/** Matches scope stored on either the canonical row or its app projection. */
	scopeId?: string | null;
	/**
	 * @lore knowledge-attachment-slot: added so session assembly's layer fetch
	 * (`fetchAllForLayer` in session-knowledge-assembler.ts) can say which role
	 * it wants. Without this, every role — including `prompt` — arrived by the
	 * layer path regardless of the capability allowlist. In the query, not a
	 * post-filter: `list()` is paginated, and a post-filter would silently
	 * shorten pages.
	 */
	role?: KnowledgeRole;
	limit?: number;
	offset?: number;
}

/** Discriminant for get() — selects which projection view to return. */
export type KnowledgeItemView = "summary" | "full";

/**
 * Augments the kernel KnowledgeItem with app-runtime fields from the
 * knowledgeAppProjection extension table.
 *
 * @lore AF3: Do NOT redeclare fields already on KnowledgeItem (scopeId, etc.) —
 * TS2430 fires if an optional override conflicts with a required base property.
 * Only declare NEW fields from knowledgeAppProjection here.
 */
export interface KnowledgeItemWithProjection extends KnowledgeItem {
	confidence?: string | null;
	meta?: string | null;
}

/** One tree child — the shape `KnowledgeDetail`'s "children" list and the tree read need. */
export interface KnowledgeItemChildRef {
	readonly id: string;
	readonly title: string;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function generateId(): string {
	return crypto.randomUUID();
}

function now(): string {
	return new Date().toISOString();
}

interface WriteOptions {
	/** Caller-owned workflow clock; defaults to wall-clock time. */
	readonly timestamp?: string;
}

/**
 * Fetch the app projection row for a knowledge item, or null if not found.
 */
async function getProjectionRow(
	db: HyperIdleDb,
	knowledgeItemId: string,
): Promise<typeof knowledgeAppProjection.$inferSelect | null> {
	const [row] = await db
		.select()
		.from(knowledgeAppProjection)
		.where(eq(knowledgeAppProjection.knowledgeItemId, knowledgeItemId))
		.limit(1);
	return row ?? null;
}

/**
 * Merge canonical item fields with app projection fields.
 */
function mergeWithProjection(
	item: KnowledgeItem,
	projection: typeof knowledgeAppProjection.$inferSelect | null,
): KnowledgeItemWithProjection {
	if (!projection) return item;
	return {
		...item,
		// @lore AU44 batch 4: projection.scopeId is a denormalized copy that may be null
		// (e.g. minimal test fixtures, or items created before the projection column existed).
		// Fall back to the kernel's scopeId so resolveScopeName receives the real value.
		scopeId: projection.scopeId ?? item.scopeId,
		confidence: projection.confidence,
		meta: projection.meta,
	};
}

// ---------------------------------------------------------------------------
// Write operations (K2-writes, kept here for cohesion with the repository)
// ---------------------------------------------------------------------------

export async function create(
	db: HyperIdleDb,
	input: CreateKnowledgeItemInput,
	options: WriteOptions = {},
): Promise<KnowledgeItemWithProjection> {
	const id = generateId();
	const timestamp = options.timestamp ?? now();
	const scopeKind = input.scopeKind ?? "factory";
	const parentKind = input.parentKind ?? null;
	const parentId = input.parentId ?? null;

	return db.transaction(async (tx): Promise<KnowledgeItemWithProjection> => {
		// The tree invariants (cycle, scope-no-wider-than-parent, depth<=32) run
		// inside the same transaction as the write that sets a parent
		// (architecture.md §3). A brand-new id cannot already be an ancestor of
		// anything, so the cycle check is vacuous here — it still matters for
		// depth and scope.
		if (parentKind === "knowledge_item" && parentId) {
			await assertParentInvariants(tx, { newParentId: parentId, childScopeKind: scopeKind });
		}
		const position = await nextPositionForParent(tx, parentKind, parentId);

		await tx.insert(knowledgeItems).values({
			id,
			scopeKind,
			scopeId: input.scopeId ?? null,
			title: input.title,
			body: input.body,
			format: input.format,
			status: input.status,
			// Absent leaves the column default (`ordinary`), which is what every
			// caller predating an authorable role produced.
			...(input.role ? { role: input.role } : {}),
			parentKind,
			parentId,
			position,
			version: 1,
			updatedBy: input.updatedBy,
			createdAt: timestamp,
			updatedAt: timestamp,
		});

		// Insert into app projection table.
		await tx.insert(knowledgeAppProjection).values({
			id: generateId(),
			knowledgeItemId: id,
			scopeId: input.scopeId ?? null,
			meta: input.meta ?? null,
		});

		// Edit log for create
		await tx.insert(knowledgeEditLog).values({
			id: generateId(),
			itemId: id,
			editor: input.updatedBy,
			field: "*",
			oldValue: null,
			newValue: null,
			editType: "create",
			createdAt: timestamp,
		});

		// @lore AU14: no domain event emitted here (deliberately). The route owns the
		// EventBus emit (live subscribers: ws-broadcaster, observability
		// dispatcher); non-HTTP callers (tools/writeback) never emitted on the bus
		// before this WP and continue not to — emitting here would be a NEW event for
		// them, a behavior change the WP forbids.
		const [created] = await tx
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, id))
			.limit(1);
		if (!created) {
			throw new Error(`Failed to read back created knowledge item ${id}`);
		}
		const [projectionRow] = await tx
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, id))
			.limit(1);
		return mergeWithProjection(created, projectionRow ?? null);
	});
}

/**
 * Shared write path for `reparent()` and `graduate()` — re-checks the tree
 * invariants against LIVE state (only when the new parent is a
 * `knowledge_item`; a task/thread/routine/agent parent inherits nothing and
 * is never part of a cycle), computes the append-at-end position under the
 * new parent, and performs the row update.
 *
 * @lore nested-knowledge-items / graduation consolidation: `graduate()` used
 * to duplicate this — its own copy of the update statement never called
 * `assertParentInvariants` or `nextPositionForParent`, so graduating onto a
 * `knowledge_item` parent skipped the cycle/depth/scope checks and left the
 * moved item's `position` stale (whatever it was under its old task/thread
 * parent). Neither gap had a test — graduation's fixtures never build a deep
 * tree or a scope-wider descendant — so this is a latent-bug fix that rides
 * along with the consolidation, not a deliberate behavior change. Optimistic
 * locking (`versionBump`) is optional because `reparent()` itself is
 * version-less (its callers re-read after the fact); `graduate()` supplies
 * it to get the same WHERE-clause race protection `update()` uses.
 */
async function applyParentMove(
	tx: Executor,
	id: string,
	existing: { readonly scopeKind: string },
	target: { readonly parentKind: KnowledgeParentKind | null; readonly parentId: string | null },
	updatedBy: string,
	timestamp: string,
	versionBump?: { readonly expectedVersion: number },
): Promise<{ readonly matched: boolean }> {
	if (target.parentKind === "knowledge_item" && target.parentId) {
		await assertParentInvariants(tx, {
			itemId: id,
			newParentId: target.parentId,
			childScopeKind: existing.scopeKind,
		});
	}

	const position = await nextPositionForParent(tx, target.parentKind, target.parentId);

	const setValues: Record<string, unknown> = {
		parentKind: target.parentKind,
		parentId: target.parentId,
		position,
		updatedBy,
		updatedAt: timestamp,
	};
	if (versionBump) {
		setValues.version = versionBump.expectedVersion + 1;
	}
	const where = versionBump
		? and(eq(knowledgeItems.id, id), eq(knowledgeItems.version, versionBump.expectedVersion))
		: eq(knowledgeItems.id, id);

	const updateRows = await tx
		.update(knowledgeItems)
		.set(setValues)
		.where(where)
		.returning({ id: knowledgeItems.id });
	return { matched: updateRows.length > 0 };
}

/**
 * Change an existing item's parent. A separate entry point from `update()`
 * (architecture.md §3): the tree invariants — no cycle, scope no wider than
 * the new parent's, depth<=32 — must re-read LIVE state inside this write's
 * own transaction, because two reparents that each look legal against the
 * pre-transaction snapshot can together produce a cycle no single read would
 * catch.
 *
 * @lore nested-knowledge-items defect 2: `parentKind`/`parentId` are both
 * nullable — null,null detaches the item to the top level (a root), mirroring
 * `ki_parent_pair_ck`'s both-or-neither pairing. A root has no parent to walk,
 * so the cycle/scope/depth invariants are vacuously satisfied and simply
 * never run for that case, rather than being asked a question that has no
 * answer.
 */
export async function reparent(
	db: HyperIdleDb,
	id: string,
	input: {
		readonly parentKind: KnowledgeParentKind | null;
		readonly parentId: string | null;
		readonly updatedBy: string;
	},
): Promise<KnowledgeItem> {
	return db.transaction(
		async (tx): Promise<KnowledgeItem> => {
			const [existing] = await tx
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, id))
				.limit(1);
			if (!existing) {
				throw new Error(`reparent: knowledge item ${id} not found`);
			}

			const { parentKind, parentId } = input;
			if (
				(parentKind === null || parentId === null) &&
				(parentKind !== null || parentId !== null)
			) {
				throw new Error(
					"reparent: parentKind and parentId must both be null (detach to root) or both be set — never one without the other",
				);
			}

			const timestamp = now();
			await applyParentMove(tx, id, existing, input, input.updatedBy, timestamp);

			await tx.insert(knowledgeEditLog).values({
				id: generateId(),
				itemId: id,
				editor: input.updatedBy,
				field: "parent",
				oldValue: existing.parentId ? `${existing.parentKind}:${existing.parentId}` : null,
				newValue: parentId ? `${parentKind}:${parentId}` : null,
				editType: "update",
				createdAt: timestamp,
			});

			const [updated] = await tx
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, id))
				.limit(1);
			if (!updated) throw new Error(`reparent: failed to read back knowledge item ${id}`);
			return updated;
		},
		{ isolationLevel: "serializable" },
	);
}

/**
 * Allow-list of caller-mutable fields for the kernel table.
 * @lore O2: projection fields (layer, scopeId, kind, attentionScore, confidence, meta)
 * are removed from canonical EDITABLE_FIELDS and written to the extension table instead.
 *
 * @lore knowledge-attachment-slot: `role` is NOT here — it used to ride the
 * ordinary editable set (BA9e, so a change was versioned and edit-logged like
 * any other field), but that opened two defects the architecture critique
 * found: a person could change a routine prompt's role away from `prompt`
 * (the routine then silently runs on its name), or promote an ordinary note
 * into a stray `prompt`. Role is now create-only — every creator writes it
 * through its own list (routines, agents, the skills-and-rules settings
 * surface) and no later edit can change it. `z.object` strips the `role` key
 * from a PATCH body before it ever reaches this function.
 */
const KERNEL_EDITABLE_FIELDS = [
	"title",
	"body",
	"format",
	"status",
	"scopeKind",
	"scopeId",
	"updatedBy",
] as const;

// `scopeId` is deliberately NOT here. It lives on the kernel row and is mirrored
// onto the projection after the kernel write, so the two cannot disagree. Listing
// it here made the generic update write the projection while the (now deleted)
// `/scope` route wrote the kernel — two writers, two tables, free to diverge.
const PROJECTION_EDITABLE_FIELDS = ["meta"] as const;

interface DiffResult {
	readonly kernelChanges: Record<string, unknown>;
	readonly projectionChanges: Record<string, unknown>;
	readonly editLogEntries: ReadonlyArray<typeof knowledgeEditLog.$inferInsert>;
}

/** Build the safe-changes payload + per-field edit-log rows. */
function buildDiff(
	itemId: string,
	existing: KnowledgeItemWithProjection,
	changes: UpdateKnowledgeItemInput,
	timestamp: string,
): DiffResult {
	const editLogEntries: Array<typeof knowledgeEditLog.$inferInsert> = [];
	const kernelChanges: Record<string, unknown> = {};
	const projectionChanges: Record<string, unknown> = {};

	for (const field of KERNEL_EDITABLE_FIELDS) {
		if (!(field in changes) || changes[field] === undefined) continue;
		const oldVal = existing[field];
		const newVal = changes[field];
		kernelChanges[field] = newVal;
		if (oldVal === newVal) continue;
		editLogEntries.push({
			id: generateId(),
			itemId,
			editor: changes.updatedBy ?? existing.updatedBy,
			field,
			oldValue: oldVal == null ? null : String(oldVal),
			newValue: newVal == null ? null : String(newVal),
			editType: "update",
			createdAt: timestamp,
		});
	}

	for (const field of PROJECTION_EDITABLE_FIELDS) {
		if (!(field in changes) || changes[field] === undefined) continue;
		const oldVal = existing[field];
		const newVal = changes[field];
		projectionChanges[field] = newVal;
		if (oldVal === newVal) continue;
		editLogEntries.push({
			id: generateId(),
			itemId,
			editor: changes.updatedBy ?? existing.updatedBy,
			field,
			oldValue: oldVal == null ? null : String(oldVal),
			newValue: newVal == null ? null : String(newVal),
			editType: "update",
			createdAt: timestamp,
		});
	}

	return { kernelChanges, projectionChanges, editLogEntries };
}

export async function update(
	db: HyperIdleDb,
	id: string,
	changes: UpdateKnowledgeItemInput,
	expectedVersion: number,
	options: WriteOptions = {},
): Promise<KnowledgeItemWithProjection> {
	// @lore N1/O2: PGlite uses async transactions. The transaction callback must
	// be async. All inner DB calls are awaited.
	const result = await db.transaction(
		async (tx): Promise<{ updated: KnowledgeItemWithProjection; newVersion: number }> => {
			const [existing] = await tx
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, id))
				.limit(1);

			if (!existing) {
				throw new Error(`Knowledge item ${id} not found`);
			}
			if (existing.version !== expectedVersion) {
				throw new VersionConflictError(id, existing.version);
			}

			const [projectionRow] = await tx
				.select()
				.from(knowledgeAppProjection)
				.where(eq(knowledgeAppProjection.knowledgeItemId, id))
				.limit(1);
			const existingWithProjection = mergeWithProjection(existing, projectionRow ?? null);

			const timestamp = options.timestamp ?? now();
			const newVersion = existing.version + 1;
			const { kernelChanges, projectionChanges, editLogEntries } = buildDiff(
				id,
				existingWithProjection,
				changes,
				timestamp,
			);

			// Mirror the kernel's scopeId onto the projection in the same
			// transaction, so the two columns `list()` ORs together cannot drift.
			// `kernelChanges` is an untyped diff bag, so the two scope fields are
			// narrowed here rather than asserted at each use.
			const nextScopeId = kernelChanges.scopeId as string | null | undefined;
			const nextScopeKind = kernelChanges.scopeKind as string | undefined;
			const mirroredProjectionChanges = {
				...projectionChanges,
				...("scopeId" in kernelChanges ? { scopeId: nextScopeId ?? null } : {}),
			};

			const updateRows = await tx
				.update(knowledgeItems)
				.set({
					...kernelChanges,
					version: newVersion,
					updatedAt: timestamp,
				})
				.where(and(eq(knowledgeItems.id, id), eq(knowledgeItems.version, expectedVersion)))
				.returning({ id: knowledgeItems.id });

			if (updateRows.length === 0) {
				const [current] = await tx
					.select()
					.from(knowledgeItems)
					.where(eq(knowledgeItems.id, id))
					.limit(1);
				if (!current) throw new ItemDeletedError(id);
				throw new VersionConflictError(id, current.version);
			}

			// D5 — narrowing an item's scope cascades to its subtree, inside this
			// same transaction (architecture.md §3, critique blocker #7: the
			// invariant is otherwise only guarded on the CHILD's own write).
			if (nextScopeKind) {
				await cascadeScopeNarrowing(tx, id, nextScopeKind);
			}

			// Update extension table if there are projection changes.
			if (Object.keys(mirroredProjectionChanges).length > 0) {
				const [existingProjection] = await tx
					.select({ id: knowledgeAppProjection.id })
					.from(knowledgeAppProjection)
					.where(eq(knowledgeAppProjection.knowledgeItemId, id))
					.limit(1);
				if (existingProjection) {
					await tx
						.update(knowledgeAppProjection)
						.set(mirroredProjectionChanges)
						.where(eq(knowledgeAppProjection.knowledgeItemId, id));
				} else {
					// Create extension row if it doesn't exist
					await tx.insert(knowledgeAppProjection).values({
						id: generateId(),
						knowledgeItemId: id,
						...mirroredProjectionChanges,
					});
				}
			}

			// Insert edit log entries
			for (const entry of editLogEntries) {
				await tx.insert(knowledgeEditLog).values(entry);
			}

			const [updated] = await tx
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, id))
				.limit(1);
			if (!updated) {
				throw new Error(`Failed to read back updated knowledge item ${id}`);
			}
			const [updatedProjection] = await tx
				.select()
				.from(knowledgeAppProjection)
				.where(eq(knowledgeAppProjection.knowledgeItemId, id))
				.limit(1);
			return { updated: mergeWithProjection(updated, updatedProjection ?? null), newVersion };
		},
	);

	// @lore AU14: no domain event emitted here (deliberately) — see create() above.
	return result.updated;
}

// ---------------------------------------------------------------------------
// Graduate — narrow transition that moves a produced item into the tree.
// ---------------------------------------------------------------------------

/**
 * @lore graduation: graduation is a one-way, narrow transition — not a generic
 * parent edit. Role must be `ordinary` (skills/rules/prompts/agent_files are
 * immovably pinned to their creator). The current parent must be `task` or
 * `thread` (that is what "produced item" means). Reopening the parent field on
 * the ordinary PATCH path would let a person repoint a routine prompt or an
 * agent identity — this path avoids that by checking role before acting.
 *
 * The edit-log entry for parentId carries oldValue = original task/thread id.
 * That is the only surviving record of provenance once the parent is cleared —
 * `producingTaskId` does not exist as a column; this entry IS the provenance.
 */

export class GraduationNotAllowedError extends Error {
	constructor(public readonly reason: string) {
		super(reason);
		this.name = "GraduationNotAllowedError";
	}
}

export interface GraduateInput {
	/** The target parent. `null` means top of tree (no parent). */
	readonly newParentKind: "knowledge_item" | null;
	readonly newParentId: string | null;
	readonly updatedBy: string;
}

export async function graduate(
	db: HyperIdleDb,
	id: string,
	input: GraduateInput,
	expectedVersion: number,
	options: WriteOptions = {},
): Promise<KnowledgeItemWithProjection> {
	const result = await db.transaction(
		async (tx): Promise<{ updated: KnowledgeItemWithProjection }> => {
			const [existing] = await tx
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, id))
				.limit(1);

			if (!existing) {
				throw new Error(`Knowledge item ${id} not found`);
			}
			if (existing.version !== expectedVersion) {
				throw new VersionConflictError(id, existing.version);
			}

			// Role guard: only ordinary items can graduate.
			if (existing.role !== "ordinary") {
				throw new GraduationNotAllowedError(
					`Only items with role 'ordinary' can graduate; this item has role '${existing.role}'`,
				);
			}

			// Parent guard: only task- or thread-parented items are "produced items".
			if (existing.parentKind !== "task" && existing.parentKind !== "thread") {
				throw new GraduationNotAllowedError(
					`Item must have parentKind 'task' or 'thread' to graduate; current parentKind is '${existing.parentKind ?? "null"}'`,
				);
			}

			// Self-reparent guard.
			if (input.newParentId !== null && input.newParentId === id) {
				throw new GraduationNotAllowedError(`Item cannot graduate onto itself`);
			}

			const timestamp = options.timestamp ?? now();

			// Write the move (tree invariants + position, shared with reparent())
			// with the optimistic-lock WHERE clause `applyParentMove` adds when
			// given `versionBump`.
			const { matched } = await applyParentMove(
				tx,
				id,
				existing,
				{ parentKind: input.newParentKind, parentId: input.newParentId },
				input.updatedBy,
				timestamp,
				{ expectedVersion },
			);

			if (!matched) {
				// Lost a TOCTOU race — re-read and throw the conflict.
				const [current] = await tx
					.select({ version: knowledgeItems.version })
					.from(knowledgeItems)
					.where(eq(knowledgeItems.id, id))
					.limit(1);
				throw new VersionConflictError(id, current?.version ?? expectedVersion);
			}

			// Edit-log entries for parentKind and parentId, following buildDiff's shape.
			const editBase = {
				editor: input.updatedBy,
				editType: "graduate" as const,
				createdAt: timestamp,
			};

			await tx.insert(knowledgeEditLog).values([
				{
					id: generateId(),
					itemId: id,
					field: "parentKind",
					oldValue: existing.parentKind,
					newValue: input.newParentKind,
					...editBase,
				},
				{
					id: generateId(),
					itemId: id,
					field: "parentId",
					oldValue: existing.parentId,
					newValue: input.newParentId,
					...editBase,
				},
			]);

			const [updated] = await tx
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, id))
				.limit(1);
			if (!updated) {
				throw new Error(`Failed to read back graduated knowledge item ${id}`);
			}
			const [updatedProjection] = await tx
				.select()
				.from(knowledgeAppProjection)
				.where(eq(knowledgeAppProjection.knowledgeItemId, id))
				.limit(1);

			return { updated: mergeWithProjection(updated, updatedProjection ?? null) };
		},
	);

	return result.updated;
}

// ---------------------------------------------------------------------------
// READ operations — K1-reads: get / list / count / search
// ---------------------------------------------------------------------------

/**
 * Internal base list query: filter by kernel + projection fields.
 * Called by the overloaded list() for the default base ListFilters case.
 */
/**
 * @lore BA9b-listBase: the editorial callers of `list()` — the knowledge view —
 * pass no `role` and keep seeing every role, exactly as before. What changed
 * is that session assembly, which is NOT
 * editorial, now says which role it wants: `fetchAllForLayer` in
 * session-knowledge-assembler.ts passes `role: "ordinary"` so a routine prompt
 * (or any other non-ordinary role) reaching a session by the layer path is
 * excluded at the query, not filtered after the fact — `list()` is paginated,
 * and a post-filter would silently shorten pages. Capability items (role !=
 * 'ordinary') still take the separate `fetchCapabilityItems` path, which uses
 * its own scope+role predicate rather than going through listBase; the two
 * query paths do not drift because they serve different callers — one is
 * editorial, the other is session-time materialisation.
 */
async function listBase(
	db: HyperIdleDb,
	filters: ListFilters = {},
): Promise<KnowledgeItemWithProjection[]> {
	const hasProjectionFilter = filters.scopeId !== undefined;

	const limit = filters.limit ?? 50;
	const offset = filters.offset ?? 0;

	if (!hasProjectionFilter) {
		const rows = await db
			.select()
			.from(knowledgeItems)
			.where(filters.role !== undefined ? eq(knowledgeItems.role, filters.role) : undefined)
			.orderBy(knowledgeItems.id)
			.limit(limit)
			.offset(offset);

		const result: KnowledgeItemWithProjection[] = [];
		for (const item of rows) {
			const projection = await getProjectionRow(db, item.id);
			result.push(mergeWithProjection(item, projection));
		}
		return result;
	}

	// Projection filters: JOIN with extension table.
	// @lore O2: projection filter queries must JOIN with knowledgeAppProjection.
	const conditions: SQL[] = [];

	if (filters.scopeId !== undefined) {
		const scopeCondition =
			filters.scopeId === null
				? and(isNull(knowledgeItems.scopeId), isNull(knowledgeAppProjection.scopeId))
				: or(
						eq(knowledgeItems.scopeId, filters.scopeId),
						eq(knowledgeAppProjection.scopeId, filters.scopeId),
					);
		if (scopeCondition) conditions.push(scopeCondition);
	}
	if (filters.role !== undefined) {
		conditions.push(eq(knowledgeItems.role, filters.role));
	}
	const rows = await db
		.select({ item: knowledgeItems, projection: knowledgeAppProjection })
		.from(knowledgeItems)
		.innerJoin(
			knowledgeAppProjection,
			eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
		)
		.where(and(...conditions))
		.orderBy(knowledgeItems.id)
		.limit(limit)
		.offset(offset);

	return rows.map(({ item, projection }) => mergeWithProjection(item, projection));
}

/**
 * Fetch a knowledge item by id with a discriminated view selection.
 *
 * - `{view: 'detail'}` → kernel row LEFT JOINed with projection (kind/layer/confidence/scores)
 * - default / `{view: 'summary'}` → raw kernel row (KnowledgeItem)
 *
 * @lore Ag7b: Collapses findById / findDetailById / findKnowledgeItemProjectionById
 * into one entry point with a discriminated return type so callers get the precise
 * shape they need without widening to a common any-bag.
 *
 * @lore AU20 K1-reads: the three delegate functions (findById, findDetailById,
 * findKnowledgeItemProjectionById) are deleted — logic is inlined into each case.
 */
/**
 * What a viewer may see: everything except another person's private notes.
 *
 * `scope_kind='user'` says the document belongs to the subject in `scope_id`.
 * That is two different things depending on the document's ROLE. An `ordinary`
 * user-scoped document is a person's private note. A capability document —
 * `agent_file`, `skill`, `rule` — with the same scope is a BINDING: it says
 * which agent this identity, skill or rule applies to. A binding is ordinary
 * team knowledge that happens to name its agent, not a secret.
 *
 * @lore BA9f: an agent's identity became a `scope_kind='user'` document bound to
 * the agent. Spelled as "user scope is private, full stop", every one of those
 * was invisible to everyone — including through the single knowledge edit
 * endpoint that is now the only place to edit them. Proven by driving the live
 * API: `GET /api/knowledge/ki_af_demo-agent-pm` answered 404 for a document
 * sitting in the table.
 *
 * The rule stays inside knowledge's own vocabulary on purpose: telling an agent
 * from a person means reading `users`, and that table belongs to another
 * service.
 */
function visibleToViewer(viewerUserId: string): SQL | undefined {
	return or(
		ne(knowledgeItems.scopeKind, "user"),
		ne(knowledgeItems.role, "ordinary"),
		eq(knowledgeItems.updatedBy, viewerUserId),
	);
}

/**
 * @lore nested-knowledge-items §4: replaces the old client-side
 * `role !== "skill" && role !== "rule"` filter (`KnowledgeList.tsx:858`).
 * Every `role='ordinary'` row now lives in the tree (parented under one of
 * the three roots or a descendant of one). A row whose parent is set but is
 * NOT `knowledge_item` (agent/task/thread/routine) is a role-carrying item
 * (skill/rule/agent_file/prompt) — excluding it structurally removes the
 * whole role-carrying population from general browsing without naming any
 * role, so a future role added to that set is excluded automatically too.
 */
function parentIsKnowledgeItemOrRoot(): SQL | undefined {
	return or(isNull(knowledgeItems.parentKind), eq(knowledgeItems.parentKind, "knowledge_item"));
}

export function get(
	db: HyperIdleDb,
	id: string,
	opts: { view: "full" },
): Promise<KnowledgeItemWithProjection | null>;
export function get(
	db: HyperIdleDb,
	id: string,
	opts?: { view?: "summary" },
): Promise<KnowledgeItem | null>;

export async function get(
	db: HyperIdleDb,
	id: string,
	opts?: { view?: KnowledgeItemView },
): Promise<KnowledgeItem | null> {
	switch (opts?.view) {
		case "full": {
			const [item] = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, id))
				.limit(1);
			if (!item) return null;
			return mergeWithProjection(item, await getProjectionRow(db, id));
		}
		default: {
			// Inlined from former findById — summary view: raw kernel row.
			const [row] = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, id))
				.limit(1);
			return row ?? null;
		}
	}
}

/**
 * One ancestor in a knowledge item's parent chain, as `BakedContextKnowledgeItem`
 * needs it: enough to materialise the ancestor's own directory + manifest
 * entry without a second DB read at write time (architecture.md §5 —
 * `writeContextBundle` does zero DB reads).
 */
export interface KnowledgeParentChainAncestor {
	readonly id: string;
	readonly title: string;
	readonly scopeKind: string;
	readonly version: number;
}

/**
 * Walk a knowledge item's ancestors, root first, stopping at the first
 * non-`knowledge_item` parent (architecture.md §3: "walks stop at the first
 * non-knowledge_item parent") or at the depth-32 backstop. Called once per
 * ordinary item at bake time (session-knowledge-assembler.ts) — this is the
 * only place `BakedContextKnowledgeItem.parentChain` can be populated,
 * since the sandbox write path itself does no DB reads (review.md B4).
 */
export async function resolveParentChain(
	db: HyperIdleDb,
	itemId: string,
): Promise<readonly KnowledgeParentChainAncestor[]> {
	const chain: KnowledgeParentChainAncestor[] = [];
	let cursorId: string = itemId;
	for (let depth = 0; depth < 32; depth++) {
		const [row] = await db
			.select({ parentKind: knowledgeItems.parentKind, parentId: knowledgeItems.parentId })
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, cursorId))
			.limit(1);
		if (row?.parentKind !== "knowledge_item" || !row.parentId) break;

		const [ancestor] = await db
			.select({
				id: knowledgeItems.id,
				title: knowledgeItems.title,
				scopeKind: knowledgeItems.scopeKind,
				version: knowledgeItems.version,
			})
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, row.parentId))
			.limit(1);
		if (!ancestor) break;

		chain.unshift(ancestor);
		cursorId = ancestor.id;
	}
	return chain;
}

/** Rank order for scope visibility — a viewer sees factory + their own team + their own. */
function scopeVisibleCondition(viewerTeamId: string | null): SQL | undefined {
	// architecture.md §4 D2: a team-scoped branch is invisible outside that
	// team. `scope` is a readability filter, not access control — nothing
	// here joins `users`; the viewer's team is a caller-supplied parameter.
	return viewerTeamId
		? or(ne(knowledgeItems.scopeKind, "team"), eq(knowledgeItems.scopeId, viewerTeamId))
		: ne(knowledgeItems.scopeKind, "team");
}

/**
 * Combines the two independent visibility predicates a human read must
 * satisfy: Q2 (a `user`-scoped row is private to its author) AND D2 (a
 * `team`-scoped row is invisible outside that team). Neither alone is a
 * complete visibility check — review.md B3.
 */
function humanVisibleCondition(viewerUserId: string, viewerTeamId: string | null): SQL | undefined {
	return and(visibleToViewer(viewerUserId), scopeVisibleCondition(viewerTeamId));
}

/**
 * List knowledge items with a discriminated filter.
 *
 * Discriminated variants (first matching wins):
 * - `{titlesByIds}` → batched title lookup
 * - `{tree}` → roots + ordinary tree nodes, excluding any row whose parent is
 *   not a knowledge item (architecture §4) — a `user`-scoped row stays
 *   private to its author (Q2) AND a `team`-scoped branch is invisible
 *   outside that team (D2). This is the one read GET /api/knowledge uses;
 *   there is no separate "all items" variant with a weaker filter.
 * - `{childrenOf}` → this item's own ordered children, same combined
 *   visibility filter as `{tree}` (review.md B3 — a non-member must not see
 *   a team-scoped or private child's title through the parent's page)
 * - `{childrenAndSiblings}` → the Backlinks card: this item's children union
 *   its siblings (architecture §4 — replaces the deleted topic-match query)
 * - base `ListFilters` → projection-joined filtered list
 *
 * @lore Ag7b: Each variant has a unique required discriminant property so TypeScript
 * overload resolution picks the precise return type at the call site — no widened any-bags.
 *
 * @lore AU20 K1-reads: all nine specialized list helper functions are deleted from
 * source; their logic is inlined into the switch dispatch below.
 */
export function list(
	db: HyperIdleDb,
	filter: { readonly titlesByIds: readonly string[] },
): Promise<Array<{ id: string; title: string }>>;
export function list(
	db: HyperIdleDb,
	filter: {
		readonly tree: { readonly viewerUserId: string; readonly viewerTeamId: string | null };
	},
): Promise<KnowledgeItemWithProjection[]>;
export function list(
	db: HyperIdleDb,
	filter: {
		readonly childrenAndSiblings: {
			readonly itemId: string;
			readonly viewerUserId: string;
			readonly viewerTeamId: string | null;
			readonly limit: number;
		};
	},
): Promise<Array<{ id: string; title: string }>>;
export function list(
	db: HyperIdleDb,
	filter: { readonly byParent: { readonly parentKind: string; readonly parentId: string } },
): Promise<KnowledgeItemWithProjection[]>;
export function list(
	db: HyperIdleDb,
	filter: {
		readonly childrenOf: {
			readonly parentId: string;
			readonly viewerUserId: string;
			readonly viewerTeamId: string | null;
		};
	},
): Promise<KnowledgeItemChildRef[]>;
export function list(db: HyperIdleDb, filter?: ListFilters): Promise<KnowledgeItemWithProjection[]>;
export async function list(
	db: HyperIdleDb,
	filter?:
		| { readonly titlesByIds: readonly string[] }
		| {
				readonly tree: { readonly viewerUserId: string; readonly viewerTeamId: string | null };
		  }
		| {
				readonly childrenOf: {
					readonly parentId: string;
					readonly viewerUserId: string;
					readonly viewerTeamId: string | null;
				};
		  }
		| {
				readonly childrenAndSiblings: {
					readonly itemId: string;
					readonly viewerUserId: string;
					readonly viewerTeamId: string | null;
					readonly limit: number;
				};
		  }
		| { readonly byParent: { readonly parentKind: string; readonly parentId: string } }
		| ListFilters,
): Promise<
	| KnowledgeItemWithProjection[]
	| null
	| readonly { id: string; title: string }[]
	| KnowledgeItemChildRef[]
> {
	if (!filter) return listBase(db);

	if ("childrenOf" in filter) {
		const { parentId, viewerUserId, viewerTeamId } = filter.childrenOf;
		return db
			.select({ id: knowledgeItems.id, title: knowledgeItems.title })
			.from(knowledgeItems)
			.where(
				and(
					eq(knowledgeItems.parentKind, "knowledge_item"),
					eq(knowledgeItems.parentId, parentId),
					humanVisibleCondition(viewerUserId, viewerTeamId),
				),
			)
			.orderBy(knowledgeItems.position, knowledgeItems.title);
	}

	if ("byParent" in filter) {
		// Return all items whose parent matches exactly. No scope/visibility filter —
		// access to the parent implies access to its produced items.
		const { parentKind, parentId } = filter.byParent;
		const rows = await db
			.select({ item: knowledgeItems, projection: knowledgeAppProjection })
			.from(knowledgeItems)
			.leftJoin(
				knowledgeAppProjection,
				eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
			)
			.where(
				and(
					eq(knowledgeItems.parentKind, parentKind as KnowledgeParentKind),
					eq(knowledgeItems.parentId, parentId),
				),
			);
		return rows.map(({ item, projection }) => mergeWithProjection(item, projection));
	}

	if ("titlesByIds" in filter) {
		// Inlined from former listTitlesByIds.
		const ids = filter.titlesByIds;
		if (ids.length === 0) return [];
		return db
			.select({ id: knowledgeItems.id, title: knowledgeItems.title })
			.from(knowledgeItems)
			.where(inArray(knowledgeItems.id, ids as string[]));
	}

	if ("tree" in filter) {
		const { viewerUserId, viewerTeamId } = filter.tree;
		const rows = await db
			.select({ item: knowledgeItems, projection: knowledgeAppProjection })
			.from(knowledgeItems)
			.leftJoin(
				knowledgeAppProjection,
				eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
			)
			.where(and(parentIsKnowledgeItemOrRoot(), humanVisibleCondition(viewerUserId, viewerTeamId)))
			.orderBy(knowledgeItems.position, knowledgeItems.title);
		return rows.map(({ item, projection }) => mergeWithProjection(item, projection));
	}

	if ("childrenAndSiblings" in filter) {
		const { itemId, viewerUserId, viewerTeamId, limit } = filter.childrenAndSiblings;
		const [subject] = await db
			.select({ parentKind: knowledgeItems.parentKind, parentId: knowledgeItems.parentId })
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, itemId))
			.limit(1);
		if (!subject) return [];

		const siblingCondition =
			subject.parentKind === null || subject.parentId === null
				? and(isNull(knowledgeItems.parentKind), isNull(knowledgeItems.parentId))
				: and(
						eq(knowledgeItems.parentKind, subject.parentKind),
						eq(knowledgeItems.parentId, subject.parentId),
					);
		const childCondition = and(
			eq(knowledgeItems.parentKind, "knowledge_item"),
			eq(knowledgeItems.parentId, itemId),
		);

		return db
			.select({ id: knowledgeItems.id, title: knowledgeItems.title })
			.from(knowledgeItems)
			.where(
				and(
					or(siblingCondition, childCondition),
					ne(knowledgeItems.id, itemId),
					// review.md B1: this card applied only the Q2 private-user half of
					// the combined visibility rule — a viewer outside the item's team
					// still read every team-scoped sibling's title. `childrenOf` (the
					// Children card right above it) already uses the combined rule;
					// this is the same fix applied to the same query shape.
					humanVisibleCondition(viewerUserId, viewerTeamId),
				),
			)
			.orderBy(knowledgeItems.position, knowledgeItems.title)
			.limit(limit);
	}

	// Base ListFilters case
	return listBase(db, filter);
}

/**
 * Count knowledge items for a given filter.
 *
 * - `{triageVisible: viewerUserId}` → count of draft + needs_human items visible to viewer (Q2)
 *
 * @lore AU20 K1-reads: subsumes former countTriageVisible — deleted from source.
 *
 * @lore knowledge-attachment-slot §8: `role = 'ordinary'` closes a badge bug
 * the two client-side nav filters (KnowledgeList, the sidebar fast-nav)
 * cannot reach — a draft skill or rule would otherwise inflate this count
 * while appearing in neither knowledge surface, which reads as a bug with no
 * way to clear it. Filtering server-side is right here (one consumer, the
 * badge) and wrong for the list payload (two consumers that want opposite
 * halves of it — see `KnowledgeList.tsx`'s own `@lore`).
 */
export async function count(
	db: HyperIdleDb,
	filter: { readonly triageVisible: string },
): Promise<number> {
	// Only triageVisible variant for now — add discriminants as consumers emerge.
	const viewerUserId = filter.triageVisible;
	const [result] = await db
		.select({ count: sql<number>`count(*)` })
		.from(knowledgeItems)
		.where(
			and(
				eq(knowledgeItems.status, "proposed"),
				eq(knowledgeItems.role, "ordinary"),
				visibleToViewer(viewerUserId),
			),
		);
	return Number(result?.count ?? 0);
}

/**
 * Text search across knowledge items (ILIKE on title/body/topic).
 *
 * - `{visibility: viewerUserId}` — restrict to Q2 auth boundary (scope_kind != 'user' OR updatedBy = userId)
 *
 * @lore AU20 K1-reads: subsumes former searchByText (LIKE, all items) and
 * searchVisibleByText (ILIKE + Q2 filter) — both deleted from source.
 * Text mode uses ILIKE (case-insensitive) rather than searchByText's LIKE;
 * the behavioral difference is an intentional improvement (better UX).
 */
interface SearchOptions {
	limit?: number;
	offset?: number;
	/** @deprecated use text search — mode field ignored, always text */
	mode?: "fts" | "text";
	/** If provided, restrict to items visible to this userId (Q2 auth boundary). */
	visibility?: string;
}

export type { SearchOptions };

export async function search(
	db: HyperIdleDb,
	query: string,
	options: SearchOptions = {},
): Promise<KnowledgeItemWithProjection[]> {
	const { visibility, limit = 50, offset = 0 } = options;

	// ILIKE-based text search across title and body.
	// @lore AU44: the mode branch died with the FTS path (every production caller passed
	// "text"); the LIKE escape is inlined here because query-escaping was dissolved.
	const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;

	const authFilter = visibility != null ? visibleToViewer(visibility) : undefined;

	const textFilter = or(
		sql`${knowledgeItems.title} ILIKE ${pattern} ESCAPE '\\'`,
		sql`${knowledgeItems.body} ILIKE ${pattern} ESCAPE '\\'`,
	);

	const whereClause = authFilter != null ? and(authFilter, textFilter) : textFilter;

	const rows = await db
		.select({
			item: knowledgeItems,
			projection: knowledgeAppProjection,
		})
		.from(knowledgeItems)
		.leftJoin(knowledgeAppProjection, eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id))
		.where(whereClause)
		.orderBy(desc(knowledgeItems.updatedAt), knowledgeItems.id)
		.limit(limit)
		.offset(offset);

	return rows.map(({ item, projection }) => mergeWithProjection(item, projection));
}

// ---------------------------------------------------------------------------
// Write operations continued (scope / archive)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// transition — unified lifecycle write (replaces flagItem/mergeItems/
// splitItem/promoteKnowledgeItem)
//
// Scope is NOT a transition: it is a field on the document, edited through
// `update()` with everything else.
//
// @lore AU20 K2-writes: the five per-operation write functions are collapsed
// into one discriminated entry point. Each 'target' maps exactly to one old
// function; behavior is byte-identical.
// ---------------------------------------------------------------------------

/**
 * Result of a transition('promote') call. Structurally equivalent to the
 * former `PromoteKnowledgeItemResult` (promotion-pipeline.ts, now deleted).
 *
 * @lore document-module B0c: the `CONFLICT_OPEN` code and its gate are
 * DELETED — a document has no conflict object (founder ruling). Promotion
 * to active is blocked only by a concurrent status change now.
 */
export type PromoteTransitionResult =
	| { readonly ok: true; readonly fromStatus: string }
	| {
			readonly ok: false;
			readonly code: "CONCURRENT_MODIFICATION";
			readonly message: string;
	  };

// Overload signatures — callers get precise return types for each target.
export function transition(
	db: HyperIdleDb,
	id: string,
	ctx: {
		readonly target: "promote";
		readonly fromStatus: string;
		readonly toStatus: string;
		readonly reason?: string;
		readonly editor: string;
	},
): Promise<PromoteTransitionResult>;
export function transition(
	db: HyperIdleDb,
	id: string,
	ctx: { readonly target: "merge"; readonly sourceId: string; readonly updatedBy: string },
): Promise<KnowledgeItem>;
export function transition(
	db: HyperIdleDb,
	id: string,
	ctx: {
		readonly target: "split";
		readonly newItems: ReadonlyArray<{
			readonly title: string;
			readonly body: string;
		}>;
		readonly updatedBy: string;
	},
): Promise<KnowledgeItem[]>;
// Implementation
export async function transition(
	db: HyperIdleDb,
	id: string,
	ctx:
		| {
				readonly target: "promote";
				readonly fromStatus: string;
				readonly toStatus: string;
				readonly reason?: string;
				readonly editor: string;
		  }
		| { readonly target: "merge"; readonly sourceId: string; readonly updatedBy: string }
		| {
				readonly target: "split";
				readonly newItems: ReadonlyArray<{
					readonly title: string;
					readonly body: string;
				}>;
				readonly updatedBy: string;
		  },
): Promise<PromoteTransitionResult | KnowledgeItem | KnowledgeItem[]> {
	switch (ctx.target) {
		case "promote": {
			const { fromStatus, toStatus, reason, editor } = ctx;
			const isoNow = new Date().toISOString();

			return db.transaction(async (tx): Promise<PromoteTransitionResult> => {
				const updated = await tx
					.update(knowledgeItems)
					.set({ status: toStatus, updatedAt: isoNow, updatedBy: editor })
					.where(and(eq(knowledgeItems.id, id), eq(knowledgeItems.status, fromStatus)))
					.returning({ id: knowledgeItems.id });

				if (updated.length === 0) {
					return {
						ok: false,
						code: "CONCURRENT_MODIFICATION",
						message: `knowledge item ${id} no longer in status ${fromStatus}`,
					};
				}

				const newValue = reason ? `${toStatus} | reason: ${reason}` : toStatus;
				await tx.insert(knowledgeEditLog).values({
					id: generateId(),
					itemId: id,
					editor,
					field: "status",
					oldValue: fromStatus,
					newValue,
					editType: "refinement",
					createdAt: isoNow,
				});

				return { ok: true, fromStatus };
			});
		}

		case "merge": {
			const { sourceId, updatedBy } = ctx;
			const timestamp = now();

			const target = await getItemForTransition(db, id);
			const source = await getItemForTransition(db, sourceId);

			if (!target) throw new Error(`transition('merge'): target item ${id} not found`);
			if (!source) throw new Error(`transition('merge'): source item ${sourceId} not found`);

			const mergedBody = `${target.body}\n\n---\n\n${source.body}`;

			await db
				.update(knowledgeItems)
				.set({ body: mergedBody, version: target.version + 1, updatedBy, updatedAt: timestamp })
				.where(eq(knowledgeItems.id, id));

			await db
				.update(knowledgeItems)
				.set({ status: "archived", updatedBy, updatedAt: timestamp })
				.where(eq(knowledgeItems.id, sourceId));

			await db.insert(knowledgeEditLog).values({
				id: generateId(),
				itemId: id,
				editor: updatedBy,
				field: "body",
				oldValue: target.body,
				newValue: mergedBody,
				editType: "merge",
				createdAt: timestamp,
			});

			await db.insert(knowledgeEditLog).values({
				id: generateId(),
				itemId: sourceId,
				editor: updatedBy,
				field: "status",
				oldValue: source.status,
				newValue: "archived",
				editType: "merge",
				createdAt: timestamp,
			});

			const [merged] = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, id))
				.limit(1);
			if (!merged) throw new Error(`Failed to read back knowledge item ${id} after merge`);
			return merged;
		}

		case "split": {
			const { newItems, updatedBy } = ctx;
			const timestamp = now();

			const original = await getItemForTransition(db, id);
			if (!original) throw new Error(`transition('split'): item ${id} not found`);

			const created: KnowledgeItem[] = [];

			for (const newItem of newItems) {
				const newId = generateId();
				const position = await nextPositionForParent(db, original.parentKind, original.parentId);
				await db.insert(knowledgeItems).values({
					id: newId,
					scopeKind: original.scopeKind,
					scopeId: original.scopeId,
					title: newItem.title,
					body: newItem.body,
					format: original.format,
					status: "proposed",
					version: 1,
					// A split item is a sibling of the original — it inherits the same
					// parent, the same as any other newly created child would.
					parentKind: original.parentKind,
					parentId: original.parentId,
					position,
					updatedBy,
					createdAt: timestamp,
					updatedAt: timestamp,
				});

				await db.insert(knowledgeAppProjection).values({
					id: generateId(),
					knowledgeItemId: newId,
					scopeId: original.scopeId,
				});

				const [row] = await db
					.select()
					.from(knowledgeItems)
					.where(eq(knowledgeItems.id, newId))
					.limit(1);
				if (!row) throw new Error(`Failed to read back split item ${newId}`);
				created.push(row);
			}

			await db
				.update(knowledgeItems)
				.set({ status: "archived", updatedBy, updatedAt: timestamp })
				.where(eq(knowledgeItems.id, id));

			await db.insert(knowledgeEditLog).values({
				id: generateId(),
				itemId: id,
				editor: updatedBy,
				field: "status",
				oldValue: original.status,
				newValue: "archived",
				editType: "split",
				createdAt: timestamp,
			});

			return created;
		}
	}
}

/** Internal helper — fetch a bare kernel row for transition operations. */
async function getItemForTransition(db: HyperIdleDb, id: string): Promise<KnowledgeItem | null> {
	const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).limit(1);
	return row ?? null;
}

// ---------------------------------------------------------------------------
// remove — soft archive (kept as one of the 6 floor CRUD methods)
//
// @lore AU20 Ag7c: renamed from `archiveItem` to `remove`; behavior unchanged.
// ---------------------------------------------------------------------------

/**
 * `POST /:id/archive` — soft-delete: status→archived, NO version bump.
 *
 * @lore AU20 Ag7c: renamed from `archiveItem` to `remove` — archive-with-log
 * path folds under `remove`; behavior unchanged.
 */
export async function remove(
	db: HyperIdleDb,
	item: KnowledgeItem,
	options: WriteOptions = {},
): Promise<KnowledgeItem> {
	const timestamp = options.timestamp ?? now();
	await db
		.update(knowledgeItems)
		.set({ status: "archived", updatedAt: timestamp })
		.where(eq(knowledgeItems.id, item.id));

	await db.insert(knowledgeEditLog).values({
		id: generateId(),
		itemId: item.id,
		editor: item.updatedBy,
		field: "status",
		oldValue: item.status,
		newValue: "archived",
		editType: "archive",
		createdAt: timestamp,
	});

	const [row] = await db
		.select()
		.from(knowledgeItems)
		.where(eq(knowledgeItems.id, item.id))
		.limit(1);
	if (!row) {
		throw new Error(`Failed to read back knowledge item ${item.id} after archive`);
	}
	return row;
}

// ---------------------------------------------------------------------------
// Plugin-managed skill operations (BA9b)
// ---------------------------------------------------------------------------

export interface UpsertKnowledgeDocumentInput {
	id: string;
	pluginId: string;
	/** The document's title — a skill's directory name, or a routine's prompt title. */
	title: string;
	body: string;
	scopeKind: string;
	scopeId: string | null;
	ts: string;
	/** Defaults to `skill`. A routine's prompt is an ordinary document. */
	role?: KnowledgeRole;
	/**
	 * @lore knowledge-attachment-slot: required, not optional — every plugin
	 * writer names its parent, `null` included. Left optional, a caller could
	 * silently keep writing the old parentless shape; a required field makes
	 * `npm run check` name every call site instead.
	 */
	parentKind: KnowledgeParentKind | null;
	parentId: string | null;
}

/**
 * Insert or update a plugin-managed knowledge document — a skill, or the
 * document a contributed routine's prompt lives in.
 *
 * @lore BA9b: On conflict (same ID = same plugin+dirName), updates scope/topic/
 * timestamp but PRESERVES the body — user edits win (D5: your edit wins, you
 * are told it detached from the plugin). No edit-log entry is written here
 * because these are machine-managed rows; a user edit through the knowledge
 * route writes its own log entry via the normal update() path.
 */
/**
 * The body of the `agent_file` knowledge document bound to this agent — its
 * identity, which becomes the "## Identity" section of the AGENTS.md its
 * sessions read.
 *
 * The binding is the one context assembly already uses for `agent_file`:
 * `scopeKind='user'` with `scopeId` set to the agent's id. Null when the agent
 * has no identity document, which is a valid state — the session then carries
 * task, tools and workspace sections without a persona.
 */
/**
 * The item in a parent's named slot — a routine's prompt, an agent's
 * identity. Parent says where it hangs, role says where it lands; together
 * they are the singular-slot query (`ki_parent_slot_uq` makes at most one
 * item ever answer it). Ignores scope entirely — scope answers a different
 * question (how far an item reaches), not which item occupies this slot.
 */
export async function getParentedItem(
	db: HyperIdleDb,
	input: {
		readonly parentKind: KnowledgeParentKind;
		readonly parentId: string;
		readonly role: KnowledgeRole;
		readonly status?: "active";
	},
): Promise<KnowledgeItem | null> {
	const [row] = await db
		.select()
		.from(knowledgeItems)
		.where(
			and(
				eq(knowledgeItems.parentKind, input.parentKind),
				eq(knowledgeItems.parentId, input.parentId),
				eq(knowledgeItems.role, input.role),
				...(input.status ? [eq(knowledgeItems.status, input.status)] : []),
			),
		)
		.limit(1);
	return row ?? null;
}

/**
 * Every item under one parent, whatever its role — feeds the archive-on-
 * delete path (a parent's children are its whole `parent_kind`+`parent_id`
 * population, not just its named slot).
 */
export async function listItemIdsByParent(
	db: HyperIdleDb,
	input: { readonly parentKind: KnowledgeParentKind; readonly parentId: string },
): Promise<readonly string[]> {
	const rows = await db
		.select({ id: knowledgeItems.id })
		.from(knowledgeItems)
		.where(
			and(
				eq(knowledgeItems.parentKind, input.parentKind),
				eq(knowledgeItems.parentId, input.parentId),
			),
		);
	return rows.map((r) => r.id);
}

/**
 * The same named slot for many parents at once — module-private because its
 * only consumer is `getAgentIdentityIds` below. `knip.json` sets
 * `ignoreExportsUsedInFile: true`, so an in-file-used export is fine, but a
 * barrel re-export nothing outside consumes would be flagged as unused.
 */
async function listParentedItemIds(
	db: HyperIdleDb,
	input: {
		readonly parentKind: KnowledgeParentKind;
		readonly parentIds: readonly string[];
		readonly role: KnowledgeRole;
		readonly status?: "active";
	},
): Promise<Map<string, string>> {
	if (input.parentIds.length === 0) return new Map();
	const rows = await db
		.select({ id: knowledgeItems.id, parentId: knowledgeItems.parentId })
		.from(knowledgeItems)
		.where(
			and(
				eq(knowledgeItems.parentKind, input.parentKind),
				inArray(knowledgeItems.parentId, [...input.parentIds]),
				eq(knowledgeItems.role, input.role),
				...(input.status ? [eq(knowledgeItems.status, input.status)] : []),
			),
		);
	return new Map(rows.flatMap((r) => (r.parentId ? [[r.parentId, r.id] as const] : [])));
}

/**
 * The same named slot's text for many parents at once — one query instead of
 * one `getParentedItem` per parent. A list endpoint that must agree with its
 * own detail endpoint on shape (e.g. a routine's `prompt`) reaches for this
 * instead of resolving each row's document individually.
 */
export async function listParentedItemBodies(
	db: HyperIdleDb,
	input: {
		readonly parentKind: KnowledgeParentKind;
		readonly parentIds: readonly string[];
		readonly role: KnowledgeRole;
		readonly status?: "active";
	},
): Promise<Map<string, string>> {
	if (input.parentIds.length === 0) return new Map();
	const rows = await db
		.select({ body: knowledgeItems.body, parentId: knowledgeItems.parentId })
		.from(knowledgeItems)
		.where(
			and(
				eq(knowledgeItems.parentKind, input.parentKind),
				inArray(knowledgeItems.parentId, [...input.parentIds]),
				eq(knowledgeItems.role, input.role),
				...(input.status ? [eq(knowledgeItems.status, input.status)] : []),
			),
		);
	return new Map(rows.flatMap((r) => (r.parentId ? [[r.parentId, r.body] as const] : [])));
}

/**
 * Give an agent its identity document, or update the one it has.
 *
 * An agent's identity is an `agent_file` knowledge document parented to it —
 * `parentKind='agent'` with `parentId` set to the agent — which is the
 * binding context assembly reads through `getParentedItem`. `scopeKind:
 * 'user'`/`scopeId` are still written too: scope answers a different
 * question (how far the item reaches) and is never derived from the parent.
 * Seeded once when the agent is created; after that it is edited like any
 * other document.
 *
 * The body is NOT overwritten when the document already exists: an identity a
 * person has edited is theirs, and re-seeding would silently discard it.
 */
export async function upsertAgentIdentity(
	db: HyperIdleDb,
	input: {
		readonly agentId: string;
		readonly agentName: string;
		readonly body: string;
		readonly updatedBy: string;
	},
): Promise<string> {
	const id = `ki_af_${input.agentId}`;
	const ts = now();
	await db
		.insert(knowledgeItems)
		.values({
			id,
			scopeKind: "user",
			scopeId: input.agentId,
			title: `${input.agentName || input.agentId} — identity`,
			body: input.body,
			format: "markdown",
			status: "active",
			version: 1,
			role: "agent_file",
			parentKind: "agent",
			parentId: input.agentId,
			updatedBy: input.updatedBy,
			createdAt: ts,
			updatedAt: ts,
		})
		.onConflictDoNothing();
	// Kernel row and projection travel together, as knowledge always writes them.
	await db
		.insert(knowledgeAppProjection)
		.values({
			id: `kp_af_${input.agentId}`,
			knowledgeItemId: id,
			scopeId: input.agentId,
		})
		.onConflictDoNothing();
	return id;
}

/**
 * @lore knowledge-attachment-slot: the retired predicate was
 * `scopeKind='user' AND scopeId=agentId` — a reverse lookup. This now resolves
 * through the parent slot instead; scope plays no part in finding the item.
 */
export async function getAgentIdentity(db: HyperIdleDb, agentId: string): Promise<string | null> {
	const item = await getParentedItem(db, {
		parentKind: "agent",
		parentId: agentId,
		role: "agent_file",
		status: "active",
	});
	return item?.body ?? null;
}

/**
 * The identity document id for each of `agentIds`, for agents that have one.
 *
 * The agent list needs to link every agent to the document that says who it is,
 * and one query for the whole list beats one per agent.
 */
export async function getAgentIdentityIds(
	db: HyperIdleDb,
	agentIds: readonly string[],
): Promise<Map<string, string>> {
	return listParentedItemIds(db, {
		parentKind: "agent",
		parentIds: agentIds,
		role: "agent_file",
		status: "active",
	});
}

/**
 * The body of the `prompt` knowledge document parented to a routine — the
 * instruction its sessions read. `getAgentIdentity`'s exact twin: parent
 * says where it hangs, role says where it lands, same singular-slot query.
 * Null when the routine has no prompt document.
 *
 * @lore knowledge-attachment-slot: no status filter, on purpose — today's
 * read has never had one, so a manually archived prompt keeps being read
 * exactly as it is today. Narrowing to `status: "active"` (like
 * `getAgentIdentity` does) is a real behavior change nobody has asked for.
 */
export async function getRoutinePrompt(db: HyperIdleDb, routineId: string): Promise<string | null> {
	const item = await getParentedItem(db, {
		parentKind: "routine",
		parentId: routineId,
		role: "prompt",
	});
	return item?.body ?? null;
}

/**
 * `getRoutinePrompt` for a whole page of routines, in one query rather than
 * one per row — mirrors `getAgentIdentityIds` for the routine list, which
 * must agree with the single-routine routes on the same `prompt` field.
 */
export async function getRoutinePromptBodies(
	db: HyperIdleDb,
	routineIds: readonly string[],
): Promise<Map<string, string>> {
	return listParentedItemBodies(db, {
		parentKind: "routine",
		parentIds: routineIds,
		role: "prompt",
	});
}

export async function upsertKnowledgeDocument(
	db: HyperIdleDb,
	input: UpsertKnowledgeDocumentInput,
): Promise<void> {
	await db
		.insert(knowledgeItems)
		.values({
			id: input.id,
			scopeKind: input.scopeKind,
			scopeId: input.scopeId,
			title: input.title,
			body: input.body,
			format: "markdown",
			status: "active",
			version: 1,
			role: input.role ?? "skill",
			parentKind: input.parentKind,
			parentId: input.parentId,
			// @lore BA9g: `plugin:<id>` was a provenance sentinel here. Migration
			// 0071 rewrote every existing one to `plugin` because it leaked into the
			// knowledge view as a raw author string, and the registry carries
			// provenance now — so a freshly installed document must not re-create it.
			updatedBy: "plugin",
			createdAt: input.ts,
			updatedAt: input.ts,
		})
		.onConflictDoUpdate({
			target: [knowledgeItems.id],
			set: {
				// D5: body is NOT in the update set — the user's edit wins.
				scopeKind: input.scopeKind,
				scopeId: input.scopeId,
				// A reinstall over a row created before the parent column existed
				// must repair the binding, exactly as this set already repairs
				// scope and status. The parent is not a person's field, so nothing
				// a human wrote is discarded by overwriting it.
				parentKind: input.parentKind,
				parentId: input.parentId,
				// Uninstall and disable both ARCHIVE these rows, and only `active`
				// ones reach a session. Leaving status alone here meant a reinstall
				// produced a plugin that reported `enabled`, restored its agent and
				// routines, and still delivered no skills to anyone — the rows came
				// back archived and stayed that way. Installing is a deliberate act;
				// it makes the contribution live again. Distinct from `body`, which
				// stays untouched so a person's edit survives.
				status: "active" as const,
				updatedAt: input.ts,
			},
		});
	// Kernel row and projection travel together, as knowledge always writes them.
	// @lore BA9g: this write was MISSING. Migrations 0068/0069/0071 all insert a
	// projection and their tests assert "a document with no projection is a state
	// production cannot produce" — while the install path produced exactly that.
	// Migrated documents appeared in scope-filtered views (which inner-join the
	// projection) and freshly installed ones did not.
	await db
		.insert(knowledgeAppProjection)
		.values({
			id: `kp_${input.id}`,
			knowledgeItemId: input.id,
			scopeId: input.scopeId,
		})
		.onConflictDoNothing();
}

/**
 * Set the status of all knowledge items for a plugin (by topic).
 * Used by the plugin disable/enable lifecycle in the route layer.
 *
 * status='archived' → skills stop reaching sessions (assembler filters status='active').
 * status='active'   → skills are restored on enable.
 *
 * @lore BA9d: the route cannot write the `knowledge_items` table directly
 * (governance boundary) — it calls this function instead. This is a topic-level
 * bulk update: ALL items with topic=`plugin:${pluginId}` are affected,
 * including any the user has edited (their body survives in the row; only the
 * status changes). There is NO restore path for user-edited skill bodies on
 * disable/remove — skills do not go through plugin_configuration_defaults, so
 * restorePluginContribution() cannot recover them.
 */
/**
 * Set status on the named knowledge documents.
 *
 * @lore BA9g: it took a `pluginId` and matched `topic = 'plugin:<id>'`. The
 * topic is a person's field — editing it silently orphaned a document from
 * uninstall and disable, permanently. The plugin service names the documents
 * now, and `topic` means what it says.
 */
export async function setKnowledgeStatus(
	exec: WriteExecutor,
	ids: readonly string[],
	status: "active" | "archived",
): Promise<void> {
	if (ids.length === 0) return;
	await exec
		.update(knowledgeItems)
		.set({ status, updatedAt: new Date().toISOString() })
		.where(inArray(knowledgeItems.id, [...ids]));
}

/**
 * Overwrite a skill's body with the plugin's original content and reset
 * updatedBy back to `plugin:${pluginId}`, marking the item as no longer
 * detached from the plugin.
 *
 * Called by the restore-contribution route when kind="skill" (D12): the
 * route reads the SKILL.md from install_path on disk and passes the body
 * here so knowledge-repository stays pure (no filesystem access).
 *
 * @lore D12: "restore to original version just means we import from the
 * plugin again. the plugin is the original version." — founder, BA9/founder-decisions.md.
 * We deliberately do NOT store a separate copy in plugin_configuration_defaults;
 * the file on disk IS the authoritative original.
 */
/**
 * Put the plugin's version of a contributed document back.
 *
 * @lore BA9g: this also reset `updatedBy` to `plugin:<id>` to clear the
 * "detached" signal. That sentinel is gone — detachment is a registry column,
 * and `updated_by` names a person again. The caller clears it.
 */
export async function restorePluginDocumentBody(
	exec: WriteExecutor,
	documentId: string,
	body: string,
	restoredBy: string,
): Promise<void> {
	await exec
		.update(knowledgeItems)
		.set({ body, updatedBy: restoredBy, updatedAt: new Date().toISOString() })
		.where(eq(knowledgeItems.id, documentId));
}
