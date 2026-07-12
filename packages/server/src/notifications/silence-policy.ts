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
import { factorySettings, type HyperIdleDb, teamMembers } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { getUserById } from "../services/user-store.js";

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
		const agent = await getUserById(db, item.sourceAgentId);
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
 * AF8: FACTORY SILENCE only (no quiet-hours window check).
 *
 * Returns true when silence_mode=true OR per-product silence applies.
 * Does NOT check the silence_window_start/end.
 *
 * Used by the drain's cost-breach split: a hard cost_breach bypasses factory
 * silence but RESPECTS quiet hours (concept hard rule #8). Checking them
 * independently (this function + isInSilenceWindow) is the split.
 *
 * @lore AF8: COST-BREACH SILENCE SPLIT — the original flushQueue collapsed
 * both factory silence and quiet-hours into one isSilenced() boolean, then
 * exempted cost_breach from all of it. This violated hard rule #8 (a cost
 * breach during quiet hours would page the founder). The fix: two independent
 * predicates. cost_breach: bypass isFactorySilenced, respect isInSilenceWindow.
 * isSilenced() is kept as the OR-of-both for the blocking-row path (back-compat).
 */
export async function isFactorySilenced(db: HyperIdleDb, item: SilenceItem): Promise<boolean> {
	// 1. Factory-wide silence
	const [silenceMode] = await db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, "silence_mode"))
		.limit(1);
	if (silenceMode?.value === "true") return true;

	// 2. Per-product (per-team) silence
	if (item.sourceAgentId) {
		const agent = await getUserById(db, item.sourceAgentId);
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

	return false;
}

/**
 * AF8: Read the quiet-hours window endpoints from factory_settings.
 * Returns null if not configured.
 */
export async function readSilenceWindow(
	db: HyperIdleDb,
): Promise<{ start: string; end: string } | null> {
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
		return { start: windowStart.value, end: windowEnd.value };
	}
	return null;
}

/**
 * True when `now` falls within the "HH:MM" UTC window [start, end]. Both
 * endpoints are inclusive. Supports overnight windows where `start > end`.
 */
export function isInSilenceWindow(startStr: string, endStr: string, now: Date): boolean {
	const startParts = startStr.split(":").map(Number);
	const endParts = endStr.split(":").map(Number);
	if (startParts.length !== 2 || endParts.length !== 2) return false;
	// @lore AF3 C6: length guards above prove presence; index directly and guard
	// undefined to satisfy noUncheckedIndexedAccess without changing behavior.
	const startH = startParts[0];
	const startM = startParts[1];
	const endH = endParts[0];
	const endM = endParts[1];
	if (startH === undefined || startM === undefined) return false;
	if (endH === undefined || endM === undefined) return false;
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
