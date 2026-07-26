/**
 * Conflict accessors for `knowledgeConflicts` — consolidated from the
 * retired per-consumer barrel files `conflict-review-store.ts` and
 * `writeback-conflict-store.ts`.
 *
 * @lore AU20 Ag7a: per-consumer store barrels retired as public surface;
 * their bodies absorbed into appropriate general modules. Conflict operations
 * (from both `create_conflict_review` tool and `capture-writeback` writeback)
 * share the same owned table (`knowledgeConflicts`) and are grouped here.
 *
 * @lore AU20 K2-writes: `createKnowledgeConflict`, `findOpenConflictByItemAndProposer`,
 * and `recordWritebackConflict` (three separate functions with split interfaces)
 * are replaced by two unified functions: `recordConflict` (handles both the
 * tool-side create and the writeback-side create in one interface) and
 * `findOpenConflict` (returns null instead of undefined for idiomatic TS).
 */
import { randomUUID } from "node:crypto";
import { type HyperIdleDb, knowledgeConflicts } from "@hyperidle/db";
import { and, eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Unified conflict write
// ---------------------------------------------------------------------------

/**
 * Input for recording a knowledge conflict.
 * Covers both the `create_conflict_review` tool (explicit id + proposedMeta)
 * and the writeback-conflict path (auto-generated id, no proposedMeta).
 */
export interface RecordConflictInput {
	/** Optional explicit id — auto-generated (randomUUID) when absent. */
	readonly id?: string;
	readonly itemId: string;
	readonly versionBase: number;
	readonly versionCurrent: number;
	readonly proposedBody: string;
	/** Optional meta — null when absent. */
	readonly proposedMeta?: string | null;
	readonly proposedBy: string;
	/** Optional ISO timestamp — current time when absent. */
	readonly createdAt?: string;
}

/**
 * Insert an open `knowledgeConflicts` row.
 * Unified entry point for both `create_conflict_review` and writeback paths.
 */
export async function recordConflict(db: HyperIdleDb, input: RecordConflictInput): Promise<void> {
	await db.insert(knowledgeConflicts).values({
		id: input.id ?? randomUUID(),
		itemId: input.itemId,
		versionBase: input.versionBase,
		versionCurrent: input.versionCurrent,
		proposedBody: input.proposedBody,
		proposedMeta: input.proposedMeta ?? null,
		proposedBy: input.proposedBy,
		status: "open",
		createdAt: input.createdAt ?? new Date().toISOString(),
	});
}

/**
 * Find an open conflict on `itemId` filed by `proposedBy`.
 * Returns `null` when no open conflict exists (idiomatic TypeScript null-for-absent).
 */
export async function findOpenConflict(
	db: HyperIdleDb,
	itemId: string,
	proposedBy: string,
): Promise<{ readonly id: string } | null> {
	const [row] = await db
		.select({ id: knowledgeConflicts.id })
		.from(knowledgeConflicts)
		.where(
			and(
				eq(knowledgeConflicts.itemId, itemId),
				eq(knowledgeConflicts.proposedBy, proposedBy),
				eq(knowledgeConflicts.status, "open"),
			),
		)
		.limit(1);
	return row ?? null;
}
