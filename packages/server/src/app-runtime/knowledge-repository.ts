/**
 * @lore O2: knowledge-repository updated for kernel/strategy separation.
 * - knowledgeItems table no longer has layer, scopeId, kind, attentionScore,
 *   relevanceScore, citationCount, lastCitedAt, confidence, meta columns.
 * - These fields are now stored in knowledgeAppProjection (extension table).
 * - create() inserts into both tables; update() updates both tables;
 *   list() JOINs against extension table for filter/sort on strategy fields.
 * - KnowledgeItem type is augmented with optional strategy fields from the
 *   extension table via KnowledgeItemWithFabric.
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
	 * (a kernel status) without polluting the fabric's 7-state promotion
	 * pipeline enum. "draft" items are triage items that live on the kernel
	 * until promoted to fabric statuses (active/captured/...) by a facilitator.
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
 * Augments the kernel KnowledgeItem with strategy-layer fields from the
 * knowledgeAppProjection extension table.
 *
 * @lore AF3: Do NOT redeclare fields already on KnowledgeItem (scopeId, etc.) —
 * TS2430 fires if an optional override conflicts with a required base property.
 * Only declare NEW fields from knowledgeAppProjection here.
 */
export interface KnowledgeItemWithFabric extends KnowledgeItem {
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
 * Fetch the fabric extension row for a knowledge item, or null if not found.
 */
async function getFabricRow(
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
 * Merge kernel item with its strategy fabric extension row.
 */
function mergeWithFabric(
	item: KnowledgeItem,
	fabric: typeof knowledgeAppProjection.$inferSelect | null,
): KnowledgeItemWithFabric {
	if (!fabric) return item;
	return {
		...item,
		layer: fabric.layer,
		scopeId: fabric.scopeId,
		kind: fabric.kind,
		attentionScore: fabric.attentionScore,
		confidence: fabric.confidence,
		meta: fabric.meta,
	};
}

export async function create(
	db: HyperIdleDb,
	input: CreateKnowledgeItemInput,
): Promise<KnowledgeItemWithFabric> {
	const id = generateId();
	const timestamp = now();

	// Insert into kernel table (strategy fields excluded, except scopeKind/scopeId
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

	// Insert into strategy extension table
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
	const fabricRow = await getFabricRow(db, id);
	return mergeWithFabric(created, fabricRow);
}

export async function getById(
	db: HyperIdleDb,
	id: string,
): Promise<KnowledgeItemWithFabric | null> {
	const [item] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).limit(1);
	if (!item) return null;
	const fabricRow = await getFabricRow(db, id);
	return mergeWithFabric(item, fabricRow);
}

/**
 * Allow-list of caller-mutable fields for the kernel table.
 * @lore O2: Strategy fields (layer, scopeId, kind, attentionScore, confidence, meta)
 * are removed from the kernel EDITABLE_FIELDS and written to the extension table instead.
 */
const KERNEL_EDITABLE_FIELDS = ["topic", "title", "body", "format", "status", "updatedBy"] as const;

const FABRIC_EDITABLE_FIELDS = [
	"layer",
	"scopeId",
	"kind",
	"attentionScore",
	"confidence",
	"meta",
] as const;

interface DiffResult {
	readonly kernelChanges: Record<string, unknown>;
	readonly fabricChanges: Record<string, unknown>;
	readonly editLogEntries: ReadonlyArray<typeof knowledgeEditLog.$inferInsert>;
}

/** Build the safe-changes payload + per-field edit-log rows. */
function buildDiff(
	itemId: string,
	existing: KnowledgeItemWithFabric,
	changes: UpdateKnowledgeItemInput,
	timestamp: string,
): DiffResult {
	const editLogEntries: Array<typeof knowledgeEditLog.$inferInsert> = [];
	const kernelChanges: Record<string, unknown> = {};
	const fabricChanges: Record<string, unknown> = {};

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

	for (const field of FABRIC_EDITABLE_FIELDS) {
		if (!(field in changes) || changes[field] === undefined) continue;
		const oldVal = existing[field];
		const newVal = changes[field];
		// Store numeric fields as strings in the extension table
		fabricChanges[field] =
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

	return { kernelChanges, fabricChanges, editLogEntries };
}

export async function update(
	db: HyperIdleDb,
	id: string,
	changes: UpdateKnowledgeItemInput,
	expectedVersion: number,
): Promise<KnowledgeItemWithFabric> {
	// @lore N1/O2: PGlite uses async transactions. The transaction callback must
	// be async. All inner DB calls are awaited.
	const result = await db.transaction(
		async (tx): Promise<{ updated: KnowledgeItemWithFabric; newVersion: number }> => {
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

			const [fabricRow] = await tx
				.select()
				.from(knowledgeAppProjection)
				.where(eq(knowledgeAppProjection.knowledgeItemId, id))
				.limit(1);
			const existingWithFabric = mergeWithFabric(existing, fabricRow ?? null);

			const timestamp = now();
			const newVersion = existing.version + 1;
			const { kernelChanges, fabricChanges, editLogEntries } = buildDiff(
				id,
				existingWithFabric,
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

			// Update extension table if there are fabric changes
			if (Object.keys(fabricChanges).length > 0) {
				const [existingFabric] = await tx
					.select({ id: knowledgeAppProjection.id })
					.from(knowledgeAppProjection)
					.where(eq(knowledgeAppProjection.knowledgeItemId, id))
					.limit(1);
				if (existingFabric) {
					await tx
						.update(knowledgeAppProjection)
						.set(fabricChanges)
						.where(eq(knowledgeAppProjection.knowledgeItemId, id));
				} else {
					// Create extension row if it doesn't exist
					await tx.insert(knowledgeAppProjection).values({
						id: generateId(),
						knowledgeItemId: id,
						...fabricChanges,
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
			const [updatedFabric] = await tx
				.select()
				.from(knowledgeAppProjection)
				.where(eq(knowledgeAppProjection.knowledgeItemId, id))
				.limit(1);
			return { updated: mergeWithFabric(updated, updatedFabric ?? null), newVersion };
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
): Promise<KnowledgeItemWithFabric[]> {
	// For filters on strategy fields (layer, scopeId, kind), we need to JOIN with
	// the extension table. Start with a base query that always includes the JOIN.
	const hasStrategyFilter =
		filters.layer !== undefined || filters.scopeId !== undefined || filters.kind !== undefined;

	const limit = filters.limit ?? 50;
	const offset = filters.offset ?? 0;

	if (!hasStrategyFilter) {
		// Simple case: no strategy filters — just query kernel table
		const kernelConditions = [];
		if (filters.topic !== undefined) {
			kernelConditions.push(eq(knowledgeItems.topic, filters.topic));
		}

		let query = db.select().from(knowledgeItems).$dynamic();
		if (kernelConditions.length > 0) {
			query = query.where(and(...kernelConditions));
		}
		const rows = await query.limit(limit).offset(offset);

		const result: KnowledgeItemWithFabric[] = [];
		for (const item of rows) {
			const fabric = await getFabricRow(db, item.id);
			result.push(mergeWithFabric(item, fabric));
		}
		return result;
	}

	// Strategy filters: JOIN with extension table
	// @lore O2: strategy filter queries must JOIN with knowledgeAppProjection.
	// The JOIN is INNER (not LEFT) when strategy fields are required filters,
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
		.select({ item: knowledgeItems, fabric: knowledgeAppProjection })
		.from(knowledgeItems)
		.innerJoin(
			knowledgeAppProjection,
			eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
		)
		.where(and(...conditions))
		.limit(limit)
		.offset(offset);

	return rows.map(({ item, fabric }) => mergeWithFabric(item, fabric));
}

export async function search(
	db: HyperIdleDb,
	query: string,
	options: FtsSearchOptions = {},
): Promise<KnowledgeItemWithFabric[]> {
	const ids = await ftsSearch(db, query, options);
	if (ids.length === 0) {
		return [];
	}

	// Fetch items in the order returned by FTS (ranked by relevance)
	const items: KnowledgeItemWithFabric[] = [];
	for (const id of ids) {
		const [item] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).limit(1);
		if (item) {
			const fabric = await getFabricRow(db, id);
			items.push(mergeWithFabric(item, fabric));
		}
	}

	return items;
}
