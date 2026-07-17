/**
 * `notifications` Service (core-api) — outbound composition-boundary
 * (Mechanism C) DI ports, per architecture §10.2's census: `notifications`'
 * five real outbound edges are `settings` (`silence-policy.ts`/`config.ts`/
 * `mute.ts` → `server-config.ts`'s `readServerConfig`/`updateServerConfig`),
 * `conversation` (`daily-digest.ts` → `conversation-store.ts`'s
 * `listVerdictItemIds`), `work` (`daily-digest.ts` → `work-service.ts`'s
 * `listQueuedItemsSince`), `users` (`silence-policy.ts` → `user-store.ts`'s
 * `getUserById`), and `connections` (`config.ts` →
 * `credential-encryption.ts`'s cipher functions).
 *
 * All five are ORDINARY downward core-api→core-api edges (NOT §10.3
 * against-grain) — none needs an Increment-3 EventBus-rewire caveat.
 *
 * @lore AU19 Increment 1g — unlike `settings`' Inc-1f precedent (where
 * `users`/`routine` targets could be wired as a plain direct import once
 * real, with the port interface kept only for documentation), EVERY one of
 * these five edges MUST route through a port here: `composition-boundary-
 * guard` bans a nested Service's `src/**` from importing ANY `@hyperidle/*`
 * other than `@hyperidle/db`/`@hyperidle/shared`, full stop — including a
 * plain function-only import of an already-migrated sibling like
 * `@hyperidle/conversation`. `daily-digest.ts`'s pre-existing direct imports
 * of `@hyperidle/conversation`/`@hyperidle/work` (repointed there by THOSE
 * Services' own Inc-1b/1e "repoint every real consumer" steps, while
 * `notifications` itself still lived in `packages/server` and was unscanned)
 * become illegal the moment this file moves into
 * `packages/core-api/notifications/` — converted to `NotificationsVerdictReader`
 * / `NotificationsWorkReader` below.
 *
 * @lore AU19 Increment 1g — `connections` (`credential-encryption.ts`'s
 * `getServerSecret`/`encryptCredentialValue`/`decryptCredentialValue`, plus a
 * raw `serverCredentials` read/write the §10.2 function-level census missed —
 * same completeness-check discovery shape as `settings`' Inc-1f finding) was
 * INTERIM at the time: `connections` had not migrated yet.
 *
 * @lore AU19 Increment 1h — CLOSED: `connections` migrated this Increment, so
 * every real call site now wires `NotificationsCredentialCipher` directly to
 * `@hyperidle/connections`' real `getServerSecret`/`encryptCredentialValue`/
 * `decryptCredentialValue` exports, and `NotificationsCredentialStore` to its
 * real `findCredentialByName`/`upsertCredential`/`deleteCredentialByName`
 * exports (`credential-store.ts`, added this Increment specifically to give
 * the store port a real target) — no more interim indirection, same closure
 * shape as `settings`' `SettingsCredentialCipher`/`SettingsCredentialStore`.
 *
 * @lore AU19 Increment 1g — `teamMembers` (owned by `org` since Increment 1c)
 * is a SIXTH real edge the §10.2 function-level census missed entirely,
 * surfaced by `table-ownership-guard`'s completeness check exactly like
 * `settings`' Inc-1f `serviceConnections`/`serverCredentials` discovery:
 * `silence-policy.ts` used to import the `teamMembers` table directly to
 * resolve `agent.teamId -> teamMembers.id -> teamMembers.teamId` for
 * per-team silence. `org` is a REAL migrated package, so
 * `NotificationsTeamReader` wires directly to `@hyperidle/org`'s new
 * `getTeamMembersById` export (added this increment) — an ordinary edge, no
 * interim caveat. Appended as a new row to architecture §10.1/§10.2's
 * composition census is a documentation-only nit, folded into the
 * Increment-5 reconciliation pass (ground-rule #10), same as the carried
 * `work`→`org` and `settings`→`model-gateway` census nits.
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
// settings — NotificationsServerConfigPort (ordinary downward core-api edge)
// ---------------------------------------------------------------------------

/**
 * Structural mirror of `@hyperidle/settings`' `ServerConfig.notifications`
 * section (delivery + mutedTypes + silence) — NOT an import of `ServerConfig`
 * itself (that type lives only in `@hyperidle/settings`, off-limits to this
 * package's `src/**` per `composition-boundary-guard`). TypeScript's
 * structural typing means the real `readServerConfig`/`updateServerConfig`
 * function references are assignable here unchanged — the caller
 * (`packages/server`, unguarded) wires the real functions directly, zero
 * adaptation.
 */
export interface NotificationsDeliveryConfig {
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

export interface NotificationsSilenceConfig {
	mode: boolean;
	silencedTeamIds: string[];
	windowStart: string | null;
	windowEnd: string | null;
}

export interface NotificationsConfigSection {
	delivery: NotificationsDeliveryConfig;
	mutedTypes: string[];
	silence: NotificationsSilenceConfig;
}

export interface NotificationsConfigPatch {
	delivery?: Partial<NotificationsDeliveryConfig>;
	mutedTypes?: string[];
	silence?: Partial<NotificationsSilenceConfig>;
}

/** Port for `settings`' read/write surface `notifications` calls directly today. */
export interface NotificationsServerConfigPort {
	read(db: HyperIdleDb): Promise<{ notifications: NotificationsConfigSection }>;
	update(db: HyperIdleDb, patch: { notifications: NotificationsConfigPatch }): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// users — NotificationsUserReader (ordinary downward core-api edge, real target)
// ---------------------------------------------------------------------------

/** Port for `users`' read surface `silence-policy.ts` calls directly today (`getUserById`). */
export interface NotificationsUserReader {
	getUserById(db: HyperIdleDb, id: string): Promise<User | undefined>;
}

// ---------------------------------------------------------------------------
// org — NotificationsTeamReader (ordinary downward core-api edge, real target)
// ---------------------------------------------------------------------------

/**
 * Port for `org`'s `teamMembers`-by-own-id read surface `silence-policy.ts`
 * calls directly today (`getTeamMembersById`, table-ownership-guard
 * completeness finding — see this file's top-level `@lore`).
 */
export interface NotificationsTeamReader {
	getTeamMembersById(db: HyperIdleDb, id: string): Promise<TeamMember | undefined>;
}

// ---------------------------------------------------------------------------
// work — NotificationsWorkReader (ordinary downward core-api edge, real target)
// ---------------------------------------------------------------------------

/**
 * Port for `work`'s read surface `daily-digest.ts`/`dispatcher.ts`/
 * `notification-listener.ts` call directly today (`listQueuedItemsSince`,
 * `getItemById`) — the latter two used to raw-query the foreign `items`
 * table directly (table-ownership-guard completeness finding).
 */
export interface NotificationsWorkReader {
	listQueuedItemsSince(exec: WriteExecutor, cutoff: string): Promise<Item[]>;
	getItemById(exec: WriteExecutor, id: string): Promise<Item | undefined>;
}

// ---------------------------------------------------------------------------
// conversation — NotificationsVerdictReader (ordinary downward core-api edge, real target)
// ---------------------------------------------------------------------------

/** Port for `conversation`'s read surface `daily-digest.ts` calls directly today (`listVerdictItemIds`). */
export interface NotificationsVerdictReader {
	listVerdictItemIds(db: HyperIdleDb, itemIds: string[]): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// connections — NotificationsCredentialCipher (CLOSED Increment 1h, real target)
// ---------------------------------------------------------------------------

/**
 * Port for `connections`' credential-cipher surface `config.ts` calls (real,
 * `@hyperidle/connections`'s `encryptCredentialValue`/`decryptCredentialValue`)
 * — used to read/write the notification-secret rows
 * (`notifications_smtp_password`, `notifications_ntfy_auth_token`).
 *
 * @lore AU20 Am4: getServerSecret removed — the cipher owns the key.
 * encryptCredentialValue throws MISSING_ROOT_SECRET when no secret is set;
 * decryptCredentialValue returns null. config.ts handles both cases.
 */
export interface NotificationsCredentialCipher {
	encryptCredentialValue(plaintext: string): string;
	decryptCredentialValue(encrypted: string): string | null;
}

// ---------------------------------------------------------------------------
// connections — NotificationsCredentialStore (CLOSED Increment 1h, real target)
// ---------------------------------------------------------------------------

/**
 * Port for `connections`' `serverCredentials` read/write surface `config.ts`
 * calls (real, `@hyperidle/connections`'s `findCredentialByName`/
 * `upsertCredential`/`deleteCredentialByName`) — used by `readSecret`/
 * `writeSecret` (originally a table-ownership-guard completeness finding —
 * see this file's top-level `@lore`).
 */
export interface NotificationsCredentialStore {
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
// Combined deps bags — grouped by the notifications module that needs them
// ---------------------------------------------------------------------------

/** `config.ts`'s `readNotificationConfig`/`loadNotificationConfig`/`updateNotificationConfig`. */
export interface NotificationsConfigDeps {
	serverConfig: NotificationsServerConfigPort;
	credentialCipher: NotificationsCredentialCipher;
	credentialStore: NotificationsCredentialStore;
}

/** `mute.ts`'s reader/writer factories + `getMutedTypeKeys`. */
export interface NotificationsMuteDeps {
	serverConfig: NotificationsServerConfigPort;
}

/** `silence-policy.ts`'s `isSilenced`/`isFactorySilenced`/`readSilenceWindow`. */
export interface NotificationsSilenceDeps {
	serverConfig: NotificationsServerConfigPort;
	users: NotificationsUserReader;
	teams: NotificationsTeamReader;
}

/** `daily-digest.ts`'s `getDailyDigest`. */
export interface NotificationsDigestDeps {
	work: NotificationsWorkReader;
	verdicts: NotificationsVerdictReader;
}
