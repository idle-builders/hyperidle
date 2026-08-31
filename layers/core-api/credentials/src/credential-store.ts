/**
 * `serverCredentials` read/write surface for the `server_credentials` table.
 *
 * Two symmetric verbs (read/write) + delete replace the old per-intent methods:
 *   readCredentials   — filter by name or list all
 *   writeCredential   — upsert (value path) or update (validation path) via CredentialWrite patch
 *   deleteCredential  — delete by name
 *   resolveCredential — read + decrypt in one call (replaces DbCredentialResolver)
 *
 * @lore AU20 Am4: collapsed from 9 per-intent methods (findByName/listAll/insert/
 * upsert/setCredentialValue/updateCredentialValidationState/deleteCredentialByName
 * + two write-shape types) into one composable triple. The "new value ⇒ validation
 * reset" rule is expressed by the caller's patch (callers pass validationState +
 * lastValidatedAt when they want to reset), not a magic hidden side-effect inside
 * the store.
 *
 * @lore AU19 Increment 1h: this file originally extracted raw CRUD to close
 * `settings`' and `notifications`' DI ports (Mechanism C). The AU20 collapse
 * further reduces the surface without changing any SQL semantics.
 *
 * @lore AU44 batch2: `updatedAt` dropped from CredentialWrite — stamped inside
 * writeCredential so callers never need to supply it. DbCredentialResolver replaced
 * by resolveCredential function (simpler: no class, no DI, same result).
 */

import { type HyperIdleDb, type ServerCredential, serverCredentials } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { decryptCredentialValue, encryptCredentialValue } from "./credential-encryption.js";

/**
 * Partial patch shape for writeCredential.
 * Include only the columns that should change; updatedAt is stamped internally.
 *
 * - encryptedValue: present → upsert path (INSERT or UPDATE value).
 * - validationState / lastValidatedAt: present → written to the row (either path).
 * - Absent encryptedValue with absent validationState → plain timestamp update.
 */
export interface CredentialWrite {
	readonly encryptedValue?: string;
	readonly validationState?: string;
	readonly lastValidatedAt?: string | null;
}

/**
 * List credential rows matching an optional filter.
 * With no filter, returns all rows (catalog listing).
 * With { name }, returns the single matching row (or empty array).
 *
 * Returns an array so the caller decides whether to take [0] (point-lookup)
 * or iterate (listing).
 */
export async function readCredentials(
	db: HyperIdleDb,
	filter?: { name?: string },
): Promise<ServerCredential[]> {
	if (filter?.name !== undefined) {
		const [row] = await db
			.select()
			.from(serverCredentials)
			.where(eq(serverCredentials.name, filter.name))
			.limit(1);
		return row ? [row] : [];
	}
	return db.select().from(serverCredentials);
}

/**
 * Upsert or update a credential row via a partial patch.
 *
 * When encryptedValue is present: INSERT or ON CONFLICT UPDATE (upsert).
 *   The INSERT supplies defaults for any missing patch fields
 *   (validationState defaults to "present_untested", lastValidatedAt to null).
 *   The ON CONFLICT path updates only the patch-specified columns.
 *
 * When encryptedValue is absent: plain UPDATE of the validation columns only.
 *   This is the validation-outcome write-back path (POST /:name/validate).
 *   Since validation is always called on an existing row, the INSERT path
 *   never fires; the UPDATE is correct and safe.
 *
 * @lore AU44 batch2: updatedAt is now stamped here (new Date().toISOString())
 * rather than supplied by callers — one fewer param to pass and one fewer place
 * to get the ISO string wrong.
 */
export async function writeCredential(
	db: HyperIdleDb,
	name: string,
	patch: CredentialWrite,
): Promise<void> {
	const { encryptedValue, validationState, lastValidatedAt } = patch;
	const updatedAt = new Date().toISOString();

	if (encryptedValue !== undefined) {
		// Upsert path: insert or update the value + any provided validation columns.
		const conflictSet: Partial<typeof serverCredentials.$inferInsert> = {
			encryptedValue,
			updatedAt,
		};
		if (validationState !== undefined) conflictSet.validationState = validationState;
		if (lastValidatedAt !== undefined) conflictSet.lastValidatedAt = lastValidatedAt ?? null;

		await db
			.insert(serverCredentials)
			.values({
				name,
				encryptedValue,
				validationState: validationState ?? "present_untested",
				lastValidatedAt: lastValidatedAt !== undefined ? (lastValidatedAt ?? null) : null,
				updatedAt,
			})
			.onConflictDoUpdate({
				target: serverCredentials.name,
				set: conflictSet,
			});
	} else {
		// Update-only path: validation outcome write-back (no value change).
		const updateSet: Partial<typeof serverCredentials.$inferInsert> = { updatedAt };
		if (validationState !== undefined) updateSet.validationState = validationState;
		if (lastValidatedAt !== undefined) updateSet.lastValidatedAt = lastValidatedAt ?? null;

		await db.update(serverCredentials).set(updateSet).where(eq(serverCredentials.name, name));
	}
}

/**
 * Delete a credential row by its name (primary key).
 * No-op if the row does not exist.
 */
export async function deleteCredential(db: HyperIdleDb, name: string): Promise<void> {
	await db.delete(serverCredentials).where(eq(serverCredentials.name, name));
}

/**
 * Resolve the plaintext value for a stored credential by name.
 * Returns null when the credential does not exist, has no value,
 * or decryption fails (missing/wrong root secret).
 *
 * Replaces DbCredentialResolver.resolve() — same semantics, no class overhead.
 *
 * @lore AU44 batch2: DbCredentialResolver (a class wrapping this exact logic)
 * deleted; pure function with the same contract is simpler and easier to test.
 */
export async function resolveCredential(db: HyperIdleDb, name: string): Promise<string | null> {
	const [row] = await readCredentials(db, { name });
	if (!row?.encryptedValue) return null;
	return decryptCredentialValue(row.encryptedValue);
}

// @lore A `seedAnthropicKeyFromEnv` stood here, writing ANTHROPIC_API_KEY into
// the credential table on first boot so the built-in harness could call with it.
// HyperIdle stores no model credential any more — a harness authenticates with
// its own login — so there is nothing to seed.

export { decryptCredentialValue, encryptCredentialValue };
