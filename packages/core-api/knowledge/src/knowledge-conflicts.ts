/**
 * Conflict accessors for `knowledgeConflicts` — consolidated from the
 * retired per-consumer barrel files `conflict-review-store.ts` and
 * `writeback-conflict-store.ts`.
 *
 * @lore AU20 Ag7a: per-consumer store barrels retired as public surface;
 * their bodies absorbed into appropriate general modules. Conflict operations
 * (from both `create_conflict_review` tool and `capture-writeback` writeback)
 * share the same owned table (`knowledgeConflicts`) and are grouped here.
 */
import { randomUUID } from "node:crypto";
import { type HyperIdleDb, knowledgeConflicts } from "@hyperidle/db";
import { and, eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// From conflict-review-store.ts (tool-handlers -> knowledge edge)
// ---------------------------------------------------------------------------

export interface CreateKnowledgeConflictInput {
	readonly id: string;
	readonly itemId: string;
	readonly versionBase: number;
	readonly versionCurrent: number;
	readonly proposedBody: string;
	readonly proposedMeta: string | null;
	readonly proposedBy: string;
	readonly createdAt: string;
}

/** Insert an open `knowledgeConflicts` row for `create_conflict_review`. */
export async function createKnowledgeConflict(
	db: HyperIdleDb,
	input: CreateKnowledgeConflictInput,
): Promise<void> {
	await db.insert(knowledgeConflicts).values({ ...input, status: "open" });
}

/** Find an open conflict on `itemId` filed by `proposedBy`, or `undefined`. */
export async function findOpenConflictByItemAndProposer(
	db: HyperIdleDb,
	itemId: string,
	proposedBy: string,
): Promise<{ readonly id: string } | undefined> {
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
	return row;
}

// ---------------------------------------------------------------------------
// From writeback-conflict-store.ts (capture-writeback -> knowledge edge)
// ---------------------------------------------------------------------------

export interface RecordWritebackConflictInput {
	readonly itemId: string;
	readonly versionBase: number;
	readonly versionCurrent: number;
	readonly proposedBody: string;
	readonly proposedBy: string;
}

/**
 * Record a `knowledgeConflicts` row flagging a writeback-detected conflict —
 * either a version mismatch on modify, or a deletion pending facilitator
 * review (`proposedBody: "[DELETED]"`). Always `status: "open"`, matching
 * both original inline insert shapes verbatim.
 */
export async function recordWritebackConflict(
	db: HyperIdleDb,
	input: RecordWritebackConflictInput,
): Promise<void> {
	await db.insert(knowledgeConflicts).values({
		id: randomUUID(),
		itemId: input.itemId,
		versionBase: input.versionBase,
		versionCurrent: input.versionCurrent,
		proposedBody: input.proposedBody,
		proposedBy: input.proposedBy,
		status: "open",
		createdAt: new Date().toISOString(),
	});
}
