/**
 * `serviceConnections` CRUD — the raw read/write surface for the
 * `service_connections` table `connections` owns.
 *
 * @lore AU19 Increment 5 item 4 (connections sub-item, guard-retirement
 * full-sweep): closes `routes/connections.ts`'s + `server-factory.ts`'s
 * remaining raw `db.select/insert/update/delete(serviceConnections)` calls —
 * same TABLE_OWNER/DI-port pattern already proven for org/knowledge/work.
 * `server-factory.ts`'s `listServiceConnectionsByAuthSource` closes
 * `@hyperidle/settings`' `ServiceConnectionsReader` port, which stayed
 * deliberately interim at Increment 1h (only the credential-cipher/store
 * pair closed then) — see `settings`' `ports.ts` top `@lore`.
 */

import {
	type HyperIdleDb,
	type NewServiceConnectionRow,
	type ServiceConnectionRow,
	serviceConnections,
} from "@hyperidle/db";
import { and, eq } from "drizzle-orm";

/** List every held connection for a user — `GET /api/connections`. */
export async function listServiceConnectionsByUserId(
	db: HyperIdleDb,
	userId: string,
): Promise<ServiceConnectionRow[]> {
	return db.select().from(serviceConnections).where(eq(serviceConnections.userId, userId));
}

/**
 * List every held connection matching an `authSource` (no user filter) —
 * `settings`' `ServiceConnectionsReader.listByAuthSource` (MCP-server
 * configuration-default seed).
 */
export async function listServiceConnectionsByAuthSource(
	db: HyperIdleDb,
	authSource: string,
): Promise<ServiceConnectionRow[]> {
	return db.select().from(serviceConnections).where(eq(serviceConnections.authSource, authSource));
}

/**
 * Insert a new held connection. Unique-violation (user × service ×
 * authSource) errors propagate to the caller unchanged — `routes/
 * connections.ts`'s POST / already walks the `err.cause` chain to detect
 * `23505`/"duplicate key" and translate it to a 409.
 */
export async function insertServiceConnection(
	db: HyperIdleDb,
	values: NewServiceConnectionRow,
): Promise<void> {
	await db.insert(serviceConnections).values(values);
}

/** Find a held connection by its opaque `sc-<uuid>` id, no ownership check. */
export async function getServiceConnectionById(
	db: HyperIdleDb,
	id: string,
): Promise<ServiceConnectionRow | undefined> {
	const [row] = await db
		.select()
		.from(serviceConnections)
		.where(eq(serviceConnections.id, id))
		.limit(1);
	return row;
}

/**
 * Find a held connection scoped to its owning user — cross-user / non-
 * existent ids both resolve to `undefined`, so a caller can 404 without an
 * existence leak (`routes/connections.ts`'s DELETE/validate ownership check).
 */
export async function getServiceConnectionByIdForUser(
	db: HyperIdleDb,
	id: string,
	userId: string,
): Promise<ServiceConnectionRow | undefined> {
	const [row] = await db
		.select()
		.from(serviceConnections)
		.where(and(eq(serviceConnections.id, id), eq(serviceConnections.userId, userId)))
		.limit(1);
	return row;
}

/** Delete a held connection scoped to its owning user (no-op if not owned). */
export async function deleteServiceConnectionForUser(
	db: HyperIdleDb,
	id: string,
	userId: string,
): Promise<void> {
	await db
		.delete(serviceConnections)
		.where(and(eq(serviceConnections.id, id), eq(serviceConnections.userId, userId)));
}

/** Write back a validate-probe outcome (health + timestamp) by id. */
export async function updateServiceConnectionHealth(
	db: HyperIdleDb,
	id: string,
	values: { readonly health: string; readonly lastValidatedAt: string; readonly updatedAt: string },
): Promise<void> {
	await db
		.update(serviceConnections)
		.set({
			health: values.health,
			lastValidatedAt: values.lastValidatedAt,
			updatedAt: values.updatedAt,
		})
		.where(eq(serviceConnections.id, id));
}
