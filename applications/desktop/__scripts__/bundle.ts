/**
 * esbuild configuration for the desktop production bundle.
 *
 * Bundles from main.ts (single entry) to dist/main.cjs.
 * A separate preload entry produces dist/preload.js.
 * splash.html is copied to dist/.
 *
 * @lore N5: We bundle from main.ts (Option B) rather than a separate server
 * entry (Option A). This inlines @hyperidle/server, @hyperidle/db, etc. into
 * one CJS file, eliminating split-brain dependency management and runtime
 * require() tricks.
 *
 * @lore PGlite migration: postgres and drizzle-orm/postgres-js are stubbed
 * (not externalized) via the pgStubPlugin. Desktop uses PGlite (not
 * postgres-js), so these code paths are never reached. @electric-sql/pglite
 * is externalized (not stubbed) — it must be available at runtime since
 * desktop now uses PGlite as its database engine. The WASM binary ships
 * inside the pglite package and must be resolvable from node_modules.
 *
 * @lore N5: Node target is node24 (NOT node22). Electron 42 ships Node 24.x
 * (ABI 137). Using node22 produces a technically working but incorrect build
 * that prevents use of Node 24 APIs. Updated from node22 in Electron 36→42 upgrade.
 *
 * @lore N5: preload output is preload.js (not preload.cjs) so that main.ts's
 * existing `path.join(Dirname, "preload.js")` reference works in both dev
 * (tsx resolves .js → .ts) and production (esbuild outputs preload.js).
 * See architecture.md §4b for the full explanation.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as esbuild from "esbuild";

const DESKTOP_DIR = path.resolve(import.meta.dirname, "..");
const DIST_DIR = path.join(DESKTOP_DIR, "dist");

// Clean dist on every build
fs.rmSync(DIST_DIR, { recursive: true, force: true });
fs.mkdirSync(DIST_DIR, { recursive: true });

// Packages that must NOT be bundled:
// - electron: provided by the Electron runtime at startup
// - @electric-sql/pglite: WASM binary must be loaded from disk at runtime
const EXTERNALS = ["electron", "@electric-sql/pglite"];

// VPS/cloud-only modules that the @hyperidle/db barrel pulls in via
// pg-connection.ts. Desktop uses PGlite only — these are never called at
// runtime. Stubbed at bundle time to avoid dangling require() calls.
const PG_STUB_MODULES = ["postgres", "drizzle-orm/postgres-js"];

// AJV runtime helpers referenced by dynamically-generated validators inside
// @modelcontextprotocol/sdk (a direct server dep via mcp/mcp-bridge.ts inbound bridge).
// esbuild inlines the validator code but the generated validators re-emit
// require("ajv/dist/runtime/...") calls at runtime. Since node_modules are NOT
// packaged with the Electron app (only dist/**/* is included), these sub-path
// requires would fail at startup. We stub them with minimal shims that satisfy
// the interface expected by the generated validators.
// @lore desktop: AJV runtime stubs — generated MCP validators emit require()
// calls for ajv runtime helpers. Stubs prevent startup failures in packaged app.
const AJV_STUB_MODULES = [
	"ajv/dist/runtime/validation_error",
	"ajv/dist/runtime/uri",
	"ajv/dist/runtime/ucs2length",
	"ajv/dist/runtime/equal",
	"ajv-formats/dist/formats",
];

const pgStubPlugin: esbuild.Plugin = {
	name: "pg-stub",
	setup(build) {
		const stubModules = [...PG_STUB_MODULES, ...AJV_STUB_MODULES];
		const escaped = stubModules.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
		const filter = new RegExp(`^(${escaped.join("|")})$`);
		build.onResolve({ filter }, (args) => ({
			path: args.path,
			namespace: "pg-stub",
		}));
		build.onLoad({ filter: /.*/, namespace: "pg-stub" }, () => ({
			contents: "module.exports = {};",
			loader: "js",
		}));
	},
};

// Bundle main process
// @lore desktop: import.meta.url is undefined in CJS output — esbuild replaces
// import.meta with an empty object, so import.meta.url becomes undefined. Transitive
// deps (MCP SDK) call createRequire(import.meta.url) without a __dirname guard,
// crashing at startup. We use define+banner to replace import.meta.url with a
// CJS-compatible runtime expression before esbuild creates the empty shim.
await esbuild.build({
	entryPoints: [path.join(DESKTOP_DIR, "src/main.ts")],
	bundle: true,
	platform: "node",
	// @lore N5: Electron 42 ships Node 24.x — use node24 as the esbuild target.
	target: "node24",
	format: "cjs",
	outfile: path.join(DIST_DIR, "main.cjs"),
	external: EXTERNALS,
	plugins: [pgStubPlugin],
	define: {
		"import.meta.url": "__IMPORT_META_URL__",
	},
	banner: {
		js: 'var __IMPORT_META_URL__ = require("url").pathToFileURL(__filename).href;',
	},
	// sourcemap: true for crash diagnostics — stack traces must be readable
	sourcemap: true,
	// minify: false — crash stack traces must be human-readable; bundle size is
	// irrelevant for a desktop app
	minify: false,
});

// Bundle preload script (separate Electron context — cannot share main bundle)
await esbuild.build({
	entryPoints: [path.join(DESKTOP_DIR, "src/preload.ts")],
	bundle: true,
	platform: "node",
	target: "node22",
	format: "cjs",
	// Output as preload.js (not preload.cjs) so main.ts's existing reference to
	// "preload.js" works in both dev mode (tsx resolves .js→.ts) and production
	outfile: path.join(DIST_DIR, "preload.js"),
	external: ["electron"],
	sourcemap: false,
	minify: false,
});

// Copy splash.html to dist — main.ts loads it via path.join(Dirname, "splash.html")
// where Dirname resolves to dist/ in the bundled CJS output
fs.copyFileSync(path.join(DESKTOP_DIR, "src/splash.html"), path.join(DIST_DIR, "splash.html"));

// Post-bundle validation: scan output for require() calls that reference modules
// not available in the packaged app. Catches the class of bug where an external
// module is missing at runtime (e.g. drizzle-orm/postgres-js in v0.1.0).
import { isBuiltin } from "node:module";

const ALLOWED_EXTERNALS = new Set([
	...EXTERNALS,
	// Optional ws peer deps — ws try/catches these, safe if missing
	"bufferutil",
	"utf-8-validate",
	// AJV runtime helpers appear in the bundle as code-generation string literals
	// (e.g. `.code = 'require("ajv/dist/runtime/equal").default'`).
	// These are data strings embedded by AJV for use in generated validator code —
	// they are not require() calls that execute at module load time. Adding them
	// here tells the validator to skip these false-positive matches.
	// @lore desktop: AJV embeds require() strings as code templates. The validator
	// regex matches them as if they were real requires, but they are never executed
	// unless AJV compiles new schemas at runtime (which it does not in the desktop
	// app — all schemas are pre-compiled at build time by the MCP SDK).
	...AJV_STUB_MODULES,
]);

const bundleContent = fs.readFileSync(path.join(DIST_DIR, "main.cjs"), "utf-8");
const requirePattern = /require\("([^"]+)"\)/g;
const danglingRequires: string[] = [];
for (const match of bundleContent.matchAll(requirePattern)) {
	const mod = match[1];
	if (mod.startsWith("./") || mod.startsWith("../")) continue;
	if (isBuiltin(mod)) continue;
	if (ALLOWED_EXTERNALS.has(mod)) continue;
	danglingRequires.push(mod);
}

if (danglingRequires.length > 0) {
	const unique = [...new Set(danglingRequires)];
	process.stderr.write(
		`\nBundle validation FAILED: found require() for modules not in the packaged app:\n`,
	);
	for (const mod of unique) {
		process.stderr.write(`  - ${mod}\n`);
	}
	process.stderr.write(
		`\nThese modules must be either stubbed (pgStubPlugin) or included in electron-builder files.\n`,
	);
	process.exit(1);
}

// TODO: after electron-builder runs, verify that every EXTERNALS entry
// (currently @electric-sql/pglite) actually ended up in the asar. The current
// pipeline silently skips missing globs — if pglite is hoisted to the workspace
// root instead of applications/desktop/node_modules/, electron-builder includes
// zero files and the app crashes at runtime with "Cannot find module". The fix
// in commit 34d2f228 (adding pglite as a direct dep of @hyperidle/desktop)
// papers over the hoisting issue, but the build should fail-fast if any
// external is missing from the packaged output.
//
// Also: desktop uses PGlite (embedded WASM), server deploy uses postgres-js.
// The pgStubPlugin stubs postgres/drizzle-orm/postgres-js at bundle time for
// desktop. If a VPS/cloud server bundle script is added, it must do the
// inverse: stub pglite and keep postgres-js. Keep these two build paths
// explicitly separate — do not attempt a unified bundle that includes both
// drivers.

process.stdout.write("Desktop bundle complete. Validation passed.\n");
