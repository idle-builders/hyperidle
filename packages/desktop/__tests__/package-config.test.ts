/**
 * N5 — package.json configuration validation tests
 *
 * AC coverage:
 *   AC1: esbuild bundler configured as devDependency.
 *   AC4: better-sqlite3 as direct dependency (electron-rebuild needs it in desktop/node_modules).
 *   AC12: build script defined for bundle step.
 *
 * Root package.json:
 *   - build:desktop script present.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const DESKTOP_DIR = path.resolve(__dirname, "..");
const DESKTOP_PKG_PATH = path.join(DESKTOP_DIR, "package.json");
const ROOT_PKG_PATH = path.resolve(DESKTOP_DIR, "../..", "package.json");

interface PackageJson {
	scripts?: Record<string, string>;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
}

function readPkg(pkgPath: string): PackageJson {
	return JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as PackageJson;
}

describe("packages/desktop/package.json (AC1, AC4, AC12)", () => {
	it("has esbuild in devDependencies (AC1 — bundle tool)", () => {
		const pkg = readPkg(DESKTOP_PKG_PATH);
		expect(pkg.devDependencies).toBeDefined();
		expect(pkg.devDependencies?.["esbuild"]).toBeDefined();
	});

	it("has better-sqlite3 in dependencies (AC4 — electron-rebuild needs it in desktop/node_modules)", () => {
		const pkg = readPkg(DESKTOP_PKG_PATH);
		expect(pkg.dependencies).toBeDefined();
		expect(pkg.dependencies?.["better-sqlite3"]).toBeDefined();
	});

	it("has build script (AC12 — runs esbuild bundle step)", () => {
		const pkg = readPkg(DESKTOP_PKG_PATH);
		expect(pkg.scripts).toBeDefined();
		expect(pkg.scripts?.["build"]).toBeDefined();
		expect(pkg.scripts?.["build"]).toMatch(/bundle\.ts/);
	});
});

describe("root package.json (AC2, AC12)", () => {
	it("has build:desktop script that orchestrates web build + desktop bundle", () => {
		const pkg = readPkg(ROOT_PKG_PATH);
		expect(pkg.scripts).toBeDefined();
		expect(pkg.scripts?.["build:desktop"]).toBeDefined();
	});

	it("build:desktop script includes web build step (AC2)", () => {
		const pkg = readPkg(ROOT_PKG_PATH);
		const script = pkg.scripts?.["build:desktop"] ?? "";
		expect(script).toMatch(/@hyperidle\/web/);
	});

	it("build:desktop script includes desktop bundle step (AC1)", () => {
		const pkg = readPkg(ROOT_PKG_PATH);
		const script = pkg.scripts?.["build:desktop"] ?? "";
		// Either references bundle.ts directly or runs the desktop build script
		expect(script).toMatch(/desktop/i);
	});
});
