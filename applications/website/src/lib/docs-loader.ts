/**
 * Entry-id mapping for the docs collection (glob loader over the repo docs/
 * tree). `entry` is repo-root-relative (e.g. "docs/product/index.md").
 *
 * URL contract: each doc renders at <base>docs/<rest>/, where <rest> is the
 * path under docs/ without the .md suffix — except a directory's index.md,
 * which renders at the directory URL itself (docs/product/index.md →
 * /docs/product/), so every directory has exactly one canonical entry page.
 * The id doubles as the [...slug] route param.
 */
export function docEntryId(entry: string): string {
	const withoutSuffix = entry.replace(/^docs\//, "").replace(/\.md$/, "");
	return withoutSuffix.replace(/\/index$/, "");
}
