/**
 * AF8 — Notification mute preferences (read/write interface + factory-level defaults).
 *
 * @lore AF8 CONTRACT FLAG (AF15): AF8 ships a factory-level default implementation
 * that reads/writes mute preferences keyed by `typeKey`. AF15 reworks this into
 * per-user persistence. The seam is `MutePreferenceReader`
 * and `MutePreferenceWriter` — AF15 provides per-user implementations that have
 * the same interface. Until AF15 lands, mute is global-per-factory which is
 * acceptable for the single-founder near-term (concept-notes §4).
 *
 * @lore AF8: The interface intentionally omits `userId` — AF15 adds it when it
 * swaps the implementation. The drain and listener call `isTypeMuted(typeKey)`
 * and will not change when AF15 extends the signature to
 * `isTypeMuted(typeKey, userId)` — just swap the implementation in bootstrapAppRuntime.
 *
 * @lore AU18: re-backed onto `server_config.notifications.mutedTypes` (was
 * `factorySettings.notifications.mute_<typeKey>` rows). `mutedTypes` is a flat
 * string array of muted type keys — a set represented as a sorted-unique list.
 *
 * @lore AU19 Increment 1g: `readServerConfig`/`updateServerConfig` used to
 * import directly from `@hyperidle/settings` — `composition-boundary-guard`
 * bans ANY `@hyperidle/*` import (other than `db`/`shared`) from this
 * package's `src/**`, so both are now injected via `NotificationsMuteDeps`'
 * `serverConfig` port (Mechanism C). The caller (`packages/server`,
 * unguarded) wires the real `@hyperidle/settings` functions directly, zero
 * behavior change.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { NotificationTypeKey } from "@hyperidle/shared";
import type { NotificationsMuteDeps } from "./ports.js";

/** Read interface used by the drain loop and notification listener. */
export interface MutePreferenceReader {
	isTypeMuted(typeKey: NotificationTypeKey): Promise<boolean>;
}

/** Write interface used by the popover mute shortcut and Settings toggles. */
export interface MutePreferenceWriter {
	setMuted(typeKey: NotificationTypeKey, muted: boolean): Promise<void>;
}

/**
 * Default factory-level reader: reads `server_config.notifications.mutedTypes`.
 * Absent = not muted (fail-open).
 */
export function defaultMutePreferenceReader(
	db: HyperIdleDb,
	deps: NotificationsMuteDeps,
): MutePreferenceReader {
	return {
		async isTypeMuted(typeKey: NotificationTypeKey): Promise<boolean> {
			const { notifications } = await deps.serverConfig.read(db);
			return notifications.mutedTypes.includes(typeKey);
		},
	};
}

/**
 * Default factory-level writer: writes `server_config.notifications.mutedTypes`.
 */
export function defaultMutePreferenceWriter(
	db: HyperIdleDb,
	deps: NotificationsMuteDeps,
): MutePreferenceWriter {
	return {
		async setMuted(typeKey: NotificationTypeKey, muted: boolean): Promise<void> {
			const { notifications } = await deps.serverConfig.read(db);
			const current = new Set(notifications.mutedTypes);
			if (muted) current.add(typeKey);
			else current.delete(typeKey);
			await deps.serverConfig.update(db, { notifications: { mutedTypes: [...current] } });
		},
	};
}

/** Helper: read all muted type keys (for GET /notifications/mute). */
export async function getMutedTypeKeys(
	db: HyperIdleDb,
	deps: NotificationsMuteDeps,
): Promise<NotificationTypeKey[]> {
	const { notifications } = await deps.serverConfig.read(db);
	return notifications.mutedTypes as NotificationTypeKey[];
}
