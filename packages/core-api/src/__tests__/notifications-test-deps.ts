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
 */

import {
	decryptCredentialValue,
	encryptCredentialValue,
	getServerSecret,
} from "@hyperidle/connections";
import { listVerdictItemIds } from "@hyperidle/conversation";
import { type HyperIdleDb, serverCredentials } from "@hyperidle/db";
import type {
	NotificationsConfigDeps,
	NotificationsCredentialCipher,
	NotificationsCredentialStore,
	NotificationsDigestDeps,
	NotificationsSilenceDeps,
	NotificationsWorkReader,
} from "@hyperidle/notifications";
import { getTeamMembersById } from "@hyperidle/org";
import { readServerConfig, updateServerConfig } from "@hyperidle/settings";
import { getUserById } from "@hyperidle/users";
import { getItemById, listQueuedItemsSince } from "@hyperidle/work";
import { eq } from "drizzle-orm";

const notificationsServerConfigPort = { read: readServerConfig, update: updateServerConfig };

const notificationsCredentialCipher: NotificationsCredentialCipher = {
	getServerSecret,
	encryptCredentialValue,
	decryptCredentialValue,
};

const notificationsCredentialStore: NotificationsCredentialStore = {
	async findByName(db: HyperIdleDb, name: string) {
		const [row] = await db
			.select()
			.from(serverCredentials)
			.where(eq(serverCredentials.name, name))
			.limit(1);
		return row;
	},
	async upsert(db: HyperIdleDb, values) {
		await db
			.insert(serverCredentials)
			.values(values)
			.onConflictDoUpdate({
				target: serverCredentials.name,
				set: { encryptedValue: values.encryptedValue, updatedAt: values.updatedAt },
			});
	},
	async deleteByName(db: HyperIdleDb, name: string) {
		await db.delete(serverCredentials).where(eq(serverCredentials.name, name));
	},
};

export const notificationsConfigDeps: NotificationsConfigDeps = {
	serverConfig: notificationsServerConfigPort,
	credentialCipher: notificationsCredentialCipher,
	credentialStore: notificationsCredentialStore,
};

export const notificationsSilenceDeps: NotificationsSilenceDeps = {
	serverConfig: notificationsServerConfigPort,
	users: { getUserById },
	teams: { getTeamMembersById },
};

export const notificationsWorkReader: NotificationsWorkReader = {
	listQueuedItemsSince,
	getItemById,
};

export const notificationsDigestDeps: NotificationsDigestDeps = {
	work: notificationsWorkReader,
	verdicts: { listVerdictItemIds },
};
