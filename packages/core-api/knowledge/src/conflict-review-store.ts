/**
 * `knowledgeConflicts` accessors for `create_conflict_review` (AU19
 * Increment 4 — `tools/create-conflict-review.ts` moves into the guarded
 * `tool-handlers` package, surfacing its direct `knowledgeConflicts`/
 * `knowledgeItems` table access as a Table ACL violation for real).
 */
import { type HyperIdleDb, knowledgeConflicts, knowledgeItems } from "@hyperidle/db";
import { and, eq } from "drizzle-orm";

export interface KnowledgeItemVersionRow {
	readonly id: string;
	readonly version: number;
}

/** Read just the `version` column of a `knowledgeItems` row (the sole field `create_conflict_review` needs from a full read). */
export async function findKnowledgeItemVersionById(
	db: HyperIdleDb,
	id: string,
): Promise<KnowledgeItemVersionRow | undefined> {
	const [row] = await db
		.select({ id: knowledgeItems.id, version: knowledgeItems.version })
		.from(knowledgeItems)
		.where(eq(knowledgeItems.id, id))
		.limit(1);
	return row;
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
