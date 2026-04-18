/**
 * Scrub secrets from adapter error messages before they land in
 * `notification_queue.last_error` or in structured logs. Reuses the token
 * regexes used by the git-export runner (`redactArg` in
 * `services/git-export-runner.ts`).
 *
 * @lore Security review H2 #9: SMTP error messages from nodemailer
 * occasionally embed the username (e.g., "BadCredentials: Your username
 * is '<user>'"). Once persisted, a future admin UI that exposes
 * `lastError` would surface creds. Scrub at the boundary.
 */

export interface ScrubContext {
	readonly smtpUsername?: string | null;
	readonly smtpPassword?: string | null;
	readonly ntfyAuthToken?: string | null;
}

const TOKEN_PATTERNS: ReadonlyArray<RegExp> = [
	/gh[pousr]_[A-Za-z0-9]{20,}/g,
	/Bearer\s+[A-Za-z0-9._\-]{8,}/g,
	/\btk_[A-Za-z0-9._\-]{8,}/g,
	/\b[A-Fa-f0-9]{32,}\b/g,
];

const REDACTED = "[REDACTED]" as const;

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Remove known-secret substrings from `message`. Context-aware values
 * (the live SMTP username/password, ntfy token) are matched first and
 * replaced wholesale; then generic token-shape patterns sweep the rest.
 */
export function scrubErrorMessage(message: string, ctx: ScrubContext = {}): string {
	let out = message;
	const replacements: Array<string | null | undefined> = [
		ctx.smtpPassword,
		ctx.ntfyAuthToken,
		ctx.smtpUsername,
	];
	for (const value of replacements) {
		if (typeof value !== "string" || value.length < 4) continue;
		const re = new RegExp(escapeRegExp(value), "g");
		out = out.replace(re, REDACTED);
	}
	for (const re of TOKEN_PATTERNS) {
		out = out.replace(re, REDACTED);
	}
	// Also strip anything that looks like "user='<anything>'" or
	// "password='<anything>'" that nodemailer/ntfy servers may echo.
	out = out.replace(/(user(?:name)?['"=:\s]+)['"]?[^'"]*['"]?/gi, `$1${REDACTED}`);
	out = out.replace(/(pass(?:word)?['"=:\s]+)['"]?[^'"]*['"]?/gi, `$1${REDACTED}`);
	return out;
}
