/**
 * Shared secret-token regex patterns used to scrub error messages and
 * tool-arg summaries across the server. Consolidated here so inline
 * scrubbers (summarizeToolArgs) and context-aware error
 * scrubbers (notifications/redact.scrubErrorMessage)
 * share a single set of patterns.
 *
 * Redaction sentinels differ per call site: `summarizeToolArgs` keeps
 * the prefix ("Bearer [REDACTED]", "sk-[REDACTED]") because the result
 * is user-visible in logs; the context-aware variant writes a flat
 * "[REDACTED]".
 */

export const REDACTED_TAG = "[REDACTED]" as const;

/** GitHub personal-access / user-to-server tokens. */
const GITHUB_TOKEN_RE: RegExp = /gh[pousr]_[A-Za-z0-9]{20,}/g;

/** `Bearer <token>` in HTTP Authorization headers. */
const BEARER_TOKEN_RE: RegExp = /Bearer\s+[A-Za-z0-9._-]{8,}/g;

/** OpenAI / generic "sk-" secret key shape. */
const SK_TOKEN_RE: RegExp = /sk-[A-Za-z0-9._-]{8,}/g;

/** Generic "pk-" publishable key shape. */
const PK_TOKEN_RE: RegExp = /pk-[A-Za-z0-9._-]{8,}/g;

/** `tk_`-prefixed generic tokens. */
const TK_TOKEN_RE: RegExp = /\btk_[A-Za-z0-9._-]{8,}/g;

/** 32+ hex chars (covers many API secret shapes). */
const HEX_TOKEN_RE: RegExp = /\b[A-Fa-f0-9]{32,}\b/g;

/** AWS access key (AKIA + 16 uppercase alnum). */
const AWS_AKIA_RE: RegExp = /\bAKIA[0-9A-Z]{16}\b/g;

/** Slack tokens: xox[abpsr]-... */
const SLACK_TOKEN_RE: RegExp = /\bxox[abpsr]-[A-Za-z0-9-]{10,}\b/g;

/** Google API keys: AIza followed by 35 alnum / _ / -. */
const GOOGLE_API_KEY_RE: RegExp = /\bAIza[0-9A-Za-z_-]{35}\b/g;

/** JWTs: three base64url segments separated by dots, starting with eyJ. */
const JWT_RE: RegExp = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

/** Stripe live/test keys: sk_live_, sk_test_, pk_live_, pk_test_, rk_live_, rk_test_. */
const STRIPE_TOKEN_RE: RegExp = /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}\b/g;

/** PEM private-key body (BEGIN ... END block). Multiline-safe. */
const PEM_BLOCK_RE: RegExp =
	/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g;

/**
 * Generic error-message patterns — replace with flat `[REDACTED]`.
 * Order matters: more specific patterns (PEM, JWT, Stripe, AWS, Slack,
 * Google) run first so the generic hex/bearer sweep doesn't nibble off
 * parts of them.
 */
export const ERROR_TOKEN_PATTERNS: ReadonlyArray<RegExp> = [
	PEM_BLOCK_RE,
	JWT_RE,
	STRIPE_TOKEN_RE,
	AWS_AKIA_RE,
	SLACK_TOKEN_RE,
	GOOGLE_API_KEY_RE,
	GITHUB_TOKEN_RE,
	BEARER_TOKEN_RE,
	TK_TOKEN_RE,
	HEX_TOKEN_RE,
];

/**
 * Inline tool-arg patterns — preserve the token prefix so the log
 * remains greppable ("Bearer [REDACTED]", "sk-[REDACTED]"). Used by
 * `summarizeToolArgs`.
 *
 * @lore H3 security M-2: broadened to include AWS AKIA, Slack xox,
 * Google AIza, JWT, Stripe live/test, and PEM blocks. Previous coverage
 * (bearer + sk-/pk- + github) missed common credential shapes that
 * agents routinely encounter in tool results.
 */
export function scrubInlineTokens(input: string): string {
	return input
		.replace(PEM_BLOCK_RE, "[REDACTED_PEM]")
		.replace(JWT_RE, "[REDACTED_JWT]")
		.replace(STRIPE_TOKEN_RE, "[REDACTED]")
		.replace(AWS_AKIA_RE, "[REDACTED_AKIA]")
		.replace(SLACK_TOKEN_RE, "[REDACTED_SLACK]")
		.replace(GOOGLE_API_KEY_RE, "[REDACTED_GOOGLE]")
		.replace(BEARER_TOKEN_RE, "Bearer [REDACTED]")
		.replace(SK_TOKEN_RE, "sk-[REDACTED]")
		.replace(PK_TOKEN_RE, "pk-[REDACTED]")
		.replace(GITHUB_TOKEN_RE, "[REDACTED]");
}

/**
 * Bounded preview of tool-call args. Strips common secret shapes and
 * caps length at 512 chars. Never returns the raw object — the caller
 * must treat the result as opaque.
 *
 * @lore AU20 Ab3: relocated from `@hyperidle/observability`'s `dispatcher.ts`
 * — `summarizeToolArgs` touches no observability state (it is
 * `scrubInlineTokens(JSON.stringify(args))` + truncation, sitting next to
 * `scrubInlineTokens`). Moving it here removes observability's only
 * cross-service export and makes it a pure platform runtime.
 *
 * @lore Scrub BEFORE truncation (adversary review H3 #11): a secret
 * straddling the truncation boundary would have its tail cut off and
 * become un-matchable by the regex. Scrubbing first replaces the full
 * secret with a short sentinel, then we truncate the scrubbed output.
 */
export function summarizeToolArgs(args: Record<string, unknown>): string {
	const json = redactSafeStringify(args);
	const scrubbed = scrubInlineTokens(json);
	return scrubbed.length > 512 ? `${scrubbed.slice(0, 509)}...` : scrubbed;
}

function redactSafeStringify(value: unknown): string {
	try {
		return JSON.stringify(value) ?? "";
	} catch {
		return "[unserialisable]";
	}
}
