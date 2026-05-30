/**
 * N5 — electron-builder.yml config validation tests
 *
 * AC coverage:
 *   AC2: vite build produces SPA; electron-builder copies into resources.
 *   AC5: electron-builder.yml: dmg target, hardened runtime, notarize, entitlements.
 *   AC12: Self-contained bundle — no npm install on user's Mac.
 *
 * These tests read and parse electron-builder.yml with string/regex inspection.
 * No YAML library dependency needed — we inspect the raw text for required keys.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const DESKTOP_DIR = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(DESKTOP_DIR, "electron-builder.yml");

function readConfig(): string {
	return fs.readFileSync(CONFIG_PATH, "utf-8");
}

describe("electron-builder.yml — mac target (AC5)", () => {
	it("config file exists", () => {
		expect(fs.existsSync(CONFIG_PATH)).toBe(true);
	});

	it("has appId: com.hyperidle.app", () => {
		const config = readConfig();
		expect(config).toMatch(/appId\s*:\s*com\.hyperidle\.app/);
	});

	it("has productName: HyperIdle", () => {
		const config = readConfig();
		expect(config).toMatch(/productName\s*:\s*HyperIdle/);
	});

	it("has dmg as mac target (AC5)", () => {
		const config = readConfig();
		expect(config).toMatch(/target\s*:\s*dmg/);
	});

	it("has arm64 and x64 architectures in mac target (AC4)", () => {
		const config = readConfig();
		expect(config).toMatch(/arm64/);
		expect(config).toMatch(/x64/);
	});

	it("has hardenedRuntime: true (AC5 — required for notarization)", () => {
		const config = readConfig();
		expect(config).toMatch(/hardenedRuntime\s*:\s*true/);
	});

	it("has notarize: true (AC5 — Apple notarization)", () => {
		const config = readConfig();
		expect(config).toMatch(/notarize\s*:\s*true/);
	});

	it("has entitlements pointing to build/entitlements.mac.plist (AC5)", () => {
		const config = readConfig();
		expect(config).toMatch(/entitlements\s*:\s*build\/entitlements\.mac\.plist/);
	});

	it("has entitlementsInherit pointing to build/entitlements.mac.plist (AC5 — applies to helper processes)", () => {
		const config = readConfig();
		expect(config).toMatch(/entitlementsInherit\s*:\s*build\/entitlements\.mac\.plist/);
	});

	it("entitlements.mac.plist file exists (AC5)", () => {
		const plistPath = path.join(DESKTOP_DIR, "build", "entitlements.mac.plist");
		expect(fs.existsSync(plistPath)).toBe(true);
	});
});

describe("electron-builder.yml — extraMetadata (AC1, AC12)", () => {
	it("has extraMetadata.main: dist/main.cjs (overrides package.json main at build time without modifying source)", () => {
		const config = readConfig();
		expect(config).toMatch(/extraMetadata/);
		expect(config).toMatch(/main\s*:\s*dist\/main\.cjs/);
	});
});

describe("electron-builder.yml — files and resources (AC2, AC12)", () => {
	it("includes dist/**/* in files glob (bundles app code)", () => {
		const config = readConfig();
		expect(config).toMatch(/dist\/\*\*\/\*/);
	});

	it("includes node_modules/@electric-sql/pglite in files (PGlite WASM must be in bundle)", () => {
		const config = readConfig();
		expect(config).toMatch(/node_modules\/@electric-sql\/pglite/);
	});

	it("has extraResources with drizzle migrations (resolveMigrationsFolder uses process.resourcesPath)", () => {
		const config = readConfig();
		expect(config).toMatch(/drizzle/);
		expect(config).toMatch(/extraResources/);
	});

	it("has extraResources with web-dist (AC2 — SPA copied into resources)", () => {
		const config = readConfig();
		expect(config).toMatch(/web-dist/);
	});
});

describe("electron-builder.yml — rebuild and publish (AC4, AC9, AC12)", () => {
	it("has npmRebuild: false (PGlite is pure WASM — no native modules to rebuild)", () => {
		const config = readConfig();
		expect(config).toMatch(/npmRebuild\s*:\s*false/);
	});

	it("has publish: null (AC12 — no auto-updater; distribution via Homebrew only)", () => {
		const config = readConfig();
		expect(config).toMatch(/publish\s*:\s*null/);
	});
});

describe("electron-builder.yml — artifact naming", () => {
	it("has explicit artifactName with version and arch (Homebrew URLs must be predictable)", () => {
		const config = readConfig();
		// Pattern: "${productName}-${version}-${arch}.${ext}"
		expect(config).toMatch(/artifactName/);
		expect(config).toMatch(/\$\{version\}/);
		expect(config).toMatch(/\$\{arch\}/);
	});
});
