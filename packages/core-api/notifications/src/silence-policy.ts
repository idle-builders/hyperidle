/**
 * @lore Extracted from policy-engine.ts so the E7 policy engine and the
 * H2 dispatcher share a single source of truth for "is this item
 * silenced?". policy-engine.ts imports `isSilenced` from here.
 *
 * @lore AU18: re-backed onto `server_config.notifications.silence`.
 *
 * @lore AU19 Increment 1g: converted to injected deps (Mechanism C).
 *
 * @lore AU20 Stage 2: isFactorySilenced, readSilenceWindow, isInSilenceWindow
 * removed from public surface — private sub-predicates are implementation
 * detail. Only `isSilenced` remains exported. The former integration test that
 * asserted `isInSilenceWindow` directly is removed; coverage comes through
 * `isSilenced`. install.ts keeps private copies for the dispatcher path.
 */

// @lore U1: `teams` is now the domain entity. `teamMembers` is the agent membership group.
import type { HyperIdleDb } from "@hyperidle/db";
import type { NotificationsDeps } from "./ports.js";

type SilenceDeps = Pick<NotificationsDeps, "serverConfig" | "users" | "teams">;

interface SilenceItem {
	readonly sourceAgentId: string | null;
}

export function isInSilenceWindow(startStr: string, endStr: string, now: Date): boolean {
	const startParts = startStr.split(":").map(Number);
	const endParts = endStr.split(":").map(Number);
	if (startParts.length !== 2 || endParts.length !== 2) return false;
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
	if (startMinutes <= endMinutes) return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
	return nowMinutes >= startMinutes || nowMinutes <= endMinutes;
}

/**
 * True when the current time falls inside the server-config silence window.
 *
 * Companion to `isSilenced` for the AF8 cost-breach split: hard cost-breach
 * events bypass factory-wide / per-team silence but still respect the quiet-
 * hours window. Callers that need ONLY the window check use this instead of
 * `isSilenced`.
 */
export async function isWindowSilenced(
	db: HyperIdleDb,
	now: Date,
	deps: Pick<SilenceDeps, "serverConfig">,
): Promise<boolean> {
	const { notifications } = await deps.serverConfig.read(db);
	const { windowStart, windowEnd } = notifications.silence;
	if (windowStart !== null && windowEnd !== null) {
		return isInSilenceWindow(windowStart, windowEnd, now);
	}
	return false;
}

/**
 * True when the item should be held in the silence queue rather than pushed.
 *
 * Inputs consulted (in priority order), all read from
 * `server_config.notifications.silence`:
 *  1. `mode` — factory-wide kill switch
 *  2. `silencedTeamIds` — per-team silence
 *  3. `windowStart` + `windowEnd` — UTC time window, supports overnight
 *     windows (e.g. 22:00 → 07:00)
 */
export async function isSilenced(
	db: HyperIdleDb,
	item: SilenceItem,
	now: Date,
	deps: SilenceDeps,
): Promise<boolean> {
	const { notifications } = await deps.serverConfig.read(db);
	const { silence } = notifications;

	// 1. Factory-wide silence
	if (silence.mode) return true;

	// 2. Per-product (per-team) silence
	// @lore U1: agent.teamId → teamMembers.id → teamMembers.teamId (= teams.id, domain entity).
	if (item.sourceAgentId) {
		const agent = await deps.users.getUserById(db, item.sourceAgentId);
		if (agent?.teamId) {
			const memberGroup = await deps.teams.getTeamMembersById(db, agent.teamId);
			if (memberGroup && silence.silencedTeamIds.includes(memberGroup.teamId)) return true;
		}
	}

	// 3. Silence window
	if (silence.windowStart !== null && silence.windowEnd !== null) {
		if (isInSilenceWindow(silence.windowStart, silence.windowEnd, now)) return true;
	}

	return false;
}
