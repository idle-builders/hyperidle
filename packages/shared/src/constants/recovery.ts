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

/**
 * User-facing copy describing the kill-switch blast radius. Surfaced
 * by the AppShell KillSwitchDialog mounts (mobile + desktop) and the
 * Settings → Safety description. Single source of truth.
 *
 * @lore L7 (AI20): the same string used to be inlined in three call
 * sites, with one drifting to a slightly different ending. Hoisted
 * here so a future copy edit is one change, not three.
 */
export const KILL_SWITCH_BLAST_RADIUS =
	"This will pause every running session and block queued tasks until you resume.";

export const KILL_SWITCH_CONFIRM_MODES = ["type_name", "press_hold"] as const;
export type KillSwitchConfirmMode = (typeof KILL_SWITCH_CONFIRM_MODES)[number];
export const DEFAULT_KILL_SWITCH_CONFIRM_MODE: KillSwitchConfirmMode = "press_hold";

/**
 * @lore L7 (SEC12): reject ASCII control characters and DEL in the
 * rationale text. The reason flows into recovery_audit.reason then into
 * structured logs and the eventual Settings → Safety audit feed (L8). A
 * crafted reason containing newlines + ANSI escapes could spoof
 * console-rendered audit entries (split a single row into what looks
 * like multiple lines). Drizzle parameterises queries so this is a
 * presentation-layer attack, not a SQL injection — but the audit feed
 * is a privileged founder surface and log hygiene is part of the audit
 * integrity story.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: deliberate
const NO_CONTROL_CHARS = /^[^\x00-\x1F\x7F]*$/;

/** Required-reason flavour: rollback / kill / mid-session-stop. */
export const reasonRequiredSchema = z
	.string()
	.trim()
	.min(1, "reason is required")
	.max(RATIONALE_MAX_CHARS, `reason must be ≤${RATIONALE_MAX_CHARS} chars`)
	.regex(NO_CONTROL_CHARS, "reason must not contain control characters");

/** Optional-reason flavour: resume verbs. */
export const reasonOptionalSchema = z
	.string()
	.trim()
	.max(RATIONALE_MAX_CHARS, `reason must be ≤${RATIONALE_MAX_CHARS} chars`)
	.regex(NO_CONTROL_CHARS, "reason must not contain control characters")
	.optional();
