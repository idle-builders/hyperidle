/**
 * N5 — bundle script content validation tests
 *
 * AC coverage:
 *   AC1: esbuild bundles to single CJS, externalizing better-sqlite3 + electron built-ins. No tsx in bundle.
 *   AC12: Self-contained bundle — no npm install on user's Mac.
 *
 * These tests inspect the bundle SCRIPT (packages/desktop/scripts/bundle.ts) to
 * verify it is configured correctly. Running the actual esbuild is a CI/integration
 * concern — the script config is what we can verify deterministically in unit tests.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const DESKTOP_DIR = path.resolve(__dirname, "..");
const BUNDLE_SCRIPT = path.join(DESKTOP_DIR, "scripts", "bundle.ts");
const GITIGNORE = path.join(DESKTOP_DIR, ".gitignore");

describe("bundle script (AC1, AC12)", () => {
	it("bundle script exists at packages/desktop/scripts/bundle.ts", () => {
		expect(fs.existsSync(BUNDLE_SCRIPT)).toBe(true);
	});

	it("bundle script uses esbuild", () => {
		const src = fs.readFileSync(BUNDLE_SCRIPT, "utf-8");
		expect(src).toMatch(/from\s+["']esbuild["']/);
	});

	it("bundle script sets format to cjs (AC1 — electron-builder expects CJS main entry)", () => {
		const src = fs.readFileSync(BUNDLE_SCRIPT, "utf-8");
		expect(src).toMatch(/format\s*:\s*["']cjs["']/);
	});

	it("bundle script sets platform to node (main process is Node.js)", () => {
		const src = fs.readFileSync(BUNDLE_SCRIPT, "utf-8");
		expect(src).toMatch(/platform\s*:\s*["']node["']/);
	});

	it("bundle script targets node22 (Electron 36 ships Node 22 — critique finding #4)", () => {
		const src = fs.readFileSync(BUNDLE_SCRIPT, "utf-8");
		expect(src).toMatch(/target\s*:\s*["']node22["']/);
	});

	it("bundle script outputs dist/main.cjs (AC1)", () => {
		const src = fs.readFileSync(BUNDLE_SCRIPT, "utf-8");
		expect(src).toMatch(/main\.cjs/);
	});

	it("bundle script externalizes electron (AC1 — provided by Electron runtime)", () => {
		const src = fs.readFileSync(BUNDLE_SCRIPT, "utf-8");
		// Should appear in external array
		expect(src).toMatch(/["']electron["']/);
		expect(src).toMatch(/external/);
	});

	it("bundle script externalizes better-sqlite3 (AC1 — native module, cannot be bundled)", () => {
		const src = fs.readFileSync(BUNDLE_SCRIPT, "utf-8");
		expect(src).toMatch(/["']better-sqlite3["']/);
	});

	it("bundle script externalizes postgres (AC1 — pg driver not used in desktop)", () => {
		const src = fs.readFileSync(BUNDLE_SCRIPT, "utf-8");
		expect(src).toMatch(/["']postgres["']/);
	});

	it("bundle script externalizes drizzle-orm/postgres-js (critique finding #1 — db barrel re-exports pg-connection)", () => {
		const src = fs.readFileSync(BUNDLE_SCRIPT, "utf-8");
		expect(src).toMatch(/drizzle-orm\/postgres-js/);
	});

	it("bundle script externalizes @electric-sql/pglite (AC1 — not needed in desktop)", () => {
		const src = fs.readFileSync(BUNDLE_SCRIPT, "utf-8");
		expect(src).toMatch(/@electric-sql\/pglite/);
	});

	it("bundle script compiles a separate preload entry (preload runs in separate Electron context)", () => {
		const src = fs.readFileSync(BUNDLE_SCRIPT, "utf-8");
		expect(src).toMatch(/preload/);
		// Preload must also be CJS for Electron sandboxed context
		expect(src).toMatch(/preload\.js/);
	});

	it("bundle script copies splash.html to dist (main.ts loads it via path.join(Dirname, 'splash.html'))", () => {
		const src = fs.readFileSync(BUNDLE_SCRIPT, "utf-8");
		expect(src).toMatch(/splash\.html/);
		expect(src).toMatch(/copy/i);
	});

	it("bundle script does NOT minify (crash stack traces must be readable)", () => {
		const src = fs.readFileSync(BUNDLE_SCRIPT, "utf-8");
		// minify: false — or minify key should not be true
		expect(src).not.toMatch(/minify\s*:\s*true/);
	});

	it("bundle script enables sourcemap for main process only (crash diagnostics)", () => {
		const src = fs.readFileSync(BUNDLE_SCRIPT, "utf-8");
		expect(src).toMatch(/sourcemap\s*:\s*true/);
	});
});

describe(".gitignore (AC3 — package-lock.json not committed)", () => {
	it(".gitignore exists at packages/desktop/.gitignore", () => {
		expect(fs.existsSync(GITIGNORE)).toBe(true);
	});

	it(".gitignore excludes dist/ (built artifacts not committed)", () => {
		const content = fs.readFileSync(GITIGNORE, "utf-8");
		expect(content).toMatch(/^dist\/?$/m);
	});

	it(".gitignore excludes release/ (packaged artifacts not committed)", () => {
		const content = fs.readFileSync(GITIGNORE, "utf-8");
		expect(content).toMatch(/^release\/?$/m);
	});

	it(".gitignore excludes package-lock.json (AC3 — generated in CI only, not committed)", () => {
		const content = fs.readFileSync(GITIGNORE, "utf-8");
		expect(content).toMatch(/package-lock\.json/);
	});
});
