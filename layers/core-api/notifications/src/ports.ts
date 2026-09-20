/**
 * `notifications` Service (core-api) — outbound composition-boundary
 * (Mechanism C) DI ports.
 *
 * @lore AU20 Stage 2: collapsed from 15 individual port interfaces + 4 sub-bags
 * to a single exported NotificationsDeps. Individual ports and sub-bags are kept
 * as private interfaces so NotificationsDeps' field types remain precise;
 * TypeScript structurally-inlines them for any consumer of NotificationsDeps.
 * The sub-bags (NotificationsConfigDeps / MuteDeps / SilenceDeps / DigestDeps)
 * were the "intermediate bags" the design doc said to delete — callers no longer
 * name them; they build NotificationsDeps directly.
 *
 * @lore AU19 Increment 1g — unlike `settings`' Inc-1f precedent, every edge
 * MUST route through a port here: `composition-boundary-guard` bans a nested
 * Service's `src/**` from importing ANY `@hyperidle/*` other than
 * `@hyperidle/db`/framework packages.
 *
 * @lore AU19 Increment 1h — CLOSED: `connections` migrated this Increment.
 *
 * @lore AU43: users + teams removed (only consumed by isSilenced, now deleted).
 * NotificationsSilenceConfig and silence-related fields removed from config
 * section. listQueuedItemsSince removed from work (only consumed by
 * getDailyDigest, now deleted).
 */

import type { HyperIdleDb, ServerCredential } from "@hyperidle/db";

// ---------------------------------------------------------------------------
// Private port interfaces (referenced by NotificationsDeps fields)
// ---------------------------------------------------------------------------

/**
 * @lore AU44 batch 4: primaryChannel, digestChannel, recipientEmail,
 * recipientNtfyTopic, ntfyBaseUrl, floodMaxPerMinute, floodCoalesceWindowMs,
 * testMaxPerHour, smtpIgnoreTls, digestCron removed — only SMTP delivery config
 * survives after dispatcher, ntfy adapter, and digest deletion.
 */
interface NotificationsDeliveryConfig {
	enabled: boolean;
	smtpHost: string | null;
	smtpPort: number;
	smtpSecure: boolean;
	smtpUsername: string | null;
	smtpFrom: string | null;
}

interface NotificationsConfigSection {
	delivery: NotificationsDeliveryConfig;
	mutedTypes: string[];
}

interface NotificationsConfigPatch {
	delivery?: Partial<NotificationsDeliveryConfig>;
	mutedTypes?: string[];
}

interface NotificationsServerConfigPort {
	read(db: HyperIdleDb): Promise<{ notifications: NotificationsConfigSection }>;
	update(db: HyperIdleDb, patch: { notifications: NotificationsConfigPatch }): Promise<unknown>;
}

interface NotificationsCredentialCipher {
	encryptCredentialValue(plaintext: string): string;
	decryptCredentialValue(encrypted: string): string | null;
}

interface NotificationsCredentialStore {
	findByName(db: HyperIdleDb, name: string): Promise<ServerCredential | undefined>;
	upsert(
		db: HyperIdleDb,
		values: {
			readonly name: string;
			readonly encryptedValue: string;
			readonly validationState: string;
			readonly lastValidatedAt: string | null;
			readonly updatedAt: string;
		},
	): Promise<void>;
	deleteByName(db: HyperIdleDb, name: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Public exported type (1 type counted by census)
// ---------------------------------------------------------------------------

/**
 * @lore AU20 Ag6b: collapsed deps bag — replaces 15 individual port interfaces
 * + 4 sub-bags as the SINGLE public surface for `installNotifications`,
 * `deliver`, `readConfig`, `updateConfig`, `readPreferences`, `updatePreferences`.
 * Callers build one `NotificationsDeps` at the composition root; individual
 * ports are module-private above.
 */
export interface NotificationsDeps {
	serverConfig: NotificationsServerConfigPort;
	credentialCipher: NotificationsCredentialCipher;
	credentialStore: NotificationsCredentialStore;
}
