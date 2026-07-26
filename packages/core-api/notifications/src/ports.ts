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
 * `@hyperidle/db`/`@hyperidle/shared`.
 *
 * @lore AU19 Increment 1h — CLOSED: `connections` migrated this Increment.
 */

import type {
	HyperIdleDb,
	Item,
	ServerCredential,
	TeamMember,
	User,
	WriteExecutor,
} from "@hyperidle/db";
import type { NotificationChannel } from "./types.js";

// ---------------------------------------------------------------------------
// Private port interfaces (referenced by NotificationsDeps fields)
// ---------------------------------------------------------------------------

interface NotificationsDeliveryConfig {
	enabled: boolean;
	primaryChannel: NotificationChannel;
	digestChannel: NotificationChannel | null;
	recipientEmail: string | null;
	recipientNtfyTopic: string | null;
	ntfyBaseUrl: string;
	smtpHost: string | null;
	smtpPort: number;
	smtpSecure: boolean;
	smtpUsername: string | null;
	smtpFrom: string | null;
	floodMaxPerMinute: number;
	floodCoalesceWindowMs: number;
	testMaxPerHour: number;
	smtpIgnoreTls: boolean;
	digestCron: string;
}

interface NotificationsSilenceConfig {
	mode: boolean;
	silencedTeamIds: string[];
	windowStart: string | null;
	windowEnd: string | null;
}

interface NotificationsConfigSection {
	delivery: NotificationsDeliveryConfig;
	mutedTypes: string[];
	silence: NotificationsSilenceConfig;
}

interface NotificationsConfigPatch {
	delivery?: Partial<NotificationsDeliveryConfig>;
	mutedTypes?: string[];
	silence?: Partial<NotificationsSilenceConfig>;
}

interface NotificationsServerConfigPort {
	read(db: HyperIdleDb): Promise<{ notifications: NotificationsConfigSection }>;
	update(db: HyperIdleDb, patch: { notifications: NotificationsConfigPatch }): Promise<unknown>;
}

interface NotificationsUserReader {
	getUserById(db: HyperIdleDb, id: string): Promise<User | undefined>;
}

interface NotificationsTeamReader {
	getTeamMembersById(db: HyperIdleDb, id: string): Promise<TeamMember | undefined>;
}

interface NotificationsWorkReader {
	listQueuedItemsSince(exec: WriteExecutor, cutoff: string): Promise<Item[]>;
	getItemById(exec: WriteExecutor, id: string): Promise<Item | undefined>;
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
 * `deliver`, `readConfig`, `updateConfig`, `readPreferences`, `updatePreferences`,
 * and `getDailyDigest`. Callers build one `NotificationsDeps` at the composition
 * root; individual ports are module-private above.
 *
 * The `work` field satisfies both `dispatcher.ts` and `notification-listener.ts`
 * (both need `getItemById`) and `daily-digest.ts` (which needs `listQueuedItemsSince`).
 */
export interface NotificationsDeps {
	serverConfig: NotificationsServerConfigPort;
	credentialCipher: NotificationsCredentialCipher;
	credentialStore: NotificationsCredentialStore;
	users: NotificationsUserReader;
	teams: NotificationsTeamReader;
	work: NotificationsWorkReader;
}
