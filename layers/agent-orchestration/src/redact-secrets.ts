/**
 * Strip anything that looks like a credential out of arbitrary text before it
 * leaves the git runner — an error message, a Check reason, an event, a log
 * line.
 *
 * @lore BA5 §6.3: replaces the old `redactArg`, which only stripped URL
 * userinfo when the WHOLE string was one bare URL (`git-runner.ts`'s previous
 * `redactArg`). Git's own error text embeds a URL inside a sentence
 * ("fatal: unable to access 'https://user:pass@host/...'"), so this scans for
 * the pattern anywhere in the text instead of requiring an exact match.
 * `secrets` are the literal values the caller knows are live for this one
 * call (typically `GIT_CONFIG_VALUE_n` / `GH_TOKEN` from that call's env) —
 * literal-replaced first, because a PAT does not always match the `gh*_`
 * shape (an enterprise or classic token, or a value BA5 does not yet know
 * about).
 */
export function redactSecrets(text: string, secrets: readonly string[]): string {
	let out = text;
	for (const secret of secrets) {
		if (secret.length === 0) continue;
		out = out.split(secret).join("[REDACTED]");
	}
	// scheme://user:pass@host -> scheme://host, anywhere in the text.
	out = out.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, "$1");
	// GitHub token shapes (ghp_, gho_, ghu_, ghs_, ghr_) that slipped in some
	// other way than the literal-secret list above.
	out = out.replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, "[REDACTED]");
	return out;
}
