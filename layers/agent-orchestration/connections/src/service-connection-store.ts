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
} from "@hyperidle/db";
import { and, eq } from "drizzle-orm";

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
