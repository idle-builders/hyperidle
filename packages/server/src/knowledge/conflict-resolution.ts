import { type HyperIdleDb, knowledgeConflicts } from "@hyperidle/db";
import { and, eq } from "drizzle-orm";
import type {
	KnowledgeItemWithProjection,
	UpdateKnowledgeItemInput,
} from "./knowledge-repository.js";
import * as repo from "./knowledge-repository.js";
import type { KnowledgeKind, KnowledgeStatus } from "./types.js";

// --- Types ---

const STRUCTURED_KINDS: ReadonlySet<KnowledgeKind> = new Set([
	"pattern",
	"anti_pattern",
	"decision",
	"failure",
]);

export interface ConcurrentEdit {
	changes: UpdateKnowledgeItemInput;
	version: number;
	editor: string;
	timestamp: string;
}

export interface FieldConflict {
	field: string;
	winnerValue: string | number | null | undefined;
	winnerEditor: string;
	loserValue: string | number | null | undefined;
	loserEditor: string;
}

export interface MergeResult {
	merged: UpdateKnowledgeItemInput;
	fieldConflicts: FieldConflict[];
}

export interface ConflictResult {
	/** True if edits were merged (structured). False if escalated (prose). */
	merged: boolean;
	/** Field-level conflicts that were auto-resolved or escalated. */
	conflicts: FieldConflict[];
	/** The updated item after resolution (if merged). */
	item: KnowledgeItemWithProjection | null;
}

// --- Helpers ---

function isStructuredKind(kind: string): boolean {
	return STRUCTURED_KINDS.has(kind as KnowledgeKind);
}

function generateId(): string {
	return crypto.randomUUID();
}

function now(): string {
	return new Date().toISOString();
}

// --- Core merge logic ---

/** Per-field last-writer-wins merge for structured items. */
export function mergeStructuredEdits(
	_existing: Record<string, unknown>,
	edits: Array<{ changes: UpdateKnowledgeItemInput; editor: string; timestamp: string }>,
): MergeResult {
	// Track per-field: which edit last wrote to it
	const fieldWinners = new Map<string, { value: unknown; editor: string; timestamp: string }>();
	const fieldAll = new Map<string, Array<{ value: unknown; editor: string; timestamp: string }>>();

	for (const edit of edits) {
		for (const [field, value] of Object.entries(edit.changes)) {
			if (value === undefined) continue;

			if (!fieldAll.has(field)) {
				fieldAll.set(field, []);
			}
			const arr = fieldAll.get(field);
			if (arr) {
				arr.push({ value, editor: edit.editor, timestamp: edit.timestamp });
			}

			const current = fieldWinners.get(field);
			if (!current || edit.timestamp > current.timestamp) {
				fieldWinners.set(field, { value, editor: edit.editor, timestamp: edit.timestamp });
			}
		}
	}

	const merged: UpdateKnowledgeItemInput = {};
	const fieldConflicts: FieldConflict[] = [];

	for (const [field, winner] of fieldWinners) {
		const allEditsForField = fieldAll.get(field) ?? [];

		// Apply winner
		(merged as Record<string, unknown>)[field] = winner.value;

		// If multiple edits touched this field, record the conflict
		if (allEditsForField.length > 1) {
			// Find the loser (the one that isn't the winner)
			const losers = allEditsForField.filter(
				(e) => e.editor !== winner.editor || e.timestamp !== winner.timestamp,
			);
			for (const loser of losers) {
				fieldConflicts.push({
					field,
					winnerValue: winner.value as string | number | null | undefined,
					winnerEditor: winner.editor,
					loserValue: loser.value as string | number | null | undefined,
					loserEditor: loser.editor,
				});
			}
		}
	}

	return { merged, fieldConflicts };
}

// --- Main entry points ---

/** Resolve concurrent edits to a knowledge item. */
export async function resolveConflict(
	db: HyperIdleDb,
	itemId: string,
	edits: ConcurrentEdit[],
): Promise<ConflictResult> {
	const item = await repo.getById(db, itemId);
	if (!item) {
		throw new Error(`Knowledge item ${itemId} not found`);
	}

	// @lore O2: kind is now optional on KnowledgeItemWithProjection (from app projection).
	// Items without a projection row have kind=undefined/null -> treated as unstructured.
	if (item.kind != null && isStructuredKind(item.kind)) {
		return resolveStructured(db, item, edits);
	}
	return resolveProse(db, item, edits);
}

async function resolveStructured(
	db: HyperIdleDb,
	item: KnowledgeItemWithProjection,
	edits: ConcurrentEdit[],
): Promise<ConflictResult> {
	const existing: Record<string, unknown> = {
		title: item.title,
		body: item.body,
		topic: item.topic,
		// @lore O2: meta is from the app projection table (optional).
		meta: item.meta ?? null,
		status: item.status,
	};

	const mergeInputs = edits.map((e) => ({
		changes: e.changes,
		editor: e.editor,
		timestamp: e.timestamp,
	}));

	const { merged, fieldConflicts } = mergeStructuredEdits(existing, mergeInputs);

	// Apply merged changes
	const updatedItem = await repo.update(db, item.id, merged, item.version);

	// Create conflict records for any field-level conflicts (auto-resolved via LWW)
	for (const fc of fieldConflicts) {
		await db.insert(knowledgeConflicts).values({
			id: generateId(),
			itemId: item.id,
			versionBase: item.version,
			versionCurrent: updatedItem.version,
			proposedBody: JSON.stringify({ field: fc.field, value: fc.loserValue }),
			proposedBy: fc.loserEditor,
			status: "resolved",
			createdAt: now(),
		});
	}

	return {
		merged: true,
		conflicts: fieldConflicts,
		item: updatedItem,
	};
}

async function resolveProse(
	db: HyperIdleDb,
	item: KnowledgeItemWithProjection,
	edits: ConcurrentEdit[],
): Promise<ConflictResult> {
	// Sort by timestamp ascending - older first
	const sorted = [...edits].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
	const older = sorted[0];
	const newer = sorted[1];

	if (!(older && newer)) {
		throw new Error("Prose conflict resolution requires exactly 2 edits");
	}

	// Apply the older version (keep it active)
	const updatedItem = await repo.update(db, item.id, older.changes, item.version);

	// Store newer as conflict record with status 'open'
	const conflictField: FieldConflict = {
		field: "body",
		winnerValue: older.changes.body,
		winnerEditor: older.editor,
		loserValue: newer.changes.body,
		loserEditor: newer.editor,
	};

	await db.insert(knowledgeConflicts).values({
		id: generateId(),
		itemId: item.id,
		versionBase: item.version,
		versionCurrent: updatedItem.version,
		proposedBody: newer.changes.body ?? JSON.stringify(newer.changes),
		proposedBy: newer.editor,
		status: "open",
		createdAt: now(),
	});

	return {
		merged: false,
		conflicts: [conflictField],
		item: updatedItem,
	};
}

/** Check whether an item can be promoted (no open conflicts). */
export async function canPromote(db: HyperIdleDb, itemId: string): Promise<boolean> {
	const openConflicts = await db
		.select()
		.from(knowledgeConflicts)
		.where(and(eq(knowledgeConflicts.itemId, itemId), eq(knowledgeConflicts.status, "open")));

	return openConflicts.length === 0;
}

/** Mark a conflict record as resolved, writing the resolution text and timestamp. */
export async function resolveConflictRecord(
	db: HyperIdleDb,
	conflictId: string,
	resolution: string,
): Promise<void> {
	// @lore I6: previously ignored the resolution parameter. Now writes it to
	// resolvedBy (used for both human name and system resolution text) and
	// sets resolvedAt to the current timestamp.
	await db
		.update(knowledgeConflicts)
		.set({
			status: "resolved",
			resolvedBy: resolution,
			resolvedAt: new Date().toISOString(),
		})
		.where(eq(knowledgeConflicts.id, conflictId));
}

/** Promote an item to a target status. Fails if open conflicts exist. */
export async function promote(
	db: HyperIdleDb,
	itemId: string,
	targetStatus: KnowledgeStatus,
): Promise<KnowledgeItemWithProjection> {
	if (!(await canPromote(db, itemId))) {
		throw new Error(`Cannot promote item ${itemId}: open conflict(s) exist`);
	}

	const item = await repo.getById(db, itemId);
	if (!item) {
		throw new Error(`Knowledge item ${itemId} not found`);
	}

	return repo.update(db, itemId, { status: targetStatus }, item.version);
}
