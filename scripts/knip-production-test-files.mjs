// @lore AU28: this used to filter only `/__tests__/`. The production/development split
// makes any `__`-prefixed path segment development (see `scripts/lib/repo-census.ts`), and
// a development file is by definition not production dead code — knip --production must
// not report `__testing__/`, `__fixtures__/`, `__preview__/`, `__e2e__/` or `__scripts__/`
// as unused just because only tests reach them.
const isDevelopmentOwned = path =>
	path
		.replaceAll("\\", "/")
		.split("/")
		.some(segment => segment.startsWith("__"));

export default options => {
	const files = Object.fromEntries(
		Object.entries(options.issues.files).map(([workspace, issues]) => [
			workspace,
			Object.fromEntries(
				Object.entries(issues).filter(
					([path, issue]) => !isDevelopmentOwned(issue.filePath ?? path),
				),
			),
		]),
	);
	const fileCount = Object.values(files).reduce(
		(count, issues) => count + Object.keys(issues).length,
		0,
	);

	return {
		...options,
		issues: { ...options.issues, files },
		counters: { ...options.counters, files: fileCount },
	};
};
