/**
 * AH4 — Shared upsertOrgEdge helper.
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
 */

import { type HyperIdleDb, orgEdges } from "@hyperidle/db";
import type { OrgEdgeMechanism } from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";

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
