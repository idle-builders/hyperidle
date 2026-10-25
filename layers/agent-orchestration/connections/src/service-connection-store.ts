/**
 * `serviceConnections` read/write surface for the `service_connections` table.
 *
 * Four composable operations:
 *   listConnections  — filter by userId / authSource / id (any combination)
 *   insertConnection — plain insert (caller handles unique-violation → 409)
 *   updateConnection — health/validation write-back by id
 *   deleteConnection — delete scoped to owning user (no-op if not owned)
 */

import {
	type HyperIdleDb,
	type NewServiceConnectionRow,
	type ServiceConnectionRow,
	serviceConnections,
	serviceConnectionWithholds,
} from "@hyperidle/db";
import { and, eq, inArray } from "drizzle-orm";

/**
 * List service connections matching the given filter.
 * Any combination of userId / authSource / id may be specified.
 * With an empty filter, returns all rows (admin/debug use case).
 *
 * @lore: listConnections — {id, userId} combined yields [] on cross-user; caller 404s without leaking existence; never 403
 */
export function listConnections(
	db: HyperIdleDb,
	filter: { userId?: string; authSource?: string; id?: string } = {},
): Promise<ServiceConnectionRow[]> {
	const conditions = [
		filter.userId !== undefined ? eq(serviceConnections.userId, filter.userId) : undefined,
		filter.authSource !== undefined
			? eq(serviceConnections.authSource, filter.authSource)
			: undefined,
		filter.id !== undefined ? eq(serviceConnections.id, filter.id) : undefined,
	].filter((c): c is NonNullable<typeof c> => c !== undefined);

	if (conditions.length === 0) {
		return db.select().from(serviceConnections);
	}
	return db
		.select()
		.from(serviceConnections)
		.where(and(...conditions));
}

/**
 * Insert a new service connection.
 * Unique-violation (user × service × authSource) propagates to the caller —
 * routes/connections.ts POST / walks err.cause to detect `23505` and translates
 * it to a 409.
 */
export async function insertConnection(
	db: HyperIdleDb,
	values: NewServiceConnectionRow,
): Promise<void> {
	await db.insert(serviceConnections).values(values);
}

/**
 * Atomically write back a validate-probe outcome for the connection matching
 * both id and owning user. A mismatched owner leaves the row unchanged.
 */
export async function updateConnection(
	db: HyperIdleDb,
	params: { id: string; userId: string },
	patch: {
		readonly health: string;
		readonly lastValidatedAt: string;
		readonly updatedAt: string;
	},
): Promise<void> {
	await db
		.update(serviceConnections)
		.set({
			health: patch.health,
			lastValidatedAt: patch.lastValidatedAt,
			updatedAt: patch.updatedAt,
		})
		.where(and(eq(serviceConnections.id, params.id), eq(serviceConnections.userId, params.userId)));
}

/** The agents each of these connections is kept from. */
export async function listWithholds(
	db: HyperIdleDb,
	connectionIds: readonly string[],
): Promise<Map<string, string[]>> {
	const kept = new Map<string, string[]>();
	if (connectionIds.length === 0) return kept;
	const rows = await db
		.select()
		.from(serviceConnectionWithholds)
		.where(inArray(serviceConnectionWithholds.connectionId, [...connectionIds]));
	for (const row of rows)
		kept.set(row.connectionId, [...(kept.get(row.connectionId) ?? []), row.agentUserId]);
	return kept;
}

/** Keep a connection from one agent, or let that agent reach it again. */
export async function setWithhold(
	db: HyperIdleDb,
	params: { connectionId: string; agentUserId: string; keep: boolean; at: string },
): Promise<void> {
	if (params.keep) {
		await db
			.insert(serviceConnectionWithholds)
			.values({
				connectionId: params.connectionId,
				agentUserId: params.agentUserId,
				createdAt: params.at,
			})
			.onConflictDoNothing();
		return;
	}
	await db
		.delete(serviceConnectionWithholds)
		.where(
			and(
				eq(serviceConnectionWithholds.connectionId, params.connectionId),
				eq(serviceConnectionWithholds.agentUserId, params.agentUserId),
			),
		);
}

/**
 * Delete a service connection scoped to its owning user.
 * No-op if the id does not exist or belongs to a different user.
 * Provides per-user isolation.
 */
export async function deleteConnection(
	db: HyperIdleDb,
	params: { id: string; userId: string },
): Promise<void> {
	await db
		.delete(serviceConnections)
		.where(and(eq(serviceConnections.id, params.id), eq(serviceConnections.userId, params.userId)));
}
