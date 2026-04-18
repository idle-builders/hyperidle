import {
	type HyperIdleDb,
	type KnowledgeItem,
	knowledgeEditLog,
	knowledgeItems,
} from "@hyperidle/db";
import type {
	KnowledgeFormat,
	KnowledgeKind,
	KnowledgeLayer,
	KnowledgeStatus,
} from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import { VersionConflictError } from "./errors.js";
import { KnowledgeEventType, knowledgeEvents } from "./events.js";
import { type FtsSearchOptions, ftsSearch } from "./fts.js";

export interface CreateKnowledgeItemInput {
	layer: KnowledgeLayer;
	scopeId?: string | null;
	kind: KnowledgeKind;
	topic?: string | null;
	title: string;
	body: string;
	format: KnowledgeFormat;
	status: KnowledgeStatus;
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

function generateId(): string {
	return crypto.randomUUID();
}

function now(): string {
	return new Date().toISOString();
}

export function create(db: HyperIdleDb, input: CreateKnowledgeItemInput): KnowledgeItem {
	const id = generateId();
	const timestamp = now();

	const item: typeof knowledgeItems.$inferInsert = {
		id,
		layer: input.layer,
		scopeId: input.scopeId ?? null,
		kind: input.kind,
		topic: input.topic ?? null,
		title: input.title,
		body: input.body,
		format: input.format,
		status: input.status,
		attentionScore: input.attentionScore ?? null,
		confidence: input.confidence ?? null,
		version: 1,
		updatedBy: input.updatedBy,
		createdAt: timestamp,
		updatedAt: timestamp,
		meta: input.meta ?? null,
	};

	db.insert(knowledgeItems).values(item).run();

	// Edit log for create
	db.insert(knowledgeEditLog)
		.values({
			id: generateId(),
			itemId: id,
			editor: input.updatedBy,
			field: "*",
			oldValue: null,
			newValue: null,
			editType: "create",
			createdAt: timestamp,
		})
		.run();

	// Emit event
	knowledgeEvents.emit(KnowledgeEventType.UPDATED, {
		type: KnowledgeEventType.UPDATED,
		itemId: id,
		version: 1,
	});

	const created = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).get();
	if (!created) {
		throw new Error(`Failed to read back created knowledge item ${id}`);
	}
	return created;
}

export function getById(db: HyperIdleDb, id: string): KnowledgeItem | null {
	const item = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).get();
	return item ?? null;
}

export function update(
	db: HyperIdleDb,
	id: string,
	changes: UpdateKnowledgeItemInput,
	expectedVersion: number,
): KnowledgeItem {
	const existing = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).get();

	if (!existing) {
		throw new Error(`Knowledge item ${id} not found`);
	}

	if (existing.version !== expectedVersion) {
		throw new VersionConflictError(id, existing.version);
	}

	const timestamp = now();
	const newVersion = existing.version + 1;

	// Build edit log entries for changed fields
	const editableFields = [
		"layer",
		"scopeId",
		"kind",
		"topic",
		"title",
		"body",
		"format",
		"status",
		"updatedBy",
		"attentionScore",
		"confidence",
		"meta",
	] as const;

	const editLogEntries: Array<typeof knowledgeEditLog.$inferInsert> = [];

	for (const field of editableFields) {
		if (field in changes && changes[field] !== undefined) {
			const oldVal = existing[field];
			const newVal = changes[field];
			if (oldVal !== newVal) {
				editLogEntries.push({
					id: generateId(),
					itemId: id,
					editor: changes.updatedBy ?? existing.updatedBy,
					field,
					oldValue: oldVal == null ? null : String(oldVal),
					newValue: newVal == null ? null : String(newVal),
					editType: "update",
					createdAt: timestamp,
				});
			}
		}
	}

	// @lore I3 optimistic locking (TRACK-I.md L141-144): predicate the UPDATE
	// on the expected version. Two writers that both observe version N will
	// each issue this UPDATE; only the first commits, the second's
	// `result.changes` is 0 because the WHERE clause no longer matches.
	// The JS-side check above catches the *sequential* stale case; this
	// SQL-side predicate catches the *racy* case where another transaction
	// bumped the row between our SELECT and UPDATE (TOCTOU).
	const result = db
		.update(knowledgeItems)
		.set({
			...changes,
			version: newVersion,
			updatedAt: timestamp,
		})
		.where(and(eq(knowledgeItems.id, id), eq(knowledgeItems.version, expectedVersion)))
		.run();

	if (result.changes === 0) {
		// Row exists (we read it above) but version moved → conflict.
		const current = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).get();
		throw new VersionConflictError(id, current?.version ?? expectedVersion);
	}

	// Insert edit log entries (only after successful UPDATE).
	for (const entry of editLogEntries) {
		db.insert(knowledgeEditLog).values(entry).run();
	}

	// Emit event
	knowledgeEvents.emit(KnowledgeEventType.UPDATED, {
		type: KnowledgeEventType.UPDATED,
		itemId: id,
		version: newVersion,
	});

	const updated = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).get();
	if (!updated) {
		throw new Error(`Failed to read back updated knowledge item ${id}`);
	}
	return updated;
}

export function list(db: HyperIdleDb, filters: ListFilters = {}): KnowledgeItem[] {
	const conditions = [];

	if (filters.layer !== undefined) {
		conditions.push(eq(knowledgeItems.layer, filters.layer));
	}
	if (filters.scopeId !== undefined) {
		conditions.push(eq(knowledgeItems.scopeId, filters.scopeId));
	}
	if (filters.kind !== undefined) {
		conditions.push(eq(knowledgeItems.kind, filters.kind));
	}
	if (filters.topic !== undefined) {
		conditions.push(eq(knowledgeItems.topic, filters.topic));
	}

	const limit = filters.limit ?? 50;
	const offset = filters.offset ?? 0;

	let query = db.select().from(knowledgeItems).$dynamic();

	if (conditions.length > 0) {
		query = query.where(and(...conditions));
	}

	return query.limit(limit).offset(offset).all();
}

export function search(
	db: HyperIdleDb,
	query: string,
	options: FtsSearchOptions = {},
): KnowledgeItem[] {
	const ids = ftsSearch(db, query, options);
	if (ids.length === 0) {
		return [];
	}

	// Fetch items in the order returned by FTS (ranked by relevance)
	const items: KnowledgeItem[] = [];
	for (const id of ids) {
		const item = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).get();
		if (item) {
			items.push(item);
		}
	}

	return items;
}
