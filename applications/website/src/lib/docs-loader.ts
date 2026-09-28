// @lore: docEntryId — a directory's index.md collapses to the directory URL; every directory has exactly one canonical entry page
export function docEntryId(entry: string): string {
	const withoutSuffix = entry.replace(/^docs\//, "").replace(/\.md$/, "");
	return withoutSuffix.replace(/\/index$/, "");
}
