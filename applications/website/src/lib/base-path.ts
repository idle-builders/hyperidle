/**
 * Normalize the build-time base path for the static site.
 *
 * The same source must build for "/" (own domain) and "/subpath/"
 * (GitHub Pages project site, reverse-proxied subpath). Astro requires
 * a leading and trailing slash; anything else produces broken asset
 * URLs at every host, so a malformed value fails the build instead of
 * shipping a broken site.
 */
export function normalizeBase(raw: string): string {
	const trimmed = raw.trim();
	if (trimmed.length === 0) {
		throw new Error('HYPERIDLE_SITE_BASE must not be empty — use "/" for a domain root.');
	}
	if (!trimmed.startsWith("/")) {
		throw new Error(`HYPERIDLE_SITE_BASE must start with "/": got "${trimmed}".`);
	}
	const withTrailing = trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
	return withTrailing;
}
