/**
 * AL5 — build-surface script unit test.
 *
 * Tests the surface entry extraction helpers (pure functions, no FS side effects).
 * The full build-surface script requires esbuild and is tested end-to-end in
 * the real-app verification step.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { extractDescription, readSurfaceEntries } from "../routes/surfaces.js";

// Re-uses the same helpers tested in AL5-surfaces.integration.test.ts
// but as a pure unit test (no DB/server needed).

describe("surface file scanning", () => {
	let dir: string;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "al5-scan-"));
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	test("agent catalog includes folder surface names and descriptions", () => {
		fs.writeFileSync(
			path.join(dir, "acme-review.js"),
			'export const description = "ACME review surface";\nexport default function AcmeReview() { return null; }',
		);
		fs.writeFileSync(
			path.join(dir, "plain.js"),
			"export default function Plain() { return null; }",
		);

		const entries = readSurfaceEntries(dir);
		const names = entries.map((e) => e.name);
		expect(names).toContain("acme-review");
		expect(names).toContain("plain");

		const acme = entries.find((e) => e.name === "acme-review");
		expect(acme?.description).toBe("ACME review surface");

		const plain = entries.find((e) => e.name === "plain");
		expect(plain?.description).toBe("");
	});

	test("malformed file (unreadable) is skipped without throwing", () => {
		// Create a readable file and a non-existent reference
		fs.writeFileSync(path.join(dir, "good.js"), "export default function() {}");

		// Manually mock: we can't create an unreadable file easily in CI,
		// so test the behavior at extractDescription level directly.
		const nonExistent = path.join(dir, "ghost.js");
		expect(extractDescription(nonExistent)).toBe(""); // no throw, returns ""
		// readSurfaceEntries only scans real files, so ghost won't appear
		const entries = readSurfaceEntries(dir);
		expect(entries.map((e) => e.name)).toEqual(["good"]);
	});

	test("surface name is the filename without .js extension", () => {
		fs.writeFileSync(path.join(dir, "my-custom-surface.js"), "export default function() {}");
		const entries = readSurfaceEntries(dir);
		expect(entries[0]?.name).toBe("my-custom-surface");
	});

	test("extracts description from esbuild var form (var description = '...')", () => {
		// esbuild converts `export const description = "..."` to `var description = "..."
		// with description exported via `export { description }` at the end.
		// The regex must match both forms.
		const file = path.join(dir, "esbuild-output.js");
		fs.writeFileSync(
			file,
			'import { useState } from "react";\nvar description = "Esbuild surface";\nexport { description };\nexport default function Surface() { return null; }',
		);
		expect(extractDescription(file)).toBe("Esbuild surface");
	});
});
