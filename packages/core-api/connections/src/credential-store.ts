/**
 * `serverCredentials` CRUD — the raw read/write surface for the
 * `server_credentials` table `connections` owns.
 *
 * @lore AU19 Increment 1h: extracted to close `settings`' `SettingsCredentialStore`
 * and `notifications`' `NotificationsCredentialStore` DI ports (Mechanism C) —
 * both were wired to inline raw `db.select`/`db.insert`/`db.delete` calls in
 * `packages/server`'s `server-factory.ts`/`app.ts` (the table-ownership-guard
 * completeness findings from Inc-1f/1g). These functions are the first REAL
 * exported symbols for that surface; the two ports now wire to them directly
 * instead of inline raw queries — zero behavior change (same SQL shape).
 */

import { type HyperIdleDb, type ServerCredential, serverCredentials } from "@hyperidle/db";
import { eq } from "drizzle-orm";

/** Values shape shared by insert/upsert — matches the table's non-generated columns. */
export interface ServerCredentialWriteValues {
	readonly name: string;
	readonly encryptedValue: string;
	readonly validationState: string;
	readonly lastValidatedAt: string | null;
	readonly updatedAt: string;
}

/** Find a credential row by its `name` (primary key). */
export async function findCredentialByName(
	db: HyperIdleDb,
	name: string,
): Promise<ServerCredential | undefined> {
	const [row] = await db
		.select()
		.from(serverCredentials)
		.where(eq(serverCredentials.name, name))
		.limit(1);
	return row;
}

/**
 * Plain insert (no conflict handling) — used by `settings`' one-shot
 * `migrateCredentialsToStore` boot migration, which already checked the row
 * is absent before calling this.
 */
export async function insertCredential(
	db: HyperIdleDb,
	values: ServerCredentialWriteValues,
): Promise<void> {
	await db.insert(serverCredentials).values(values);
}

/** Insert-or-update by `name` — used by `notifications`' secret read/write path. */
export async function upsertCredential(
	db: HyperIdleDb,
	values: ServerCredentialWriteValues,
): Promise<void> {
	await db
		.insert(serverCredentials)
		.values(values)
		.onConflictDoUpdate({
			target: serverCredentials.name,
			set: { encryptedValue: values.encryptedValue, updatedAt: values.updatedAt },
		});
}

/** Delete a credential row by its `name`. */
export async function deleteCredentialByName(db: HyperIdleDb, name: string): Promise<void> {
	await db.delete(serverCredentials).where(eq(serverCredentials.name, name));
}
