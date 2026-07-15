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

/**
 * List every credential row (no filter) — `routes/credentials.ts`'s GET /
 * catalog-status listing.
 *
 * @lore AU19 Increment 5 item 4 (connections sub-item): added to close
 * `routes/credentials.ts`'s raw `db.select().from(serverCredentials)` (no
 * `where`) — the last unmapped shape this Service's own routes needed.
 */
export async function listAllCredentials(db: HyperIdleDb): Promise<ServerCredential[]> {
	return db.select().from(serverCredentials);
}

/** Values shape for `setCredentialValue` — a plaintext-encrypted write. */
export interface SetCredentialValueInput {
	readonly name: string;
	readonly encryptedValue: string;
	readonly updatedAt: string;
}

/**
 * Insert-or-update a credential value, resetting validation state to
 * "present_untested" and clearing `lastValidatedAt` on every write (a new
 * value has never been re-validated) — `routes/credentials.ts`'s
 * PUT /:name write-boundary semantics.
 *
 * @lore AU19 Increment 5 item 4 (connections sub-item): distinct from
 * `upsertCredential` (whose `onConflictDoUpdate` only touches
 * `encryptedValue`/`updatedAt`, used by `notifications`' secret read/write
 * path which never resets validation state) — this export replicates
 * `routes/credentials.ts`'s exact prior select-then-branch write, byte-
 * identical resulting row shape, as one upsert.
 */
export async function setCredentialValue(
	db: HyperIdleDb,
	values: SetCredentialValueInput,
): Promise<void> {
	await db
		.insert(serverCredentials)
		.values({
			name: values.name,
			encryptedValue: values.encryptedValue,
			validationState: "present_untested",
			lastValidatedAt: null,
			updatedAt: values.updatedAt,
		})
		.onConflictDoUpdate({
			target: serverCredentials.name,
			set: {
				encryptedValue: values.encryptedValue,
				validationState: "present_untested",
				lastValidatedAt: null,
				updatedAt: values.updatedAt,
			},
		});
}

/**
 * Write back a validation outcome (state + timestamp) for an existing
 * credential row — `routes/credentials.ts`'s POST /:name/validate.
 */
export async function updateCredentialValidationState(
	db: HyperIdleDb,
	name: string,
	values: {
		readonly validationState: string;
		readonly lastValidatedAt: string;
		readonly updatedAt: string;
	},
): Promise<void> {
	await db
		.update(serverCredentials)
		.set({
			validationState: values.validationState,
			lastValidatedAt: values.lastValidatedAt,
			updatedAt: values.updatedAt,
		})
		.where(eq(serverCredentials.name, name));
}
