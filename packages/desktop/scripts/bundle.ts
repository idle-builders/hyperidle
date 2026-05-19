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
 * require() tricks. See plans/N5/architecture.md §Design-it-twice for the
 * full rationale.
 *
 * @lore N5: drizzle-orm/postgres-js MUST be external even though postgres is
 * already external. The @hyperidle/db barrel re-exports createPgDb from
 * pg-connection.ts which has a top-level `import { drizzle } from
 * "drizzle-orm/postgres-js"`. esbuild processes the full barrel and tries to
 * bundle the subpath import. Since postgres (the dep) is external, the
 * subpath import must also be external to avoid a broken bundle.
 * See plans/N5/architecture-critique.md CRITICAL finding #1.
 *
 * @lore N5: Node target is node22 (NOT node20). Electron 36 ships Node 22.x
 * (ABI 135). Using node20 produces a technically working but incorrect build
 * that prevents use of Node 22 APIs. See architecture-critique.md finding #4.
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
// - better-sqlite3: native .node addon, must be rebuilt per ABI and cannot be bundled
// - postgres: pg driver is not used in desktop mode (SQLite only); the db barrel
//   re-exports pg code so we must exclude it from the bundle
// - drizzle-orm/postgres-js: subpath of drizzle-orm that imports from postgres;
//   must be external because postgres itself is external (see lore above)
// - @electric-sql/pglite: PGlite is a separate native module, unused in desktop
const EXTERNALS = [
	"electron",
	"better-sqlite3",
	"postgres",
	"drizzle-orm/postgres-js",
	"@electric-sql/pglite",
];

// Bundle main process
await esbuild.build({
	entryPoints: [path.join(DESKTOP_DIR, "src/main.ts")],
	bundle: true,
	platform: "node",
	// @lore N5: Electron 36 ships Node 22.x — use node22 as the esbuild target.
	target: "node22",
	format: "cjs",
	outfile: path.join(DIST_DIR, "main.cjs"),
	external: EXTERNALS,
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

process.stdout.write("Desktop bundle complete.\n");
