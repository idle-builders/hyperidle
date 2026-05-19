import {
	type HyperIdleDb,
	type KnowledgeItem,
	knowledgeEditLog,
	knowledgeItems,
} from "@hyperidle/db";
import type { KnowledgeFormat } from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import { ItemDeletedError, VersionConflictError } from "./errors.js";
import { getKnowledgeEvents, KnowledgeEventType } from "./events.js";
import { type FtsSearchOptions, ftsSearch } from "./fts.js";
import type { KnowledgeKind, KnowledgeLayer, KnowledgeStatus } from "./types.js";

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
	getKnowledgeEvents().emit(KnowledgeEventType.UPDATED, {
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

/**
 * Allow-list of caller-mutable fields. @lore I3 review sec HIGH-3:
 * explicit pick (no `...changes` spread). A JS caller passing a
 * runtime-extra `version` field via UpdateKnowledgeItemInput would
 * otherwise pin the version low, enabling replay attacks against the
 * optimistic-lock check.
 */
const EDITABLE_FIELDS = [
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

interface DiffResult {
	readonly safeChanges: Record<string, unknown>;
	readonly editLogEntries: ReadonlyArray<typeof knowledgeEditLog.$inferInsert>;
}

/** Build the safe-changes payload + per-field edit-log rows. */
function buildDiff(
	itemId: string,
	existing: KnowledgeItem,
	changes: UpdateKnowledgeItemInput,
	timestamp: string,
): DiffResult {
	const editLogEntries: Array<typeof knowledgeEditLog.$inferInsert> = [];
	const safeChanges: Record<string, unknown> = {};
	for (const field of EDITABLE_FIELDS) {
		if (!(field in changes) || changes[field] === undefined) continue;
		const oldVal = existing[field];
		const newVal = changes[field];
		safeChanges[field] = newVal;
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
	return { safeChanges, editLogEntries };
}

export function update(
	db: HyperIdleDb,
	id: string,
	changes: UpdateKnowledgeItemInput,
	expectedVersion: number,
): KnowledgeItem {
	// @lore I3 review sec HIGH-3: the entire optimistic-lock dance —
	// SELECT, UPDATE-with-version-predicate, edit-log INSERTs, read-back —
	// runs inside a single transaction so a crash between UPDATE and
	// edit-log INSERT can't persist the version bump without provenance.
	// `db.transaction` on better-sqlite3 issues BEGIN IMMEDIATE which
	// serialises writes — the version-check is atomic.
	const result = db.transaction((tx) => {
		const existing = tx.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).get();

		if (!existing) {
			throw new Error(`Knowledge item ${id} not found`);
		}
		if (existing.version !== expectedVersion) {
			throw new VersionConflictError(id, existing.version);
		}

		const timestamp = now();
		const newVersion = existing.version + 1;
		const { safeChanges, editLogEntries } = buildDiff(id, existing, changes, timestamp);

		// @lore I3 optimistic locking (TRACK-I.md L141-144): predicate the
		// UPDATE on the expected version. The JS-side check catches the
		// *sequential* stale case; this SQL-side predicate catches the
		// *racy* TOCTOU case. Inside a transaction the two are equivalent
		// but we keep both for defence-in-depth.
		const updateResult = tx
			.update(knowledgeItems)
			.set({
				...safeChanges,
				version: newVersion,
				updatedAt: timestamp,
			})
			.where(and(eq(knowledgeItems.id, id), eq(knowledgeItems.version, expectedVersion)))
			.run();

		if (updateResult.changes === 0) {
			// @lore I3 review W1: distinguish "row deleted concurrently"
			// from "version conflict". Pre-fix this fell back to
			// `current?.version ?? expectedVersion` which silently masked
			// deletion as a conflict reporting the caller's own version.
			const current = tx.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).get();
			if (!current) throw new ItemDeletedError(id);
			throw new VersionConflictError(id, current.version);
		}

		// Insert edit log entries (only after successful UPDATE).
		for (const entry of editLogEntries) {
			tx.insert(knowledgeEditLog).values(entry).run();
		}

		const updated = tx.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).get();
		if (!updated) {
			throw new Error(`Failed to read back updated knowledge item ${id}`);
		}
		return { updated, newVersion };
	});

	// Emit event AFTER the transaction commits — observers must not see
	// the new version while the txn is still open (they could read the
	// not-yet-committed version on a connection without snapshot
	// isolation).
	getKnowledgeEvents().emit(KnowledgeEventType.UPDATED, {
		type: KnowledgeEventType.UPDATED,
		itemId: id,
		version: result.newVersion,
	});

	return result.updated;
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
