export function docEntryId(entry: string): string {
	const withoutSuffix = entry.replace(/^docs\//, "").replace(/\.md$/, "");
	return withoutSuffix.replace(/\/index$/, "");
}
