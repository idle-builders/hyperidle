/**
 * N5 — bundle script content validation tests
 *
 * AC coverage:
 *   AC1: esbuild bundles to single CJS, externalizing PGlite + electron built-ins.
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

	it("bundle script externalizes @electric-sql/pglite (WASM binary must load from disk)", () => {
		const src = fs.readFileSync(BUNDLE_SCRIPT, "utf-8");
		expect(src).toMatch(/@electric-sql\/pglite/);
		const externalsMatch = src.match(/const EXTERNALS\s*=\s*\[([^\]]*)\]/s);
		expect(externalsMatch).toBeTruthy();
		expect(externalsMatch?.[1]).toContain("@electric-sql/pglite");
	});

	it("bundle script stubs postgres via pgStubPlugin (desktop uses PGlite, not postgres-js)", () => {
		const src = fs.readFileSync(BUNDLE_SCRIPT, "utf-8");
		expect(src).toMatch(/pgStubPlugin/);
		expect(src).toMatch(/["']postgres["']/);
	});

	it("bundle script stubs drizzle-orm/postgres-js via pgStubPlugin (VPS/cloud only)", () => {
		const src = fs.readFileSync(BUNDLE_SCRIPT, "utf-8");
		expect(src).toMatch(/pgStubPlugin/);
		expect(src).toMatch(/drizzle-orm\/postgres-js/);
	});

	it("bundle script does NOT stub @electric-sql/pglite (desktop uses PGlite as its DB engine)", () => {
		const src = fs.readFileSync(BUNDLE_SCRIPT, "utf-8");
		const stubMatch = src.match(/const PG_STUB_MODULES\s*=\s*\[([^\]]*)\]/s);
		expect(stubMatch).toBeTruthy();
		expect(stubMatch?.[1]).not.toContain("pglite");
	});

	it("bundle script does NOT externalize postgres-js modules (v0.1.0 bug — dangling require)", () => {
		const src = fs.readFileSync(BUNDLE_SCRIPT, "utf-8");
		const externalsMatch = src.match(/const EXTERNALS\s*=\s*\[([^\]]*)\]/s);
		expect(externalsMatch).toBeTruthy();
		const externalsContent = externalsMatch?.[1] ?? "";
		expect(externalsContent).not.toContain("postgres");
		expect(externalsContent).not.toContain("drizzle-orm");
	});

	it("bundle script validates the output for dangling requires", () => {
		const src = fs.readFileSync(BUNDLE_SCRIPT, "utf-8");
		expect(src).toMatch(/danglingRequires/);
		expect(src).toMatch(/Bundle validation FAILED/);
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

	it("bundle script defines import.meta.url shim (CJS output makes import.meta empty — crashes MCP SDK)", () => {
		const src = fs.readFileSync(BUNDLE_SCRIPT, "utf-8");
		expect(src).toMatch(/define/);
		expect(src).toMatch(/import\.meta\.url/);
		expect(src).toMatch(/__IMPORT_META_URL__/);
	});

	it("bundle script injects banner with CJS-compatible import.meta.url (pathToFileURL(__filename))", () => {
		const src = fs.readFileSync(BUNDLE_SCRIPT, "utf-8");
		expect(src).toMatch(/banner/);
		expect(src).toMatch(/pathToFileURL\(__filename\)/);
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
