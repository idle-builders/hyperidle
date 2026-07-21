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
	escapeLikePattern,
	type HyperIdleDb,
	type KnowledgeItem,
	knowledgeAccessLog,
	knowledgeAppProjection,
	knowledgeEditLog,
	knowledgeItems,
} from "@hyperidle/db";

import { type KernelKnowledgeStatus, type SCOPE_KINDS, scopeToLayer } from "@hyperidle/shared";
import { and, desc, eq, gte, inArray, ne, or, sql } from "drizzle-orm";
import { ItemDeletedError, VersionConflictError } from "./errors.js";
import { ftsSearch } from "./fts.js";
import type { KnowledgeKind, KnowledgeLayer, KnowledgeScope, KnowledgeStatus } from "./types.js";

// ---------------------------------------------------------------------------
// Input shapes (public — used by callers of create/update)
// ---------------------------------------------------------------------------

export interface CreateKnowledgeItemInput {
	/**
	 * @lore AU14: widened to accept `null` alongside the existing symmetric `kind`
	 * widening. The HTTP route passes `scopeToLayer(scopeKind)` (returns `null` for
	 * team/bet/user/filesystem scopes — see @hyperidle/shared SCOPE_TO_LAYER), which
	 * is exactly what the pre-AU14 route's `upsertProjectionLayer` wrote into the
	 * (nullable) `knowledgeAppProjection.layer` column for those scopes. Existing
	 * callers (`write-memory.ts`, `writeback.ts`) always pass a concrete layer, so
	 * this is behavior-neutral for them.
	 */
	layer: KnowledgeLayer | null;
	/** @lore R7: scopeKind written to the kernel table so items are queryable by
	 * scope without a JOIN against the extension table. Defaults to "factory"
	 * when not provided (preserves existing behavior for callers that don't set scope). */
	scopeKind?: string | null;
	scopeId?: string | null;
	/**
	 * @lore AU14: made optional so callers with no `kind` concept (the HTTP route)
	 * can omit it and keep `projection.kind` null, matching pre-AU14 route behavior.
	 * `write-memory.ts`/`writeback.ts` always pass `kind` — `?? null` never fires for them.
	 */
	kind?: KnowledgeKind | null;
	topic?: string | null;
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
	attentionScore?: number | null;
	confidence?: number | null;
	meta?: string | null;
}

export interface UpdateKnowledgeItemInput {
	layer?: KnowledgeLayer;
	scopeId?: string | null;
	kind?: KnowledgeKind;
	topic?: string | null;
	title?: string;
	body?: string;
	/** @lore AU14: same `string` widening as CreateKnowledgeItemInput.format — see there. */
	format?: string;
	/** @lore AU14: same `KnowledgeStatus | KernelKnowledgeStatus` widening as
	 * CreateKnowledgeItemInput.status (R7) — the PATCH route accepts kernel
	 * statuses (e.g. "draft") that are outside the app-runtime KnowledgeStatus enum. */
	status?: KnowledgeStatus | KernelKnowledgeStatus;
	updatedBy?: string;
	attentionScore?: number | null;
	confidence?: number | null;
	meta?: string | null;
}

/** Base filter for list() — filters on kernel + projection table fields. */
export interface ListFilters {
	layer?: KnowledgeLayer;
	scopeId?: string;
	kind?: KnowledgeKind;
	topic?: string;
	limit?: number;
	offset?: number;
}

/** Discriminant for get() — selects which projection view to return. */
export type KnowledgeItemView = "summary" | "detail" | "projection";

/**
 * Augments the kernel KnowledgeItem with app-runtime fields from the
 * knowledgeAppProjection extension table.
 *
 * @lore AF3: Do NOT redeclare fields already on KnowledgeItem (scopeId, etc.) —
 * TS2430 fires if an optional override conflicts with a required base property.
 * Only declare NEW fields from knowledgeAppProjection here.
 */
export interface KnowledgeItemWithProjection extends KnowledgeItem {
	layer?: string | null;
	kind?: string | null;
	attentionScore?: string | null;
	confidence?: string | null;
	meta?: string | null;
}

/** Filters for listExportableKnowledgeItems (kept in barrel for git-export callers). */
export interface ExportableKnowledgeItemFilters {
	readonly layers: readonly string[];
	readonly statuses: readonly string[];
}

// ---------------------------------------------------------------------------
// Local (non-exported) return-shape types — used in overload signatures.
// These replaced the former exported row types (KnowledgeListRow,
// KnowledgeDetailRow, etc.) deleted in AU20 K1-reads.
// ---------------------------------------------------------------------------

/** Row shape for list({visibleWithSignals}) — replaces exported KnowledgeListRow. */
type ListRow = {
	item: KnowledgeItem;
	relevanceScore: string | null;
	attentionScore: string | null;
	accessCount30d: number | null;
	lastActivityAt: string | null;
};

/** Row shape for get({view:'detail'}) — replaces exported KnowledgeDetailRow. */
type DetailRow = {
	item: KnowledgeItem;
	kind: string | null;
	layer: string | null;
	confidence: string | null;
	relevanceScore: string | null;
	attentionScore: string | null;
};

/** Row shape for get({view:'projection'}) — replaces exported KnowledgeItemProjectionRow. */
type ProjectionRow = {
	readonly layer: string | null;
	readonly kind: string | null;
};

/** Row shape for list({retroForBet}) — replaces exported RetroExistingKnowledgeItemRow. */
type RetroRow = {
	readonly id: string;
	readonly version: number;
};

/** Row shape for list({recentByLayers}) — replaces exported RecentLayeredKnowledgeItemRow. */
type RecentRow = {
	readonly title: string;
	readonly updatedAt: string;
	readonly layer: string | null;
};

/** Row shape for list({exportable}) — replaces exported ExportableKnowledgeItemRow. */
type ExportRow = {
	readonly id: string;
	readonly topic: string | null;
	readonly title: string;
	readonly body: string;
	readonly version: number;
	readonly layer: string | null;
	readonly kind: string | null;
	readonly scopeId: string | null;
};

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function generateId(): string {
	return crypto.randomUUID();
}

function now(): string {
	return new Date().toISOString();
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
		layer: projection.layer,
		scopeId: projection.scopeId,
		kind: projection.kind,
		attentionScore: projection.attentionScore,
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
): Promise<KnowledgeItemWithProjection> {
	const id = generateId();
	const timestamp = now();

	// Insert into canonical table (projection fields excluded, except scopeKind/scopeId
	// which live on the kernel for efficient scope queries without a JOIN)
	await db.insert(knowledgeItems).values({
		id,
		scopeKind: input.scopeKind ?? "factory",
		scopeId: input.scopeId ?? null,
		topic: input.topic ?? null,
		title: input.title,
		body: input.body,
		format: input.format,
		status: input.status,
		version: 1,
		updatedBy: input.updatedBy,
		createdAt: timestamp,
		updatedAt: timestamp,
	});

	// Insert into app projection table.
	await db.insert(knowledgeAppProjection).values({
		id: generateId(),
		knowledgeItemId: id,
		layer: input.layer,
		scopeId: input.scopeId ?? null,
		kind: input.kind ?? null,
		attentionScore: input.attentionScore != null ? String(input.attentionScore) : null,
		confidence: input.confidence != null ? String(input.confidence) : null,
		meta: input.meta ?? null,
	});

	// Edit log for create
	await db.insert(knowledgeEditLog).values({
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
	// EventBus emit (live subscribers: ws-broadcaster, git-export, observability
	// dispatcher); non-HTTP callers (tools/writeback) never emitted on the bus
	// before this WP and continue not to — emitting here would be a NEW event for
	// them, a behavior change the WP forbids. See plans/AU14/architecture.md §4.
	const [created] = await db
		.select()
		.from(knowledgeItems)
		.where(eq(knowledgeItems.id, id))
		.limit(1);
	if (!created) {
		throw new Error(`Failed to read back created knowledge item ${id}`);
	}
	const projectionRow = await getProjectionRow(db, id);
	return mergeWithProjection(created, projectionRow);
}

/**
 * Allow-list of caller-mutable fields for the kernel table.
 * @lore O2: projection fields (layer, scopeId, kind, attentionScore, confidence, meta)
 * are removed from canonical EDITABLE_FIELDS and written to the extension table instead.
 */
const KERNEL_EDITABLE_FIELDS = ["topic", "title", "body", "format", "status", "updatedBy"] as const;

const PROJECTION_EDITABLE_FIELDS = [
	"layer",
	"scopeId",
	"kind",
	"attentionScore",
	"confidence",
	"meta",
] as const;

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
		// Store numeric fields as strings in the extension table
		projectionChanges[field] =
			field === "attentionScore" || field === "confidence"
				? newVal != null
					? String(newVal)
					: null
				: newVal;
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

			const timestamp = now();
			const newVersion = existing.version + 1;
			const { kernelChanges, projectionChanges, editLogEntries } = buildDiff(
				id,
				existingWithProjection,
				changes,
				timestamp,
			);

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

			// Update extension table if there are projection changes.
			if (Object.keys(projectionChanges).length > 0) {
				const [existingProjection] = await tx
					.select({ id: knowledgeAppProjection.id })
					.from(knowledgeAppProjection)
					.where(eq(knowledgeAppProjection.knowledgeItemId, id))
					.limit(1);
				if (existingProjection) {
					await tx
						.update(knowledgeAppProjection)
						.set(projectionChanges)
						.where(eq(knowledgeAppProjection.knowledgeItemId, id));
				} else {
					// Create extension row if it doesn't exist
					await tx.insert(knowledgeAppProjection).values({
						id: generateId(),
						knowledgeItemId: id,
						...projectionChanges,
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
// READ operations — K1-reads: get / list / count / search / countAccesses
// ---------------------------------------------------------------------------

/**
 * Internal base list query: filter by kernel + projection fields.
 * Called by the overloaded list() for the default base ListFilters case.
 */
async function listBase(
	db: HyperIdleDb,
	filters: ListFilters = {},
): Promise<KnowledgeItemWithProjection[]> {
	const hasProjectionFilter =
		filters.layer !== undefined || filters.scopeId !== undefined || filters.kind !== undefined;

	const limit = filters.limit ?? 50;
	const offset = filters.offset ?? 0;

	if (!hasProjectionFilter) {
		const kernelConditions = [];
		if (filters.topic !== undefined) {
			kernelConditions.push(eq(knowledgeItems.topic, filters.topic));
		}

		let query = db.select().from(knowledgeItems).$dynamic();
		if (kernelConditions.length > 0) {
			query = query.where(and(...kernelConditions));
		}
		const rows = await query.limit(limit).offset(offset);

		const result: KnowledgeItemWithProjection[] = [];
		for (const item of rows) {
			const projection = await getProjectionRow(db, item.id);
			result.push(mergeWithProjection(item, projection));
		}
		return result;
	}

	// Projection filters: JOIN with extension table.
	// @lore O2: projection filter queries must JOIN with knowledgeAppProjection.
	const conditions: ReturnType<typeof eq>[] = [];

	if (filters.topic !== undefined) {
		conditions.push(eq(knowledgeItems.topic, filters.topic));
	}
	if (filters.layer !== undefined) {
		conditions.push(eq(knowledgeAppProjection.layer, filters.layer));
	}
	if (filters.scopeId !== undefined) {
		conditions.push(eq(knowledgeAppProjection.scopeId, filters.scopeId));
	}
	if (filters.kind !== undefined) {
		conditions.push(eq(knowledgeAppProjection.kind, filters.kind));
	}

	const rows = await db
		.select({ item: knowledgeItems, projection: knowledgeAppProjection })
		.from(knowledgeItems)
		.innerJoin(
			knowledgeAppProjection,
			eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
		)
		.where(and(...conditions))
		.limit(limit)
		.offset(offset);

	return rows.map(({ item, projection }) => mergeWithProjection(item, projection));
}

/**
 * Fetch a knowledge item by id with a discriminated view selection.
 *
 * - `{view: 'detail'}` → kernel row LEFT JOINed with projection (kind/layer/confidence/scores)
 * - `{view: 'projection'}` → projection layer+kind only (for git-export event handler)
 * - default / `{view: 'summary'}` → raw kernel row (KnowledgeItem)
 *
 * @lore Ag7b: Collapses findById / findDetailById / findKnowledgeItemProjectionById
 * into one entry point with a discriminated return type so callers get the precise
 * shape they need without widening to a common any-bag.
 *
 * @lore AU20 K1-reads: the three delegate functions (findById, findDetailById,
 * findKnowledgeItemProjectionById) are deleted — logic is inlined into each case.
 */
export function get(
	db: HyperIdleDb,
	id: string,
	opts: { view: "detail" },
): Promise<DetailRow | null>;
export function get(
	db: HyperIdleDb,
	id: string,
	opts: { view: "projection" },
): Promise<ProjectionRow | null>;
export function get(
	db: HyperIdleDb,
	id: string,
	opts?: { view?: "summary" },
): Promise<KnowledgeItem | null>;
export async function get(
	db: HyperIdleDb,
	id: string,
	opts?: { view?: KnowledgeItemView },
): Promise<KnowledgeItem | DetailRow | ProjectionRow | null> {
	switch (opts?.view) {
		case "detail": {
			// Inlined from former findDetailById.
			const [row] = await db
				.select({
					item: knowledgeItems,
					kind: knowledgeAppProjection.kind,
					layer: knowledgeAppProjection.layer,
					confidence: knowledgeAppProjection.confidence,
					relevanceScore: knowledgeAppProjection.relevanceScore,
					attentionScore: knowledgeAppProjection.attentionScore,
				})
				.from(knowledgeItems)
				.leftJoin(
					knowledgeAppProjection,
					eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
				)
				.where(eq(knowledgeItems.id, id))
				.limit(1);
			return row ?? null;
		}
		case "projection": {
			// Inlined from former findKnowledgeItemProjectionById.
			const [row] = await db
				.select({ item: knowledgeItems, projection: knowledgeAppProjection })
				.from(knowledgeItems)
				.leftJoin(
					knowledgeAppProjection,
					eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
				)
				.where(eq(knowledgeItems.id, id))
				.limit(1);
			if (!row) return null;
			return { layer: row.projection?.layer ?? null, kind: row.projection?.kind ?? null };
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
 * List knowledge items with a discriminated filter.
 *
 * Discriminated variants (first matching wins):
 * - `{scope}` → items in scopeKind+scopeId on kernel table (replaces listByScope)
 * - `{visibleWithSignals}` → all items visible to viewerUserId with L22 signals
 * - `{retroForBet}` → the single retro knowledge item for a bet
 * - `{titlesByIds}` → batched title lookup
 * - `{recentByLayers}` → items in given layers updated since a cutoff
 * - `{exportable}` → items with matching layer/status for git export
 * - `{relatedByTopic}` → same-topic items visible to viewer
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
	filter: { readonly visibleWithSignals: string },
): Promise<ListRow[]>;
export function list(
	db: HyperIdleDb,
	filter: { readonly retroForBet: string },
): Promise<RetroRow | null>;
export function list(
	db: HyperIdleDb,
	filter: { readonly titlesByIds: readonly string[] },
): Promise<Array<{ id: string; title: string }>>;
export function list(
	db: HyperIdleDb,
	filter: {
		readonly recentByLayers: { readonly layers: readonly string[]; readonly since: string };
	},
): Promise<readonly RecentRow[]>;
export function list(
	db: HyperIdleDb,
	filter: { readonly exportable: ExportableKnowledgeItemFilters },
): Promise<readonly ExportRow[]>;
export function list(
	db: HyperIdleDb,
	filter: {
		readonly relatedByTopic: {
			readonly topic: string;
			readonly excludeId: string;
			readonly viewerUserId: string;
			readonly limit: number;
		};
	},
): Promise<Array<{ id: string; title: string }>>;
export function list(
	db: HyperIdleDb,
	filter: { readonly scope: KnowledgeScope },
): Promise<KnowledgeItem[]>;
export function list(db: HyperIdleDb, filter?: ListFilters): Promise<KnowledgeItemWithProjection[]>;
export async function list(
	db: HyperIdleDb,
	filter?:
		| { readonly visibleWithSignals: string }
		| { readonly retroForBet: string }
		| { readonly titlesByIds: readonly string[] }
		| { readonly recentByLayers: { readonly layers: readonly string[]; readonly since: string } }
		| { readonly exportable: ExportableKnowledgeItemFilters }
		| {
				readonly relatedByTopic: {
					readonly topic: string;
					readonly excludeId: string;
					readonly viewerUserId: string;
					readonly limit: number;
				};
		  }
		| { readonly scope: KnowledgeScope }
		| ListFilters,
): Promise<
	| KnowledgeItemWithProjection[]
	| ListRow[]
	| RetroRow
	| null
	| readonly { id: string; title: string }[]
	| readonly RecentRow[]
	| readonly ExportRow[]
	| KnowledgeItem[]
> {
	if (!filter) return listBase(db);

	if ("visibleWithSignals" in filter) {
		// Inlined from former listVisibleWithSignals.
		const viewerUserId = filter.visibleWithSignals;
		const rawItems = await db
			.select({
				item: knowledgeItems,
				relevanceScore: knowledgeAppProjection.relevanceScore,
				attentionScore: knowledgeAppProjection.attentionScore,
			})
			.from(knowledgeItems)
			.leftJoin(
				knowledgeAppProjection,
				eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
			)
			.where(or(ne(knowledgeItems.scopeKind, "user"), eq(knowledgeItems.updatedBy, viewerUserId)));

		const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
		const allAccessRows = await db
			.select()
			.from(knowledgeAccessLog)
			.where(sql`${knowledgeAccessLog.accessedAt} >= ${thirtyDaysAgo}`);

		const accessByItem = new Map<string, typeof allAccessRows>();
		for (const row of allAccessRows) {
			const existing = accessByItem.get(row.itemId) ?? [];
			existing.push(row);
			accessByItem.set(row.itemId, existing);
		}

		return rawItems.map(({ item, relevanceScore, attentionScore }) => {
			const accessRows = accessByItem.get(item.id) ?? [];
			const accessCount30d = accessRows.length > 0 ? accessRows.length : null;
			const lastActivityAt =
				accessRows.length > 0
					? accessRows.reduce(
							(latest, r) => (r.accessedAt > latest ? r.accessedAt : latest),
							accessRows[0]?.accessedAt ?? "",
						)
					: null;
			return { item, relevanceScore, attentionScore, accessCount30d, lastActivityAt };
		});
	}

	if ("retroForBet" in filter) {
		// Inlined from former findRetroKnowledgeItemForBet.
		const [row] = await db
			.select({ id: knowledgeItems.id, version: knowledgeItems.version })
			.from(knowledgeItems)
			.innerJoin(
				knowledgeAppProjection,
				eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
			)
			.where(
				and(
					eq(knowledgeItems.scopeKind, "bet"),
					eq(knowledgeItems.scopeId, filter.retroForBet),
					eq(knowledgeAppProjection.kind, "reflection"),
				),
			)
			.limit(1);
		return row ?? null;
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

	if ("recentByLayers" in filter) {
		// Inlined from former listRecentByLayers.
		const { layers, since } = filter.recentByLayers;
		const rows = await db
			.select({ item: knowledgeItems, fabric: knowledgeAppProjection })
			.from(knowledgeItems)
			.innerJoin(
				knowledgeAppProjection,
				eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
			)
			.where(
				and(
					inArray(knowledgeAppProjection.layer, layers as string[]),
					gte(knowledgeItems.updatedAt, since),
				),
			);
		return rows.map((r) => ({
			title: r.item.title,
			updatedAt: r.item.updatedAt,
			layer: r.fabric.layer,
		}));
	}

	if ("exportable" in filter) {
		// Inlined from former listExportableKnowledgeItems.
		const filters = filter.exportable;
		const rows = await db
			.select({ item: knowledgeItems, projection: knowledgeAppProjection })
			.from(knowledgeItems)
			.innerJoin(
				knowledgeAppProjection,
				eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
			)
			.where(
				and(
					inArray(knowledgeAppProjection.layer, filters.layers as string[]),
					inArray(knowledgeItems.status, filters.statuses as string[]),
				),
			);
		return rows.map((r) => ({
			id: r.item.id,
			topic: r.item.topic,
			title: r.item.title,
			body: r.item.body,
			version: r.item.version,
			layer: r.projection?.layer ?? null,
			kind: r.projection?.kind ?? null,
			scopeId: r.projection?.scopeId ?? null,
		}));
	}

	if ("relatedByTopic" in filter) {
		// Inlined from former findRelatedByTopic.
		const opts = filter.relatedByTopic;
		return db
			.select({ id: knowledgeItems.id, title: knowledgeItems.title })
			.from(knowledgeItems)
			.where(
				and(
					eq(knowledgeItems.topic, opts.topic),
					ne(knowledgeItems.id, opts.excludeId),
					or(ne(knowledgeItems.scopeKind, "user"), eq(knowledgeItems.updatedBy, opts.viewerUserId)),
				),
			)
			.limit(opts.limit);
	}

	if ("scope" in filter) {
		// Inlined from former listByScope (knowledge-reader.ts, now deleted).
		// Filters on kernel table scopeKind + scopeId — not the projection table.
		const { scopeKind, scopeId } = filter.scope;
		const conditions = [eq(knowledgeItems.scopeKind, scopeKind)];
		if (scopeId != null) {
			conditions.push(eq(knowledgeItems.scopeId, scopeId));
		}
		return db
			.select()
			.from(knowledgeItems)
			.where(and(...conditions));
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
				inArray(knowledgeItems.status, ["draft", "needs_human"]),
				or(ne(knowledgeItems.scopeKind, "user"), eq(knowledgeItems.updatedBy, viewerUserId)),
			),
		);
	return Number(result?.count ?? 0);
}

/**
 * FTS or text-mode search across knowledge items.
 *
 * - `{mode: 'fts'}` (default) — tsvector full-text search on title+body
 * - `{mode: 'text'}` — ILIKE substring search on title+body+topic
 * - `{visibility: viewerUserId}` — restrict to Q2 auth boundary (scope_kind != 'user' OR updatedBy = userId)
 *
 * @lore AU20 K1-reads: subsumes former searchByText (LIKE, all items) and
 * searchVisibleByText (ILIKE + Q2 filter) — both deleted from source.
 * Text mode uses ILIKE (case-insensitive) rather than searchByText's LIKE;
 * the behavioral difference is an intentional improvement (better UX).
 */
export interface SearchOptions {
	limit?: number;
	offset?: number;
	/** Search mode: 'fts' (default) uses tsvector full-text; 'text' uses ILIKE on title/body/topic. */
	mode?: "fts" | "text";
	/** If provided, restrict to items visible to this userId (Q2 auth boundary). */
	visibility?: string;
}

export async function search(
	db: HyperIdleDb,
	query: string,
	options: SearchOptions = {},
): Promise<KnowledgeItemWithProjection[]> {
	const { mode = "fts", visibility, limit = 50, offset = 0 } = options;

	if (mode === "text") {
		// ILIKE-based text search across title, body, and topic.
		// Subsumes former searchByText (title/body/topic, LIKE) and
		// searchVisibleByText (title/body, ILIKE + visibility).
		const pattern = `%${escapeLikePattern(query)}%`;

		const authFilter =
			visibility != null
				? or(ne(knowledgeItems.scopeKind, "user"), eq(knowledgeItems.updatedBy, visibility))
				: undefined;

		const textFilter = or(
			sql`${knowledgeItems.title} ILIKE ${pattern} ESCAPE '\\'`,
			sql`${knowledgeItems.body} ILIKE ${pattern} ESCAPE '\\'`,
			sql`${knowledgeItems.topic} ILIKE ${pattern} ESCAPE '\\'`,
		);

		const whereClause = authFilter != null ? and(authFilter, textFilter) : textFilter;

		const rows = await db
			.select({
				item: knowledgeItems,
				projection: knowledgeAppProjection,
			})
			.from(knowledgeItems)
			.leftJoin(
				knowledgeAppProjection,
				eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
			)
			.where(whereClause)
			.orderBy(desc(knowledgeItems.updatedAt), knowledgeItems.id)
			.limit(limit)
			.offset(offset);

		return rows.map(({ item, projection }) => mergeWithProjection(item, projection));
	}

	// FTS mode (default): tsvector full-text search.
	const ids = await ftsSearch(db, query, { limit, offset });
	if (ids.length === 0) {
		return [];
	}

	if (visibility != null) {
		// Apply Q2 auth filter after FTS ranking — not worth plumbing into ftsSearch SQL.
		const items: KnowledgeItemWithProjection[] = [];
		for (const id of ids) {
			const [item] = await db
				.select()
				.from(knowledgeItems)
				.where(
					and(
						eq(knowledgeItems.id, id),
						or(ne(knowledgeItems.scopeKind, "user"), eq(knowledgeItems.updatedBy, visibility)),
					),
				)
				.limit(1);
			if (item) {
				const projection = await getProjectionRow(db, id);
				items.push(mergeWithProjection(item, projection));
			}
		}
		return items;
	}

	// Fetch items in the order returned by FTS (ranked by relevance)
	const items: KnowledgeItemWithProjection[] = [];
	for (const id of ids) {
		const [item] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).limit(1);
		if (item) {
			const projection = await getProjectionRow(db, id);
			items.push(mergeWithProjection(item, projection));
		}
	}

	return items;
}

/**
 * Count access-log entries for a given filter.
 *
 * - `{itemId, since}` — count of access rows for itemId since the ISO cutoff
 *
 * @lore AU20 K1-reads: subsumes former countAccessesSince — deleted from source.
 */
export async function countAccesses(
	db: HyperIdleDb,
	filter: { readonly itemId: string; readonly since: string },
): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)` })
		.from(knowledgeAccessLog)
		.where(
			and(
				eq(knowledgeAccessLog.itemId, filter.itemId),
				sql`${knowledgeAccessLog.accessedAt} >= ${filter.since}`,
			),
		);
	return Number(row?.count ?? 0);
}

// ---------------------------------------------------------------------------
// Write operations continued (scope / merge / split / archive / flag)
// ---------------------------------------------------------------------------

/**
 * Write or upsert a knowledgeAppProjection row for the given knowledge item.
 */
async function upsertProjectionLayer(
	db: HyperIdleDb,
	knowledgeItemId: string,
	scopeKind: string,
): Promise<void> {
	const layer = scopeToLayer(
		// Safe cast: scopeKind is always a validated SCOPE_KINDS member by the time
		// it reaches here (route-side zod validation for scope/create/split callers).
		scopeKind as (typeof SCOPE_KINDS)[number],
	);

	const [existing] = await db
		.select()
		.from(knowledgeAppProjection)
		.where(eq(knowledgeAppProjection.knowledgeItemId, knowledgeItemId))
		.limit(1);

	if (existing) {
		await db
			.update(knowledgeAppProjection)
			.set({ layer })
			.where(eq(knowledgeAppProjection.knowledgeItemId, knowledgeItemId));
	} else {
		await db.insert(knowledgeAppProjection).values({
			id: generateId(),
			knowledgeItemId,
			layer,
		});
	}
}

/**
 * `PATCH /:id/scope` — change scope_kind and scope_id with version tracking.
 */
export async function changeScope(
	db: HyperIdleDb,
	existing: KnowledgeItem,
	input: { scopeKind: string; scopeId: string | null; reason: string; updatedBy: string },
): Promise<KnowledgeItem> {
	const timestamp = now();
	const resolvedScopeId = input.scopeId;

	if (existing.scopeKind !== input.scopeKind) {
		await db.insert(knowledgeEditLog).values({
			id: generateId(),
			itemId: existing.id,
			editor: input.updatedBy,
			field: "scope_kind",
			oldValue: existing.scopeKind,
			newValue: `${input.scopeKind} (reason: ${input.reason})`,
			editType: "scope_change",
			createdAt: timestamp,
		});
	}

	if (existing.scopeId !== resolvedScopeId) {
		await db.insert(knowledgeEditLog).values({
			id: generateId(),
			itemId: existing.id,
			editor: input.updatedBy,
			field: "scope_id",
			oldValue: existing.scopeId ?? null,
			newValue: resolvedScopeId ?? null,
			editType: "scope_change",
			createdAt: timestamp,
		});
	}

	await db
		.update(knowledgeItems)
		.set({
			scopeKind: input.scopeKind,
			scopeId: resolvedScopeId,
			version: existing.version + 1,
			updatedBy: input.updatedBy,
			updatedAt: timestamp,
		})
		.where(eq(knowledgeItems.id, existing.id));

	await upsertProjectionLayer(db, existing.id, input.scopeKind);

	const [updated] = await db
		.select()
		.from(knowledgeItems)
		.where(eq(knowledgeItems.id, existing.id))
		.limit(1);
	if (!updated) {
		throw new Error(`Failed to read back knowledge item ${existing.id} after scope change`);
	}
	return updated;
}

/**
 * `POST /:id/merge` — merge source body into target, archive source.
 */
export async function mergeItems(
	db: HyperIdleDb,
	input: { target: KnowledgeItem; source: KnowledgeItem; updatedBy: string },
): Promise<KnowledgeItem> {
	const timestamp = now();
	const mergedBody = `${input.target.body}\n\n---\n\n${input.source.body}`;

	await db
		.update(knowledgeItems)
		.set({
			body: mergedBody,
			version: input.target.version + 1,
			updatedBy: input.updatedBy,
			updatedAt: timestamp,
		})
		.where(eq(knowledgeItems.id, input.target.id));

	await db
		.update(knowledgeItems)
		.set({ status: "archived", updatedBy: input.updatedBy, updatedAt: timestamp })
		.where(eq(knowledgeItems.id, input.source.id));

	await db.insert(knowledgeEditLog).values({
		id: generateId(),
		itemId: input.target.id,
		editor: input.updatedBy,
		field: "body",
		oldValue: input.target.body,
		newValue: mergedBody,
		editType: "merge",
		createdAt: timestamp,
	});

	await db.insert(knowledgeEditLog).values({
		id: generateId(),
		itemId: input.source.id,
		editor: input.updatedBy,
		field: "status",
		oldValue: input.source.status,
		newValue: "archived",
		editType: "merge",
		createdAt: timestamp,
	});

	const [merged] = await db
		.select()
		.from(knowledgeItems)
		.where(eq(knowledgeItems.id, input.target.id))
		.limit(1);
	if (!merged) {
		throw new Error(`Failed to read back knowledge item ${input.target.id} after merge`);
	}
	return merged;
}

/**
 * `POST /:id/split` — split original into N new items, archive original.
 *
 * @lore AU14 round 2: deliberately does NOT call create() for the new items.
 * create() would add an unwanted `editType:"create"` edit-log row per new
 * item and populate projection.scopeId/kind — both forbidden behavior
 * changes for split (§7c).
 */
export async function splitItem(
	db: HyperIdleDb,
	input: {
		original: KnowledgeItem;
		newItems: Array<{ title: string; body: string; topic?: string }>;
		updatedBy: string;
	},
): Promise<KnowledgeItem[]> {
	const timestamp = now();
	const created: KnowledgeItem[] = [];

	for (const newItem of input.newItems) {
		const newId = generateId();
		await db.insert(knowledgeItems).values({
			id: newId,
			scopeKind: input.original.scopeKind,
			scopeId: input.original.scopeId,
			topic: newItem.topic ?? input.original.topic,
			title: newItem.title,
			body: newItem.body,
			format: input.original.format,
			status: "draft",
			version: 1,
			updatedBy: input.updatedBy,
			createdAt: timestamp,
			updatedAt: timestamp,
		});

		await upsertProjectionLayer(db, newId, input.original.scopeKind);

		const [row] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, newId))
			.limit(1);
		if (!row) {
			throw new Error(`Failed to read back split item ${newId}`);
		}
		created.push(row);
	}

	await db
		.update(knowledgeItems)
		.set({ status: "archived", updatedBy: input.updatedBy, updatedAt: timestamp })
		.where(eq(knowledgeItems.id, input.original.id));

	await db.insert(knowledgeEditLog).values({
		id: generateId(),
		itemId: input.original.id,
		editor: input.updatedBy,
		field: "status",
		oldValue: input.original.status,
		newValue: "archived",
		editType: "split",
		createdAt: timestamp,
	});

	return created;
}

/**
 * `POST /:id/archive` — soft-delete: status→archived, NO version bump.
 *
 * @lore AU20 Ag7c: renamed from `archiveItem` to `remove` — archive-with-log
 * path folds under `remove`; behavior unchanged.
 */
export async function remove(db: HyperIdleDb, item: KnowledgeItem): Promise<KnowledgeItem> {
	const timestamp = now();
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

/**
 * `POST /:id/flag` — status→draft, NO version bump; one flag edit-log row.
 */
export async function flagItem(
	db: HyperIdleDb,
	item: KnowledgeItem,
	input: { reason: string; editId: string },
): Promise<void> {
	const timestamp = now();
	await db
		.update(knowledgeItems)
		.set({ status: "draft", updatedAt: timestamp })
		.where(eq(knowledgeItems.id, item.id));

	await db.insert(knowledgeEditLog).values({
		id: input.editId,
		itemId: item.id,
		editor: item.updatedBy,
		field: "status",
		oldValue: item.status,
		newValue: `flagged (reason: ${input.reason})`,
		editType: "flag",
		createdAt: timestamp,
	});
}

// ---------------------------------------------------------------------------
// Absorbed from attention-score-store.ts (AU20 Ag7a — per-consumer barrel retired)
// ---------------------------------------------------------------------------

/** Upsert `attentionScore` on the `knowledgeAppProjection` row for `knowledgeItemId`. */
export async function upsertKnowledgeAppProjectionAttentionScore(
	db: HyperIdleDb,
	knowledgeItemId: string,
	attentionScore: string,
): Promise<void> {
	const [existing] = await db
		.select({ id: knowledgeAppProjection.id })
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
			id: `ksf-${knowledgeItemId}`,
			knowledgeItemId,
			attentionScore,
		});
	}
	await db
		.update(knowledgeItems)
		.set({ updatedAt: new Date().toISOString() })
		.where(eq(knowledgeItems.id, knowledgeItemId));
}

// ---------------------------------------------------------------------------
// Absorbed from bet-retro-store.ts (AU20 Ag7a — per-consumer barrel retired)
// ---------------------------------------------------------------------------

export interface UpsertBetRetroKnowledgeItemInput {
	readonly existing: RetroRow | null;
	readonly retroKnowledgeItemId: string;
	readonly betId: string;
	readonly title: string;
	readonly body: string;
	readonly verdict: string;
	readonly hypothesisSnapshot: string;
	readonly actor: string | undefined;
	readonly timestamp: string;
}

/**
 * Upsert the bet retro knowledge item + projection row inside the caller's transaction.
 */
export async function upsertBetRetroKnowledgeItem(
	db: HyperIdleDb,
	input: UpsertBetRetroKnowledgeItemInput,
): Promise<void> {
	const {
		existing,
		retroKnowledgeItemId,
		betId,
		title,
		body,
		verdict,
		hypothesisSnapshot,
		actor,
		timestamp,
	} = input;

	if (existing) {
		await db
			.update(knowledgeItems)
			.set({
				title,
				body,
				version: existing.version + 1,
				updatedAt: timestamp,
				updatedBy: actor ?? "system",
			})
			.where(eq(knowledgeItems.id, existing.id));

		const [existingFabric] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, existing.id))
			.limit(1);
		if (existingFabric) {
			const existingMeta = existingFabric.meta
				? (JSON.parse(existingFabric.meta) as Record<string, unknown>)
				: {};
			const updatedMeta = {
				...existingMeta,
				verdict,
				validatedAt: timestamp,
				validatedBy: actor ?? null,
			};
			await db
				.update(knowledgeAppProjection)
				.set({ meta: JSON.stringify(updatedMeta) })
				.where(eq(knowledgeAppProjection.knowledgeItemId, existing.id));
		}
		return;
	}

	await db.insert(knowledgeItems).values({
		id: retroKnowledgeItemId,
		scopeKind: "bet",
		scopeId: betId,
		topic: null,
		title,
		body,
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: actor ?? "system",
		createdAt: timestamp,
		updatedAt: timestamp,
	});

	const fabricMeta = {
		betId,
		hypothesis: hypothesisSnapshot,
		verdict,
		validatedAt: timestamp,
		validatedBy: actor ?? null,
	};

	await db.insert(knowledgeAppProjection).values({
		id: generateId(),
		knowledgeItemId: retroKnowledgeItemId,
		layer: null,
		kind: "reflection",
		meta: JSON.stringify(fabricMeta),
	});
}

// ---------------------------------------------------------------------------
// AccessLog operations
// ---------------------------------------------------------------------------

export interface RecordKnowledgeAccessInput {
	readonly itemId: string;
	readonly accessorKind: string;
	readonly accessorId: string;
	readonly accessedAt: string;
}

/**
 * Append an access-log entry. Best-effort — caller keeps the try/catch.
 */
export async function recordKnowledgeAccess(
	db: HyperIdleDb,
	input: RecordKnowledgeAccessInput,
): Promise<void> {
	await db.insert(knowledgeAccessLog).values({
		id: generateId(),
		itemId: input.itemId,
		accessorKind: input.accessorKind,
		accessorId: input.accessorId,
		accessedAt: input.accessedAt,
	});
}
