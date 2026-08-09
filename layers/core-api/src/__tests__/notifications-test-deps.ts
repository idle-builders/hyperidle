/**
 * Shared `@hyperidle/notifications` DI-port wiring for test files.
 *
 * @lore AU19 Increment 1g: every notifications function that reaches across
 * a Service boundary (`settings`/`users`/`org`/`work`/`conversation`/
 * `connections`) now takes an injected port (Mechanism C) — real production
 * wiring lives in `server-factory.ts`/`app.ts`. Test files that call these
 * functions directly (bypassing the `app`/`server-factory` composition
 * points) need the same real wiring; this module is the single shared
 * construction so it isn't duplicated ad hoc across a dozen test files.
 * Not a stub: every port here wires to the REAL cross-package function
 * (or, for `connections` — not yet migrated — the real
 * `credential-encryption.ts` functions + a real `serverCredentials` query,
 * the same interim pattern `server-factory.ts` uses).
 *
 * @lore AU20 Ag6b: collapsed from three separate exports
 * (`notificationsConfigDeps`, `notificationsSilenceDeps`, `notificationsWorkReader`)
 * into one `notificationsDeps: NotificationsDeps` bag. Callers that used the
 * individual exports now pass `notificationsDeps` to any notifications function
 * that takes the collapsed type.
 */

import { decryptCredentialValue, encryptCredentialValue } from "@hyperidle/credential-access";
import { deleteCredential, readCredentials, writeCredential } from "@hyperidle/credentials";
import type { WriteExecutor } from "@hyperidle/db";
import type { NotificationsDeps } from "@hyperidle/notifications";
import { getTeamMembers } from "@hyperidle/org";
import { readServerConfig, updateServerConfig } from "@hyperidle/settings";
import { findUser } from "@hyperidle/users";
import * as work from "@hyperidle/work";

export const notificationsDeps: NotificationsDeps = {
	serverConfig: { read: readServerConfig, update: updateServerConfig },
	// @lore AU20 Am4: getServerSecret removed from barrel — cipher owns the key.
	// encryptCredentialValue/decryptCredentialValue are now no-arg; MISSING_ROOT_SECRET
	// is thrown by encrypt when no secret is set; decrypt returns null.
	credentialCipher: {
		encryptCredentialValue,
		decryptCredentialValue,
	},
	// @lore AU20 Am4: adapter wraps the collapsed read/write API to satisfy the
	// NotificationsCredentialStore port shape (findByName / upsert / deleteByName).
	credentialStore: {
		findByName: async (db, name) => (await readCredentials(db, { name }))[0],
		upsert: async (db, values) =>
			writeCredential(db, values.name, {
				encryptedValue: values.encryptedValue,
				validationState: values.validationState,
				lastValidatedAt: values.lastValidatedAt,
				updatedAt: values.updatedAt,
			}),
		deleteByName: (db, name) => deleteCredential(db, name),
	},
	users: { getUserById: (db, id) => findUser(db, { id }) },
	teams: { getTeamMembersById: (db, id) => getTeamMembers(db, { id }) },
	work: {
		listQueuedItemsSince: (exec: WriteExecutor, cutoff: string) =>
			work.list(exec, "item", { queued: true, createdSince: cutoff }),
		getItemById: (exec: WriteExecutor, id: string) => work.get(exec, "item", id),
	},
};
