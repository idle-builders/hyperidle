// Asserts the three version sources that must move together are identical:
//   - root package.json `version`        (source of truth; backend release trigger)
//   - packages/desktop/package.json       (names the DMG via electron-builder)
//   - chart/Chart.yaml `appVersion`       (deployed backend app version)
//
// Run by the Release Guard PR check whenever the root version changes. Keeps a
// version bump from shipping a desktop DMG named for a different version, or a
// chart that reports the wrong appVersion.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readJsonVersion(relPath: string): string {
	const raw = readFileSync(resolve(process.cwd(), relPath), "utf-8");
	const parsed = JSON.parse(raw) as { version?: unknown };
	if (typeof parsed.version !== "string") {
		throw new Error(`${relPath}: missing string "version" field`);
	}
	return parsed.version;
}

function readChartAppVersion(relPath: string): string {
	const raw = readFileSync(resolve(process.cwd(), relPath), "utf-8");
	const match = raw.match(/^appVersion:\s*"?([^"\n]+)"?\s*$/m);
	if (!match) {
		throw new Error(`${relPath}: no appVersion field found`);
	}
	return match[1].trim();
}

function main(): void {
	const sources: Record<string, string> = {
		"package.json": readJsonVersion("package.json"),
		"packages/desktop/package.json": readJsonVersion("packages/desktop/package.json"),
		"chart/Chart.yaml (appVersion)": readChartAppVersion("chart/Chart.yaml"),
	};

	const root = sources["package.json"];
	const mismatched = Object.entries(sources).filter(([, v]) => v !== root);

	if (mismatched.length > 0) {
		process.stderr.write("check-version-sync: version sources are out of sync\n");
		for (const [name, version] of Object.entries(sources)) {
			process.stderr.write(`  ${name}: ${version}\n`);
		}
		process.stderr.write(
			`\nAll three must equal the root version (${root}). ` +
				"Run `./packages/desktop/scripts/release.sh <version>` to bump them together.\n",
		);
		process.exit(1);
	}

	process.stdout.write(`check-version-sync: OK — all version sources at ${root}\n`);
}

main();
