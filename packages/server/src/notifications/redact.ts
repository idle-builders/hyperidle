/**
 * Scrub secrets from adapter error messages before they land in
 * `notification_queue.last_error` or in structured logs. Reuses the
 * shared `ERROR_TOKEN_PATTERNS` set so all scrub sites (git-export
 * redact, notifications, tool-arg summaries) share one regex table.
 *
 * @lore Security review H2 #9: SMTP error messages from nodemailer
 * occasionally embed the username (e.g., "BadCredentials: Your username
 * is '<user>'"). Once persisted, a future admin UI that exposes
 * `lastError` would surface creds. Scrub at the boundary.
 */

import { ERROR_TOKEN_PATTERNS, REDACTED_TAG } from "@hyperidle/shared";

export interface ScrubContext {
	readonly smtpUsername?: string | null;
	readonly smtpPassword?: string | null;
	readonly ntfyAuthToken?: string | null;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Remove known-secret substrings from `message`. Context-aware values
 * (the live SMTP username/password, ntfy token) are matched first and
 * replaced wholesale; then generic token-shape patterns sweep the rest.
 *
 * @lore H3 security M-1 (unified token-length threshold): we previously
 * skipped short context values (`length < 4`). That left 1–3 char
 * values un-redacted in an error body. We now match any non-empty value —
 * the prior cutoff guarded against accidental matches of common words,
 * but a context value is already known to be a credential by construction.
 */
export function scrubErrorMessage(message: string, ctx: ScrubContext = {}): string {
	let out = message;
	const replacements: Array<string | null | undefined> = [
		ctx.smtpPassword,
		ctx.ntfyAuthToken,
		ctx.smtpUsername,
	];
	for (const value of replacements) {
		if (typeof value !== "string" || value.length < 1) continue;
		const re = new RegExp(escapeRegExp(value), "g");
		out = out.replace(re, REDACTED_TAG);
	}
	for (const re of ERROR_TOKEN_PATTERNS) {
		out = out.replace(re, REDACTED_TAG);
	}
	// Also strip anything that looks like "user='<anything>'" or
	// "password='<anything>'" that nodemailer/ntfy servers may echo.
	out = out.replace(/(user(?:name)?['"=:\s]+)['"]?[^'"]*['"]?/gi, `$1${REDACTED_TAG}`);
	out = out.replace(/(pass(?:word)?['"=:\s]+)['"]?[^'"]*['"]?/gi, `$1${REDACTED_TAG}`);
	return out;
}
