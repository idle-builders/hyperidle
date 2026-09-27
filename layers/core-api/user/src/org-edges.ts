/**
 * Shared upsertOrgEdge helper.
 *
 * Idempotent by construction: uses INSERT … ON CONFLICT DO NOTHING against the
 * composite unique index (from_user_id, mechanism, target), then re-selects.
 *
 * @lore AH4: SELECT-then-INSERT was replaced with INSERT … ON CONFLICT DO NOTHING +
 * re-select to prevent TOCTOU under concurrent pg Pool usage. A concurrent
 * insertion between the SELECT and INSERT would previously throw a unique-
 * constraint error; with ON CONFLICT DO NOTHING the concurrent winner is
 * visible on the subsequent re-select and the operation remains idempotent.
 *
 * Callers that accept untrusted target values MUST validate target existence
 * BEFORE calling this (see org.ts PUT /edges which does mechanism-specific checks).
 * Team creation passes a server-generated teamMembersId that was just inserted,
 * so no re-validation is needed at that call site.
 *
 * @lore AU19 Increment 1c: moved unchanged from `packages/server/src/services/
 * org-edges.ts` — no cross-Service imports here (pure `orgEdges` table access),
 * so this file needed zero DI conversion, only its package home changed.
 */

import { type HyperIdleDb, orgEdges } from "@hyperidle/db";
import type { OrgEdgeMechanism } from "@hyperidle/domain-model";
import { and, eq, inArray } from "drizzle-orm";

/**
 * List `orgEdges` rows, optionally filtered by id or by the set of users the
 * edge is FROM.
 *
 * With `filter.id` performs a single-row lookup (replaces the old
 * `getOrgEdgeById`). With `filter.fromUserIds` batches the outgoing edges of
 * several users in one query — `user-actions.ts`'s `search_users`/`open_user`
 * batch this to build each row's `edges` field. Without a filter returns all
 * rows.
 *
 * @lore AU19 Increment 5 item 4 (guard-retirement full-sweep, `org` sub-item):
 * closes `routes/org.ts`'s `GET /` org-chart response.
 * @lore AU20 Am7: `filter.id` folds in `getOrgEdgeById` (the pre-delete
 * existence check) — a single parameterized read replaces two exports.
 * @lore `fromUserIds` added — `open_user`'s "edges are the user's outgoing
 * org_edges" needs one batched read, not N single-user ones.
 */
export function listOrgEdges(
	db: HyperIdleDb,
	filter?: { id?: string; fromUserIds?: readonly string[] },
): Promise<Array<typeof orgEdges.$inferSelect>> {
	if (filter?.id !== undefined) {
		return db.select().from(orgEdges).where(eq(orgEdges.id, filter.id));
	}
	if (filter?.fromUserIds !== undefined) {
		if (filter.fromUserIds.length === 0) return Promise.resolve([]);
		return db
			.select()
			.from(orgEdges)
			.where(inArray(orgEdges.fromUserId, Array.from(filter.fromUserIds)));
	}
	return db.select().from(orgEdges);
}

/**
 * Delete a single `orgEdges` row by its own `id`.
 *
 * @lore AU19 Increment 5 item 4 (guard-retirement full-sweep, `org` sub-item):
 * closes `routes/org.ts`'s `DELETE /edges/:id` write.
 * @lore AU20 Am7: renamed from `deleteOrgEdgeById` — the `ById` suffix is
 * redundant for a function that already takes a plain `id` string.
 */
export async function deleteOrgEdge(db: HyperIdleDb, id: string): Promise<void> {
	await db.delete(orgEdges).where(eq(orgEdges.id, id));
}

export interface UpsertOrgEdgeInput {
	fromUserId: string;
	mechanism: OrgEdgeMechanism;
	target: string;
}

/**
 * Upsert a single org edge, idempotent on (from_user_id, mechanism, target).
 * Returns `created: true` when a new row was inserted, `false` when the row
 * already existed (including when a concurrent insert won the race).
 */
export async function upsertOrgEdge(
	db: HyperIdleDb,
	input: UpsertOrgEdgeInput,
): Promise<{ edge: typeof orgEdges.$inferSelect; created: boolean }> {
	const { fromUserId, mechanism, target } = input;

	const id = crypto.randomUUID();
	const createdAt = new Date().toISOString();

	// INSERT … ON CONFLICT DO NOTHING — idempotent against the composite index.
	// If a concurrent insert races us, this is a no-op and the re-select below
	// returns the winner's row.
	await db
		.insert(orgEdges)
		.values({ id, fromUserId, mechanism, target, createdAt })
		.onConflictDoNothing();

	// Re-select to get the canonical row (ours or the concurrent winner's).
	const [row] = await db
		.select()
		.from(orgEdges)
		.where(
			and(
				eq(orgEdges.fromUserId, fromUserId),
				eq(orgEdges.mechanism, mechanism),
				eq(orgEdges.target, target),
			),
		)
		.limit(1);

	// row is always present: either our insert succeeded, or the concurrent one did.
	const finalRow = row as typeof orgEdges.$inferSelect;
	return { edge: finalRow, created: finalRow.id === id };
}
