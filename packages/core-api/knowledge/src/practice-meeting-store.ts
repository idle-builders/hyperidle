/**
 * Low-level, transaction-safe raw accessors for `knowledgeItems`/
 * `knowledgeAppProjection`/`knowledgeEditLog` — NOT the general CRUD surface
 * (see `knowledge-repository.ts`'s `create`/`update` for that).
 *
 * @lore AU19 Increment 1j: these exist because `@hyperidle/review`'s
 * `practice-meeting.ts` needs exact control over the caller-supplied clock
 * (`nowMs`, deterministic for tests) and must NOT write `scopeId` onto the
 * kernel `knowledgeItems` row (only onto the `knowledgeAppProjection` row) —
 * both of which `knowledge-repository.ts`'s `create()`/`update()` do
 * differently (fresh `Date.now()` clock internally; `scopeId` written to
 * BOTH the kernel row and the projection row). Reusing those would be a real
 * behavior change, forbidden by this WP's "no behavior change" constraint
 * (architecture §2). These primitives are 1:1 with `practice-meeting.ts`'s
 * pre-migration raw Drizzle calls — only the import path + Table ACL
 * boundary changed (Mechanism A/C), not the SQL shape.
 */
import {
	type HyperIdleDb,
	knowledgeAppProjection,
	knowledgeEditLog,
	knowledgeItems,
} from "@hyperidle/db";
import { and, eq, isNull } from "drizzle-orm";

export interface RawKnowledgeItemInsert {
	readonly id: string;
	readonly topic: string | null;
	readonly title: string;
	readonly body: string;
	readonly format: string;
	readonly status: string;
	readonly version: number;
	readonly updatedBy: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export async function insertKnowledgeItemRaw(
	db: HyperIdleDb,
	input: RawKnowledgeItemInsert,
): Promise<void> {
	await db.insert(knowledgeItems).values({ ...input });
}

export interface RawKnowledgeAppProjectionInsert {
	readonly id: string;
	readonly knowledgeItemId: string;
	readonly layer: string | null;
	readonly kind: string | null;
	readonly scopeId: string | null;
	readonly meta: string | null;
}

export async function insertKnowledgeAppProjectionRaw(
	db: HyperIdleDb,
	input: RawKnowledgeAppProjectionInsert,
): Promise<void> {
	await db.insert(knowledgeAppProjection).values({ ...input });
}

export interface RawKnowledgeEditLogInsert {
	readonly id: string;
	readonly itemId: string;
	readonly editor: string;
	readonly field: string;
	readonly oldValue: string | null;
	readonly newValue: string | null;
	readonly editType: string;
	readonly createdAt: string;
}

export async function insertKnowledgeEditLogRaw(
	db: HyperIdleDb,
	input: RawKnowledgeEditLogInsert,
): Promise<void> {
	await db.insert(knowledgeEditLog).values({ ...input });
}

export interface RawKnowledgeItemRow {
	readonly id: string;
	readonly status: string;
}

/** Full kernel row by id, or `null` — mirrors `knowledge-repository.ts`'s `findById`. */
export async function findKnowledgeItemByIdRaw(
	db: HyperIdleDb,
	id: string,
): Promise<RawKnowledgeItemRow | null> {
	const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).limit(1);
	return row ?? null;
}

export interface KnowledgeAppProjectionRow {
	readonly id: string;
	readonly knowledgeItemId: string;
	readonly layer: string | null;
	readonly scopeId: string | null;
	readonly kind: string | null;
	readonly meta: string | null;
}

export async function findKnowledgeAppProjectionByItemIdRaw(
	db: HyperIdleDb,
	knowledgeItemId: string,
): Promise<KnowledgeAppProjectionRow | null> {
	const [row] = await db
		.select()
		.from(knowledgeAppProjection)
		.where(eq(knowledgeAppProjection.knowledgeItemId, knowledgeItemId))
		.limit(1);
	return row ?? null;
}

/**
 * Conditional projection-meta UPDATE (optimistic concurrency pin) — mirrors
 * `practice-meeting.ts`'s per-turn anchor race guard exactly. Returns the
 * number of rows updated (`0` means the caller lost the race).
 */
export async function updateKnowledgeAppProjectionMetaIfUnchangedRaw(
	db: HyperIdleDb,
	knowledgeItemId: string,
	newMeta: string,
	expectedMeta: string,
): Promise<number> {
	const rows = await db
		.update(knowledgeAppProjection)
		.set({ meta: newMeta })
		.where(
			and(
				eq(knowledgeAppProjection.knowledgeItemId, knowledgeItemId),
				eq(knowledgeAppProjection.meta, expectedMeta),
			),
		)
		.returning({ id: knowledgeAppProjection.id });
	return rows.length;
}

export async function touchKnowledgeItemUpdatedAtRaw(
	db: HyperIdleDb,
	id: string,
	updatedAt: string,
): Promise<void> {
	await db.update(knowledgeItems).set({ updatedAt }).where(eq(knowledgeItems.id, id));
}

export interface CapturedProjectedItem {
	readonly item: RawKnowledgeItemRow;
	readonly fabric: KnowledgeAppProjectionRow;
}

/**
 * Turn-3 candidate query: `captured` items whose projection `scopeId`
 * matches (nullable — `null` means "no scope", matched via `IS NULL`, never
 * `= NULL`, per SQL three-valued logic).
 */
export async function listCapturedItemsByProjectionScopeRaw(
	db: HyperIdleDb,
	scopeId: string | null,
): Promise<readonly CapturedProjectedItem[]> {
	const scopeFilter =
		scopeId === null
			? isNull(knowledgeAppProjection.scopeId)
			: eq(knowledgeAppProjection.scopeId, scopeId);
	return db
		.select({ item: knowledgeItems, fabric: knowledgeAppProjection })
		.from(knowledgeItems)
		.innerJoin(
			knowledgeAppProjection,
			eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
		)
		.where(and(eq(knowledgeItems.status, "captured"), scopeFilter));
}

export interface ArchiveKnowledgeItemInput {
	readonly id: string;
	readonly oldStatus: string;
	readonly updatedAt: string;
	readonly updatedBy: string;
	readonly editLogId: string;
}

/** Archive a knowledge item (status→archived) + write its edit-log row, atomically-ordered. */
export async function archiveKnowledgeItemWithLogRaw(
	db: HyperIdleDb,
	input: ArchiveKnowledgeItemInput,
): Promise<void> {
	await db
		.update(knowledgeItems)
		.set({ status: "archived", updatedAt: input.updatedAt, updatedBy: input.updatedBy })
		.where(eq(knowledgeItems.id, input.id));
	await db.insert(knowledgeEditLog).values({
		id: input.editLogId,
		itemId: input.id,
		editor: input.updatedBy,
		field: "status",
		oldValue: input.oldStatus,
		newValue: "archived | reason: synthesized into practice meeting output",
		editType: "refinement",
		createdAt: input.updatedAt,
	});
}
