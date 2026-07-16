/**
 * Low-level write accessor for `knowledgeConflicts` — NOT the general CRUD
 * surface (see `knowledge-repository.ts`).
 *
 * @lore AU19 Increment 3f: `@hyperidle/capture-writeback`'s `writeback.ts`
 * used to `db.insert(knowledgeConflicts).values(...)` directly, TWICE (the
 * modify-conflict branch, the delete-flag-for-review branch) — legal while
 * `writeback.ts` still lived in the unguarded `packages/server` composition
 * root, a Table ACL violation the moment it becomes its own Service package
 * (`knowledgeConflicts` is `knowledge`'s `TABLE_OWNER`). Both call sites had
 * an identical insert shape (id/itemId/versionBase/versionCurrent/
 * proposedBody/proposedBy/status="open"/createdAt) — unified into this one
 * accessor rather than ported as two near-duplicate raw inserts. Same
 * "genuinely NEW edge the census undercounted" shape as `git-export-store.ts`
 * (Increment 2c): the original §10.2 census listed `capture-writeback ->
 * knowledge` as 2 call sites (`create`/`update`) — this migration surfaces a
 * THIRD, `recordWritebackConflict`. See `@hyperidle/capture-writeback`'s
 * `ports.ts` top `@lore` for the port side of this edge.
 */
import * as crypto from "node:crypto";
import { type HyperIdleDb, knowledgeConflicts } from "@hyperidle/db";

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
		id: crypto.randomUUID(),
		itemId: input.itemId,
		versionBase: input.versionBase,
		versionCurrent: input.versionCurrent,
		proposedBody: input.proposedBody,
		proposedBy: input.proposedBy,
		status: "open",
		createdAt: new Date().toISOString(),
	});
}
