/**
 * build-surface — author tooling for pre-building drop-in review surface modules.
 *
 * Usage: npx tsx scripts/build-surface.ts <path-to.tsx> [--out <dir>]
 *
 * Bundles a single surface .tsx file to a portable ESM .js module.
 * react, react/jsx-runtime, and react-dom are marked external — the host
 * app provides them at runtime via the import map in index.html.
 *
 * Default output dir: current working directory.
 *
 * @lore AL5: This runs at AUTHOR TIME (repo checkout) using the repo's esbuild
 * devDependency. It does NOT run inside the shipped Electron app. End users
 * receive the pre-built .js and drop it in ~/.hyperidle/surfaces/.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as esbuild from "esbuild";

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
	process.stderr.write(
		"Usage: npx tsx scripts/build-surface.ts <path-to.tsx> [--out <dir>]\n\n" +
			"  Bundles a review surface .tsx to a portable ESM .js module.\n" +
			"  react and react/jsx-runtime are externalized (provided by the host app).\n" +
			"  Output filename: <name>.js in the specified --out dir (default: cwd).\n",
	);
	process.exit(1);
}

const sourcePath = path.resolve(args[0] ?? "");

if (!fs.existsSync(sourcePath)) {
	process.stderr.write(`Error: source file not found: ${sourcePath}\n`);
	process.exit(1);
}

// Parse --out <dir>
let outDir = process.cwd();
const outIdx = args.indexOf("--out");
if (outIdx !== -1) {
	const rawOut = args[outIdx + 1];
	if (!rawOut) {
		process.stderr.write("Error: --out requires a directory argument\n");
		process.exit(1);
	}
	outDir = path.resolve(rawOut);
}

fs.mkdirSync(outDir, { recursive: true });

const baseName = path.basename(sourcePath, path.extname(sourcePath));
const outFile = path.join(outDir, `${baseName}.js`);

await esbuild.build({
	entryPoints: [sourcePath],
	bundle: true,
	format: "esm",
	platform: "browser",
	target: ["es2022"],
	outfile: outFile,
	/**
	 * @lore AL5: React and react-dom are externalized so the loaded module
	 * uses the host app's single React instance. This prevents the
	 * "invalid hook call" error that occurs when two React copies exist.
	 * The host provides them via the import map + shim modules.
	 *
	 * @lore AL5: jsx: "automatic" uses the new JSX transform (react/jsx-runtime).
	 * This emits `import { jsx as _jsx } from "react/jsx-runtime"` (which is
	 * also externalized) instead of `React.createElement`. Both work — automatic
	 * is preferred because it does not require an `import React` in scope.
	 */
	external: ["react", "react/jsx-runtime", "react-dom"],
	jsx: "automatic",
	// minify off — surfaces are author-distributed JS, readable is friendlier
	minify: false,
	sourcemap: false,
});

process.stdout.write(`Built: ${outFile}\n`);
