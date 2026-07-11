/**
 * AF8 — Notification mute preferences (read/write interface + factory-level defaults).
 *
 * @lore AF8 CONTRACT FLAG (AF15): AF8 ships a factory-level default implementation
 * that reads/writes factory_settings rows keyed `notifications.mute_<typeKey>`.
 * AF15 reworks this into per-user persistence. The seam is `MutePreferenceReader`
 * and `MutePreferenceWriter` — AF15 provides per-user implementations that have
 * the same interface. Until AF15 lands, mute is global-per-factory which is
 * acceptable for the single-founder near-term (concept-notes §4).
 *
 * @lore AF8: The interface intentionally omits `userId` — AF15 adds it when it
 * swaps the implementation. The drain and listener call `isTypeMuted(typeKey)`
 * and will not change when AF15 extends the signature to
 * `isTypeMuted(typeKey, userId)` — just swap the implementation in bootstrapAppRuntime.
 */

import { factorySettings, type HyperIdleDb } from "@hyperidle/db";
import type { NotificationTypeKey } from "@hyperidle/shared";
import { eq } from "drizzle-orm";

/** Read interface used by the drain loop and notification listener. */
export interface MutePreferenceReader {
	isTypeMuted(typeKey: NotificationTypeKey): Promise<boolean>;
}

/** Write interface used by the popover mute shortcut and Settings toggles. */
export interface MutePreferenceWriter {
	setMuted(typeKey: NotificationTypeKey, muted: boolean): Promise<void>;
}

function muteKey(typeKey: NotificationTypeKey): string {
	return `notifications.mute_${typeKey}`;
}

/**
 * Default factory-level reader: reads `factory_settings.notifications.mute_<key>`.
 * Absent = not muted (fail-open).
 */
export function defaultMutePreferenceReader(db: HyperIdleDb): MutePreferenceReader {
	return {
		async isTypeMuted(typeKey: NotificationTypeKey): Promise<boolean> {
			const [row] = await db
				.select()
				.from(factorySettings)
				.where(eq(factorySettings.key, muteKey(typeKey)))
				.limit(1);
			return row?.value === "true";
		},
	};
}

/**
 * Default factory-level writer: writes `factory_settings.notifications.mute_<key>`.
 */
export function defaultMutePreferenceWriter(db: HyperIdleDb): MutePreferenceWriter {
	return {
		async setMuted(typeKey: NotificationTypeKey, muted: boolean): Promise<void> {
			const key = muteKey(typeKey);
			const value = muted ? "true" : "false";
			const now = new Date().toISOString();
			await db
				.insert(factorySettings)
				.values({ key, value, updatedAt: now })
				.onConflictDoUpdate({
					target: factorySettings.key,
					set: { value, updatedAt: now },
				});
		},
	};
}

/** Helper: read all muted type keys (for GET /notifications/mute). */
export async function getMutedTypeKeys(db: HyperIdleDb): Promise<NotificationTypeKey[]> {
	const prefix = "notifications.mute_";
	const rows = await db.select().from(factorySettings);
	const muted: NotificationTypeKey[] = [];
	for (const row of rows) {
		if (row.key.startsWith(prefix) && row.value === "true") {
			const typeKey = row.key.slice(prefix.length) as NotificationTypeKey;
			muted.push(typeKey);
		}
	}
	return muted;
}
