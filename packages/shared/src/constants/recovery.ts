/**
 * L7 — Recovery Verbs (TRACK-L L7) — shared constants/types.
 *
 * Identifiers for the recovery surface — kill switch, rollback,
 * mid-session pause. Used by both the server (Zod request shapes,
 * audit row writers) and the web (KillSwitchDialog props, settings
 * mode preference).
 *
 * @lore Mode default is `press_hold` (mobile-friendly friction). The
 * Settings → Safety tab lets a founder switch to `type_name`.
 */

import { z } from "zod";

export const RECOVERY_VERBS = [
	"factory_pause",
	"factory_resume",
	"rollback",
	"session_pause",
	"session_resume",
] as const;
export type RecoveryVerb = (typeof RECOVERY_VERBS)[number];

export const RECOVERY_TARGET_KINDS = ["factory", "thread", "session"] as const;
export type RecoveryTargetKind = (typeof RECOVERY_TARGET_KINDS)[number];

export const RECOVERY_OUTCOMES = ["pending", "succeeded", "partially", "failed"] as const;
export type RecoveryOutcome = (typeof RECOVERY_OUTCOMES)[number];

export const RATIONALE_MAX_CHARS = 500;
export const PRESS_HOLD_MS = 1500;

export const KILL_SWITCH_CONFIRM_MODES = ["type_name", "press_hold"] as const;
export type KillSwitchConfirmMode = (typeof KILL_SWITCH_CONFIRM_MODES)[number];
export const DEFAULT_KILL_SWITCH_CONFIRM_MODE: KillSwitchConfirmMode = "press_hold";

/** Required-reason flavour: rollback / kill / mid-session-stop. */
export const reasonRequiredSchema = z
	.string()
	.trim()
	.min(1, "reason is required")
	.max(RATIONALE_MAX_CHARS, `reason must be ≤${RATIONALE_MAX_CHARS} chars`);

/** Optional-reason flavour: resume verbs. */
export const reasonOptionalSchema = z
	.string()
	.trim()
	.max(RATIONALE_MAX_CHARS, `reason must be ≤${RATIONALE_MAX_CHARS} chars`)
	.optional();
