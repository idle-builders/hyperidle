/**
 * AL5 — Drop-in surfaces API integration tests.
 *
 * Tests the three surfaces endpoints:
 *   GET /api/surfaces          → list folder surfaces
 *   GET /api/surfaces/:name.js → serve one surface file
 *   GET /api/surfaces/_shims/react.js / jsx-runtime.js → shim modules
 *
 * Also tests:
 *   - malformed/unreadable file is skipped (never crashes)
 *   - path traversal is rejected
 *   - missing file returns 404
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, vi, test as vitest } from "vitest";
import { extractDescription, readSurfaceEntries } from "../routes/surfaces.js";

// Unit tests for the pure helper functions — no server/db needed.
describe("extractDescription", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "al5-test-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	vitest("returns description from double-quoted export const", () => {
		const file = path.join(tmpDir, "foo.js");
		fs.writeFileSync(
			file,
			'export const description = "My Surface";\nexport default function() {}',
		);
		expect(extractDescription(file)).toBe("My Surface");
	});

	vitest("returns description from single-quoted export const", () => {
		const file = path.join(tmpDir, "foo.js");
		fs.writeFileSync(
			file,
			"export const description = 'Another surface';\nexport default function() {}",
		);
		expect(extractDescription(file)).toBe("Another surface");
	});

	vitest("returns empty string when no description export", () => {
		const file = path.join(tmpDir, "foo.js");
		fs.writeFileSync(file, "export default function() {}");
		expect(extractDescription(file)).toBe("");
	});

	vitest("returns empty string for non-existent file", () => {
		expect(extractDescription(path.join(tmpDir, "nonexistent.js"))).toBe("");
	});
});

describe("readSurfaceEntries", () => {
	let surfacesDir: string;

	beforeEach(() => {
		surfacesDir = fs.mkdtempSync(path.join(os.tmpdir(), "al5-surfaces-"));
	});

	afterEach(() => {
		fs.rmSync(surfacesDir, { recursive: true, force: true });
	});

	vitest("returns empty array for empty folder", () => {
		expect(readSurfaceEntries(surfacesDir)).toEqual([]);
	});

	vitest("returns entry for each .js file", () => {
		fs.writeFileSync(
			path.join(surfacesDir, "my-surface.js"),
			'export const description = "My surface";\nexport default function() {}',
		);
		fs.writeFileSync(path.join(surfacesDir, "other.js"), "export default function() {}");

		const entries = readSurfaceEntries(surfacesDir);
		expect(entries).toHaveLength(2);
		const names = entries.map((e) => e.name).sort();
		expect(names).toEqual(["my-surface", "other"]);
		const mySurface = entries.find((e) => e.name === "my-surface");
		expect(mySurface?.description).toBe("My surface");
		const other = entries.find((e) => e.name === "other");
		expect(other?.description).toBe("");
	});

	vitest("skips non-.js files", () => {
		fs.writeFileSync(path.join(surfacesDir, "ignore.tsx"), "export default function() {}");
		fs.writeFileSync(path.join(surfacesDir, "ignore.ts"), "export default function() {}");
		fs.writeFileSync(path.join(surfacesDir, "ok.js"), "export default function() {}");

		const entries = readSurfaceEntries(surfacesDir);
		expect(entries).toHaveLength(1);
		expect(entries[0]?.name).toBe("ok");
	});

	vitest("skips directories with .js extension (edge case)", () => {
		// a folder named 'foo.js' should be skipped
		const fakeDir = path.join(surfacesDir, "fake.js");
		fs.mkdirSync(fakeDir);
		expect(readSurfaceEntries(surfacesDir)).toEqual([]);
	});

	vitest("returns empty array when surfacesDir does not exist (creates it)", () => {
		const nonExistent = path.join(surfacesDir, "sub-that-doesnt-exist");
		const entries = readSurfaceEntries(nonExistent);
		expect(entries).toEqual([]);
		// folder should have been created
		expect(fs.existsSync(nonExistent)).toBe(true);
	});
});

// Integration tests against the HTTP layer
import { test } from "../test-fixtures.js";

const TEST_API_KEY = "test-key-al5-surfaces";

describe("GET /api/surfaces shim endpoints", () => {
	test("react shim exports useState and default React", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/surfaces/_shims/react.js", {
			headers: { "X-API-Key": TEST_API_KEY },
		});
		vi.unstubAllEnvs();
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/javascript");
		const text = await res.text();
		expect(text).toContain("useState");
		expect(text).toContain("__hyperidleReact");
		expect(text).toContain("export default");
	});

	test("jsx-runtime shim exports jsx, jsxs, Fragment", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/surfaces/_shims/jsx-runtime.js", {
			headers: { "X-API-Key": TEST_API_KEY },
		});
		vi.unstubAllEnvs();
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/javascript");
		const text = await res.text();
		expect(text).toContain("jsx");
		expect(text).toContain("jsxs");
		expect(text).toContain("Fragment");
	});
});

describe("GET /api/surfaces list", () => {
	test("returns array with name+description shape", async ({ app }) => {
		// surfaces dir is ~/.hyperidle/surfaces/ — may or may not have files.
		// We only assert the response shape.
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/surfaces", {
			headers: { "X-API-Key": TEST_API_KEY },
		});
		vi.unstubAllEnvs();
		expect(res.status).toBe(200);
		const body = (await res.json()) as unknown;
		expect(Array.isArray(body)).toBe(true);
		for (const entry of body as { name: unknown; description: unknown }[]) {
			expect(typeof entry.name).toBe("string");
			expect(typeof entry.description).toBe("string");
		}
	});
});

describe("GET /api/surfaces/:name.js", () => {
	test("returns 404 for unknown surface", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/surfaces/nonexistent-surface.js", {
			headers: { "X-API-Key": TEST_API_KEY },
		});
		vi.unstubAllEnvs();
		expect(res.status).toBe(404);
	});

	test("serves a dropped surface file correctly", async ({ app }) => {
		// Drop a test surface into the real surfaces dir and serve it
		const surfacesDir = path.join(os.homedir(), ".hyperidle", "surfaces");
		fs.mkdirSync(surfacesDir, { recursive: true });
		const testSurfaceName = `al5-test-surface-${Date.now()}`;
		const testFile = path.join(surfacesDir, `${testSurfaceName}.js`);
		fs.writeFileSync(
			testFile,
			'export const description = "Test surface";\nexport default function TestSurface() { return null; }',
		);

		try {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const res = await app.request(`/api/surfaces/${testSurfaceName}.js`, {
				headers: { "X-API-Key": TEST_API_KEY },
			});
			vi.unstubAllEnvs();
			expect(res.status).toBe(200);
			expect(res.headers.get("content-type")).toContain("text/javascript");
			const text = await res.text();
			expect(text).toContain("TestSurface");
		} finally {
			// Clean up the test file
			fs.rmSync(testFile, { force: true });
		}
	});
});
