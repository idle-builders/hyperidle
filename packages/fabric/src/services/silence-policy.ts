/**
 * @lore Extracted from policy-engine.ts so the E7 policy engine and the
 * H2 dispatcher share a single source of truth for "is this item
 * silenced?". policy-engine.ts imports `isSilenced` from here so the
 * existing unit tests stay green; the dispatcher imports the same
 * function so per-product + per-window silence cannot drift between the
 * two subscribers. Lives at `services/silence-policy.ts` (not nested
 * inside `services/notifications/`) because it is shared across both
 * consumers — nesting under one consumer's folder would make the other's
 * dependency direction look like a reach-across-subfolder.
 */

// @lore U1: `teams` is now the domain entity. `teamMembers` is the agent membership group.
// `users.teamId` references `teamMembers.id`; silence keys use `teamMembers.teamId` (domains.id).
import { factorySettings, type HyperIdleDb, teamMembers, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";

interface SilenceItem {
	readonly sourceAgentId: string | null;
}

/**
 * True when the item should be held in the silence queue rather than pushed.
 *
 * Inputs consulted (in priority order):
 *  1. `factory_settings.silence_mode` — factory-wide kill switch
 *  2. `factory_settings.silence_product_<productId>` — per-product silence
 *  3. `factory_settings.silence_window_start` + `silence_window_end` —
 *     UTC time window, supports overnight windows (e.g. 22:00 → 07:00)
 */
export async function isSilenced(db: HyperIdleDb, item: SilenceItem, now: Date): Promise<boolean> {
	// 1. Factory-wide silence
	const [silenceMode] = await db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, "silence_mode"))
		.limit(1);
	if (silenceMode?.value === "true") return true;

	// 2. Per-product (per-team) silence
	// @lore U1: agent.teamId → teamMembers.id → teamMembers.teamId (= teams.id, domain entity).
	if (item.sourceAgentId) {
		const [agent] = await db.select().from(users).where(eq(users.id, item.sourceAgentId)).limit(1);
		if (agent?.teamId) {
			const [memberGroup] = await db
				.select()
				.from(teamMembers)
				.where(eq(teamMembers.id, agent.teamId))
				.limit(1);
			if (memberGroup) {
				const [productSilence] = await db
					.select()
					.from(factorySettings)
					.where(eq(factorySettings.key, `silence_product_${memberGroup.teamId}`))
					.limit(1);
				if (productSilence?.value === "true") return true;
			}
		}
	}

	// 3. Silence window
	const [windowStart] = await db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, "silence_window_start"))
		.limit(1);
	const [windowEnd] = await db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, "silence_window_end"))
		.limit(1);

	if (windowStart && windowEnd) {
		if (isInSilenceWindow(windowStart.value, windowEnd.value, now)) return true;
	}

	return false;
}

/**
 * True when `now` falls within the "HH:MM" UTC window [start, end]. Both
 * endpoints are inclusive. Supports overnight windows where `start > end`.
 */
export function isInSilenceWindow(startStr: string, endStr: string, now: Date): boolean {
	const startParts = startStr.split(":").map(Number);
	const endParts = endStr.split(":").map(Number);
	if (startParts.length !== 2 || endParts.length !== 2) return false;
	const [startH, startM] = startParts;
	const [endH, endM] = endParts;
	if (!(Number.isFinite(startH) && Number.isFinite(startM))) return false;
	if (!(Number.isFinite(endH) && Number.isFinite(endM))) return false;

	const startMinutes = startH * 60 + startM;
	const endMinutes = endH * 60 + endM;
	const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

	if (startMinutes <= endMinutes) {
		return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
	}
	// Overnight window: e.g. 22:00 → 07:00
	return nowMinutes >= startMinutes || nowMinutes <= endMinutes;
}
