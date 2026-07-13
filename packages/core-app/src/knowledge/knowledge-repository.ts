/**
 * @lore O2: knowledge-repository split canonical item rows from app projection rows.
 * - knowledgeItems table no longer has layer, scopeId, kind, attentionScore,
 *   relevanceScore, citationCount, lastCitedAt, confidence, meta columns.
 * - These fields are now stored in knowledgeAppProjection (extension table).
 * - create() inserts into both tables; update() updates both tables;
 *   list() JOINs against extension table for filter/sort on projection fields.
 * - KnowledgeItem type is augmented with optional projection fields from the
 *   extension table via KnowledgeItemWithProjection.
 */
import {
	type HyperIdleDb,
	type KnowledgeItem,
	knowledgeAccessLog,
	knowledgeAppProjection,
	knowledgeEditLog,
	knowledgeItems,
} from "@hyperidle/db";

import { type KernelKnowledgeStatus, type SCOPE_KINDS, scopeToLayer } from "@hyperidle/shared";

import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { escapeLikePattern } from "../services/like-escape.js";
import { ItemDeletedError, VersionConflictError } from "./errors.js";
import { type FtsSearchOptions, ftsSearch } from "./fts.js";
import type { KnowledgeKind, KnowledgeLayer, KnowledgeStatus } from "./types.js";

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

export interface ListFilters {
	layer?: KnowledgeLayer;
	scopeId?: string;
	kind?: KnowledgeKind;
	topic?: string;
	limit?: number;
	offset?: number;
}

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

export async function list(
	db: HyperIdleDb,
	filters: ListFilters = {},
): Promise<KnowledgeItemWithProjection[]> {
	// For filters on projection fields (layer, scopeId, kind), we need to JOIN with
	// the extension table. Start with a base query that always includes the JOIN.
	const hasProjectionFilter =
		filters.layer !== undefined || filters.scopeId !== undefined || filters.kind !== undefined;

	const limit = filters.limit ?? 50;
	const offset = filters.offset ?? 0;

	if (!hasProjectionFilter) {
		// Simple case: no projection filters — just query canonical table.
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
	// The JOIN is INNER (not LEFT) when projection fields are required filters,
	// so items without extension rows are excluded from filtered results.
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

export async function search(
	db: HyperIdleDb,
	query: string,
	options: FtsSearchOptions = {},
): Promise<KnowledgeItemWithProjection[]> {
	const ids = await ftsSearch(db, query, options);
	if (ids.length === 0) {
		return [];
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

// ---------------------------------------------------------------------------
// AU14 round 2 — additional read surface for routes/knowledge.ts's GET
// handlers + the write handlers' own kernel-row pre-checks/re-selects.
// See plans/AU14/architecture-round2.md §6. Deliberately new functions
// (not extensions of list()/search() above) so the existing non-HTTP
// callers of list()/search() (context-assembly.ts, query-practice.ts) see
// zero behavior change (§13).
// ---------------------------------------------------------------------------

export interface KnowledgeListRow {
	item: KnowledgeItem;
	relevanceScore: string | null;
	attentionScore: string | null;
	accessCount30d: number | null;
	lastActivityAt: string | null;
}

export interface KnowledgeDetailRow {
	item: KnowledgeItem;
	kind: string | null;
	layer: string | null;
	confidence: string | null;
	relevanceScore: string | null;
	attentionScore: string | null;
}

/** Fetch a single kernel knowledge item row by id, or null if not found. */
export async function findById(db: HyperIdleDb, id: string): Promise<KnowledgeItem | null> {
	const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).limit(1);
	return row ?? null;
}

/**
 * LIKE-substring search across title/body/topic, exactly as `GET /search`
 * performed inline pre-AU14-round2. NOT the same as `search()` above, which
 * uses FTS `tsvector` (whole-word, title+body only, no topic). Repointing
 * `GET /search` to `search()` would silently drop topic matches and turn
 * substring matching into word matching — a forbidden behavior change that
 * would also change `tools/query-practice.ts`'s FTS-ranked results.
 */
export function searchByText(db: HyperIdleDb, query: string): Promise<KnowledgeItem[]> {
	const pattern = `%${escapeLikePattern(query)}%`;
	return db
		.select()
		.from(knowledgeItems)
		.where(
			and(
				or(
					sql`${knowledgeItems.title} LIKE ${pattern} ESCAPE '\\'`,
					sql`${knowledgeItems.body} LIKE ${pattern} ESCAPE '\\'`,
					sql`${knowledgeItems.topic} LIKE ${pattern} ESCAPE '\\'`,
				),
			),
		);
}

/**
 * `GET /` read: all items visible to `viewerUserId` (Q2), LEFT JOINed with
 * the app projection for relevanceScore/attentionScore, plus L22 access
 * signals (30-day accessCount + lastActivityAt) computed from a single
 * batched `knowledgeAccessLog` query (avoids N+1).
 */
export async function listVisibleWithSignals(
	db: HyperIdleDb,
	viewerUserId: string,
): Promise<KnowledgeListRow[]> {
	const rawItems = await db
		.select({
			item: knowledgeItems,
			relevanceScore: knowledgeAppProjection.relevanceScore,
			attentionScore: knowledgeAppProjection.attentionScore,
		})
		.from(knowledgeItems)
		.leftJoin(knowledgeAppProjection, eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id))
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

/** `GET /triage-count`: count of draft + needs_human items visible to `viewerUserId` (Q2). */
export async function countTriageVisible(db: HyperIdleDb, viewerUserId: string): Promise<number> {
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
 * `GET /:id` detail read: kernel row LEFT JOINed with the app projection.
 * Q2 is NOT applied here — it's a 404 *decision*, not a query filter, and
 * stays route-side (§5).
 */
export async function findDetailById(
	db: HyperIdleDb,
	id: string,
): Promise<KnowledgeDetailRow | null> {
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
		.leftJoin(knowledgeAppProjection, eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id))
		.where(eq(knowledgeItems.id, id))
		.limit(1);
	return row ?? null;
}

/**
 * `GET /:id` AF13 accessCount: count of `knowledgeAccessLog` rows for
 * `itemId` since `sinceIso`. Caller (the route) must run this strictly
 * before the access-log INSERT so the current page-load is excluded.
 */
export async function countAccessesSince(
	db: HyperIdleDb,
	itemId: string,
	sinceIso: string,
): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)` })
		.from(knowledgeAccessLog)
		.where(
			and(
				eq(knowledgeAccessLog.itemId, itemId),
				sql`${knowledgeAccessLog.accessedAt} >= ${sinceIso}`,
			),
		);
	return Number(row?.count ?? 0);
}

/** `GET /:id` AF13 relatedItems: same-topic items visible to `opts.viewerUserId` (Q2), capped. */
export function findRelatedByTopic(
	db: HyperIdleDb,
	opts: { topic: string; excludeId: string; viewerUserId: string; limit: number },
): Promise<Array<{ id: string; title: string }>> {
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

// ---------------------------------------------------------------------------
// AU14 round 2 — the five specialized write handlers' own reads AND writes,
// moved verbatim from routes/knowledge.ts. See plans/AU14/architecture-round2.md
// §7. None of these delegates to create()/update() — each replicates its
// handler's EXACT write sequence (edit-log rows, projection updates, and
// deliberate omissions like "no version bump" / "no create edit-log row")
// because delegating would change observable behavior the WP forbids (§7a).
// ---------------------------------------------------------------------------

/**
 * Write or upsert a knowledgeAppProjection row for the given knowledge item.
 * If a projection row already exists, updates the layer column. If no
 * projection row exists, creates one (layer may be null for bet/team/user/
 * filesystem scopes).
 *
 * @lore AU14 round 2: moved verbatim from routes/knowledge.ts's identically-named
 * helper (deleted there once its callers — scope, split, and round-1 POST — all
 * moved into the repository). Behavior byte-identical to the pre-round-2 route
 * copy — see plans/AU14/architecture-round2.md §7b.
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
 * `PATCH /:id/scope` — replicates the pre-round-2 route's exact write
 * sequence (§7c): conditional scope_kind/scope_id edit-log rows (editType
 * "scope_change", exact `"${scopeKind} (reason: ${reason})"` newValue format
 * on the scope_kind row), version+1, projection-layer upsert. The route
 * keeps the 404 (via findById) and the 409 version pre-check — this function
 * does no version recheck of its own (faithful: the pre-round-2 handler had none).
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
 * `POST /:id/merge` — replicates the pre-round-2 route's exact write
 * sequence (§7c): target body-append + version+1 + updatedBy; source
 * status→archived + updatedBy; two `editType:"merge"` edit-log rows
 * (target's on field "body", source's on field "status"). Non-transactional,
 * as today.
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
 * `POST /:id/split` — replicates the pre-round-2 route's exact write
 * sequence (§7c): N new kernel rows (status "draft", version 1, inheriting
 * the original's scope/format) + a layer-only projection row per new item
 * (via upsertProjectionLayer — scopeId/kind stay null), then archives the
 * original with a single `editType:"split"` edit-log row. Non-transactional,
 * as today.
 *
 * @lore AU14 round 2: deliberately does NOT call create() for the new items.
 * create() would add an unwanted `editType:"create"` edit-log row per new
 * item and populate projection.scopeId/kind — both forbidden behavior
 * changes for split (§7c). This is the single highest-risk divergence in
 * the whole round; net-new test 3 locks it (zero create rows, layer-only
 * projection with scopeId===null).
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
 * `POST /:id/archive` — replicates the pre-round-2 route's exact write
 * sequence (§7c): status→archived + updatedAt ONLY — deliberately NO version
 * bump, NO updatedBy rewrite (unlike update(), which unconditionally bumps
 * version on every call — §7a) — plus one `editType:"archive"` edit-log row.
 */
export async function archiveItem(db: HyperIdleDb, item: KnowledgeItem): Promise<KnowledgeItem> {
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
 * `POST /:id/flag` — replicates the pre-round-2 route's exact write
 * sequence (§7c/§7d): status→draft + updatedAt ONLY — deliberately NO
 * version bump, NO updatedBy rewrite (same reasoning as archiveItem) —
 * plus one `editType:"flag"` edit-log row with the exact
 * `"flagged (reason: ${reason})"` newValue format.
 *
 * @lore AU14 round 2: accepts the CALLER's db/transaction handle and opens
 * NO transaction of its own. The route wraps this call, the knowledgeEditLog
 * insert, and (when agentId is present) recordAgentWorkIntent (an agent-layer
 * write — wrong domain for this repository) in ONE `db.transaction` — the
 * pre-existing cross-domain atomic composition (§7d). Returns void; the route
 * re-fetches via findById after the transaction commits.
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
