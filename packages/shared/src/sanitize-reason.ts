/**
 * L15 Security HIGH-1 / LOW-1 — sanitize the human-supplied `reason` text
 * before it reaches the agent context.
 *
 * Rules:
 *   1. Normalize to NFC so confusable / decomposed unicode collapses.
 *   2. Strip Unicode format characters (Cf) — zero-width spaces, RTL/LRE
 *      overrides, BIDI marks. These render invisibly and are common
 *      prompt-injection padding.
 *   3. Strip control characters (Cc) except `\n` and `\t`.
 *   4. Trim leading/trailing whitespace.
 *   5. Cap to 2048 characters (matches the route schema; defensive).
 *
 * @lore L15 security: `reason` flows verbatim into agent context via
 * `renderRequestText`. Without this scrub, zero-width unicode + RTL marks
 * are an injection padding vector. The route schema enforces length; this
 * helper normalises the *content* before persistence.
 */

const MAX_REASON_LENGTH = 2048;

export function sanitizeReason(text: string): string {
	const normalised = text.normalize("NFC");
	const noFormat = normalised.replace(/\p{Cf}/gu, "");
	const noControl = noFormat.replace(/\p{Cc}/gu, (ch) =>
		ch === "\n" || ch === "\t" ? ch : "",
	);
	const trimmed = noControl.trim();
	if (trimmed.length <= MAX_REASON_LENGTH) return trimmed;
	return trimmed.slice(0, MAX_REASON_LENGTH);
}
