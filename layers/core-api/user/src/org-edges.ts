/**
 * Shared upsertOrgEdge helper.
 *
 * Idempotent by construction: uses INSERT … ON CONFLICT DO NOTHING against the
 * composite unique index (from_user_id, mechanism, target), then re-selects.
 *
 * Callers that accept untrusted target values MUST validate target existence
 * BEFORE calling this.
 * Team creation passes a server-generated teamMembersId that was just inserted,
 * so no re-validation is needed at that call site.
 */

import { type HyperIdleDb, orgEdges, users } from "@hyperidle/db";
import type { OrgEdgeMechanism } from "@hyperidle/domain-model";
import { and, eq, inArray, isNotNull } from "drizzle-orm";

/**
 * List `orgEdges` rows, optionally filtered by id or by the set of users the
 * edge is FROM.
 *
 * With `filter.id` performs a single-row lookup. With `filter.fromUserIds`
 * batches the outgoing edges of several users. Without a filter returns all rows.
 *
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

/**
 * The one thing a `discipline` edge is for: every user (human or agent)
 * whose own `discipline` matches `target`, case-insensitively — same rule as
 * `documents.discipline`'s cluster match. Batched over every distinct target
 * a caller names in one query, so `toUserRows` can resolve every user's
 * edges in one call regardless of how many discipline edges are in play.
 *
 * @lore: resolveDisciplineUsers — the only place a discipline edge resolves to people; `toUserRows` is its one caller, feeding `edges[].resolvedUserIds`.
 */
export async function resolveDisciplineUsers(
	db: HyperIdleDb,
	targets: readonly string[],
): Promise<ReadonlyMap<string, readonly string[]>> {
	const byTarget = new Map<string, string[]>();
	if (targets.length === 0) return byTarget;
	const rows = await db
		.select({ id: users.id, discipline: users.discipline })
		.from(users)
		.where(isNotNull(users.discipline));
	const byLowerDiscipline = new Map<string, string[]>();
	for (const row of rows) {
		if (!row.discipline) continue;
		const key = row.discipline.toLowerCase();
		const list = byLowerDiscipline.get(key) ?? [];
		list.push(row.id);
		byLowerDiscipline.set(key, list);
	}
	for (const target of targets) {
		byTarget.set(target, byLowerDiscipline.get(target.toLowerCase()) ?? []);
	}
	return byTarget;
}
