/**
 * Return true only for HTTP(S) hrefs. Used by canvas source-link affordances so
 * that agent-authored `sourceHref` values cannot be rendered as `javascript:` or
 * other dangerous schemes.
 */
export function isSafeSourceHref(href: string): boolean {
	return /^https?:\/\//i.test(href);
}
