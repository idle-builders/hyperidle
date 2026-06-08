/**
 * AE4 AC-5 — PWA manifest structure test.
 *
 * Imports manifest.json as a static JSON module and asserts on required fields.
 * This validates the manifest structure at import time (build-time property).
 *
 * @lore AE4: Per the architecture critique, reading a JSON file with readFileSync
 * is a lint/build check. The compromise: import as a JSON module (Vite supports
 * this natively). The import is a runtime assertion — if the file is missing the
 * test fails with a module not found error.
 */

import { describe, expect, it } from "vitest";

// Vite resolves JSON imports in tests via the vite plugin.
// The path is relative to this test file.
import manifest from "../../public/manifest.json";

describe("AE4 AC-5 — PWA manifest structure", () => {
	it("has name field", () => {
		expect(manifest.name).toBe("HyperIdle");
	});

	it("has short_name field", () => {
		expect(manifest.short_name).toBe("HyperIdle");
	});

	it("has start_url", () => {
		expect(manifest.start_url).toBe("/");
	});

	it("has display set to standalone", () => {
		expect(manifest.display).toBe("standalone");
	});

	it("has background_color (Hearth light surface-page)", () => {
		expect(manifest.background_color).toBeDefined();
	});

	it("has theme_color (Hearth accent-primary)", () => {
		expect(manifest.theme_color).toBeDefined();
	});

	it("has icons array with at least two entries", () => {
		expect(Array.isArray(manifest.icons)).toBe(true);
		expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
	});

	it("has a 192x192 icon entry", () => {
		const icon192 = manifest.icons.find((icon: { sizes: string }) => icon.sizes === "192x192");
		expect(icon192).toBeDefined();
		expect(icon192?.src).toBeTruthy();
	});

	it("has a 512x512 icon entry", () => {
		const icon512 = manifest.icons.find((icon: { sizes: string }) => icon.sizes === "512x512");
		expect(icon512).toBeDefined();
		expect(icon512?.src).toBeTruthy();
	});
});
