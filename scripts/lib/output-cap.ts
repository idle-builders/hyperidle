// Groups errors by file and caps at maxFiles. Returns TOON-ready structure.

export interface FileErrors {
	file: string;
	errors: string[];
}

export interface CappedResult {
	status: "passed" | "failed";
	tool: string;
	totalFiles: number;
	totalErrors: number;
	shownFiles: number;
	files: FileErrors[];
}

export function groupByFile(output: string, errorPattern: RegExp): FileErrors[] {
	const groups = new Map<string, string[]>();
	let match: RegExpExecArray | null;
	const re = new RegExp(errorPattern.source, `${errorPattern.flags.replace("g", "")}gm`);
	while ((match = re.exec(output)) !== null) {
		const file = match[1] ?? "unknown";
		const msg = match[0];
		const existing = groups.get(file);
		if (existing) {
			existing.push(msg);
		} else {
			groups.set(file, [msg]);
		}
	}
	return [...groups.entries()].map(([file, errors]) => ({ file, errors }));
}

export function capByFile(grouped: FileErrors[], maxFiles: number): CappedResult & { files: FileErrors[] } {
	const totalFiles = grouped.length;
	const totalErrors = grouped.reduce((sum, g) => sum + g.errors.length, 0);
	const shown = grouped.slice(0, maxFiles);
	return {
		status: totalFiles === 0 ? "passed" : "failed",
		tool: "",
		totalFiles,
		totalErrors,
		shownFiles: shown.length,
		files: shown,
	};
}

export function toToon(result: CappedResult): string {
	const lines: string[] = [];
	lines.push(`status: ${result.status}`);
	lines.push(`tool: ${result.tool}`);
	lines.push(`totalFiles: ${result.totalFiles}`);
	lines.push(`totalErrors: ${result.totalErrors}`);
	if (result.totalFiles > result.shownFiles) {
		lines.push(`showing: ${result.shownFiles} of ${result.totalFiles} files`);
	}
	for (let i = 0; i < result.files.length; i++) {
		const f = result.files[i];
		lines.push(`files[${i}].path: ${f.file}`);
		lines.push(`files[${i}].count: ${f.errors.length}`);
		for (let j = 0; j < f.errors.length; j++) {
			const err = f.errors[j];
			if (err.includes("\n")) {
				lines.push(`files[${i}].errors[${j}]: |`);
				for (const line of err.split("\n")) {
					lines.push(`  ${line}`);
				}
			} else {
				lines.push(`files[${i}].errors[${j}]: ${err}`);
			}
		}
	}
	return lines.join("\n");
}
