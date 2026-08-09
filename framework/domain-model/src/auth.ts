/**
 * Shared auth types and constants for S1 per-user authentication.
 *
 * @lore S1 SF-3: AUTH_ERROR_CODES is NOT defined here. Error codes live
 * directly in API_ERROR_CODES (api-types.ts) to avoid callers importing
 * from two places. This file contains only invite roles and TTL constants.
 */

/** Roles assignable to users via invite codes. */
export const INVITE_ROLES = ["admin", "member"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

/** Default LoginSession TTL: 30 days in milliseconds. */
export const LOGIN_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Default InviteCode TTL: 7 days in milliseconds. */
export const INVITE_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
