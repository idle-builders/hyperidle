const isTestOwned = path => `/${path.replaceAll("\\", "/")}`.includes("/__tests__/");

export default options => {
	const files = Object.fromEntries(
		Object.entries(options.issues.files).map(([workspace, issues]) => [
			workspace,
			Object.fromEntries(
				Object.entries(issues).filter(
					([path, issue]) => !isTestOwned(issue.filePath ?? path),
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
