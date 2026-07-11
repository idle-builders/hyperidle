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
	knowledgeAppProjection,
	knowledgeEditLog,
	knowledgeItems,
} from "@hyperidle/db";

import type { KernelKnowledgeStatus, KnowledgeFormat } from "@hyperidle/shared";

import { and, eq } from "drizzle-orm";
import { ItemDeletedError, VersionConflictError } from "./errors.js";
import { getKnowledgeEvents, KnowledgeEventType } from "./events.js";
import { type FtsSearchOptions, ftsSearch } from "./fts.js";
import type { KnowledgeKind, KnowledgeLayer, KnowledgeStatus } from "./types.js";

export interface CreateKnowledgeItemInput {
	layer: KnowledgeLayer;
	/** @lore R7: scopeKind written to the kernel table so items are queryable by
	 * scope without a JOIN against the extension table. Defaults to "factory"
	 * when not provided (preserves existing behavior for callers that don't set scope). */
	scopeKind?: string | null;
	scopeId?: string | null;
	kind: KnowledgeKind;
	topic?: string | null;
	title: string;
	body: string;
	format: KnowledgeFormat;
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
	format?: KnowledgeFormat;
	status?: KnowledgeStatus;
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
		kind: input.kind,
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

	// Emit event
	getKnowledgeEvents().emit(KnowledgeEventType.UPDATED, {
		type: KnowledgeEventType.UPDATED,
		itemId: id,
		version: 1,
	});

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

	// Emit event AFTER the transaction commits
	getKnowledgeEvents().emit(KnowledgeEventType.UPDATED, {
		type: KnowledgeEventType.UPDATED,
		itemId: id,
		version: result.newVersion,
	});

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
