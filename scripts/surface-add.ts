#!/usr/bin/env tsx
/**
 * AL5 — `add <source>` CLI: install a community surface into the build.
 *
 * Usage:
 *   npm run surface:add -- <source>
 *
 * where <source> is one of:
 *   https://example.com/surfaces/foo/registry-item.json   (URL)
 *   github:owner/repo/item                                (GitHub shorthand)
 *   /absolute/path/to/surface                             (local path)
 *   ./relative/path/to/surface                            (local relative)
 *
 * The command copies the surface's source files into
 *   surfaces/<surfaceId>/
 * relative to the repo root. The human then reviews, commits, and rebuilds.
 *
 * This is a BUILD-TIME action — no runtime eval of fetched code.
 * The copied files are plain TypeScript/JSON; the human reviews before commit.
 *
 * @lore AL5 ETHOS (code-not-config): `add` writes files to disk for a human
 * to review + commit + rebuild. It never eval()s or dynamically loads fetched code.
 * Security is minimal hygiene: write only into surfaces/, validate manifest shape.
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { installSurface, parseAddSource } from "../packages/shared/src/add-install.js";

// Repo root = dirname of this script's parent.
const __filename = fileURLToPath(import.meta.url);
const repoRoot = join(__filename, "..", "..");
const DEFAULT_SURFACES_DIR = join(repoRoot, "surfaces");

async function main(): Promise<void> {
	const args = process.argv.slice(2);

	if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
		process.stdout.write(
			[
				"Usage: npm run surface:add -- <source>",
				"",
				"Installs a surface into surfaces/<surfaceId>/ for review + commit.",
				"",
				"Source forms:",
				"  https://example.com/surfaces/foo/registry-item.json",
				"  github:owner/repo/item",
				"  /absolute/path/to/surface",
				"  ./relative/path",
				"",
				"After install: review the files, commit, and rebuild (npm run build).",
				"",
			].join("\n"),
		);
		process.exit(0);
	}

	const sourceStr = args[0];
	if (!sourceStr) {
		process.stderr.write("Error: no source provided.\n");
		process.exit(1);
	}

	let source: ReturnType<typeof parseAddSource>;
	try {
		source = parseAddSource(sourceStr);
	} catch (err) {
		process.stderr.write(
			`Error: ${err instanceof Error ? err.message : String(err)}\n`,
		);
		process.exit(1);
	}

	// Ensure the surfaces dir exists.
	await mkdir(DEFAULT_SURFACES_DIR, { recursive: true });

	process.stdout.write(`Installing surface from ${source.type} source…\n`);

	let result: Awaited<ReturnType<typeof installSurface>>;
	try {
		result = await installSurface({ source, targetDir: DEFAULT_SURFACES_DIR });
	} catch (err) {
		process.stderr.write(
			`Error: install failed — ${err instanceof Error ? err.message : String(err)}\n`,
		);
		process.exit(1);
	}

	process.stdout.write(
		[
			`Installed: ${result.surfaceId}`,
			`  Path: ${result.installedPath}`,
			"",
			"Next steps:",
			`  1. Review the files in ${result.installedPath}`,
			"  2. Commit the files (git add surfaces/ && git commit)",
			"  3. Rebuild (npm run build)",
			"  4. Adopt the surface in Settings › Review surfaces",
			"",
		].join("\n"),
	);
}

main().catch((err: unknown) => {
	process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
	process.exit(1);
});
