// @vitest-environment jsdom
/**
 * L15 — TaskCard visual-regression contract.
 *
 * Source: docs/work-packages/L15-plan.md §12 W-4 row.
 *
 * The pixel-diff is run by the existing Playwright harness in
 * `visual-regression.test.ts`. This file pins the structural contract
 * that the HTML/TSX gain the `pendingRequest` variant section.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("TaskCard — pendingRequest visual parity", () => {
	it("TaskCard.html contains a section showing the pending-request chip variant", () => {
		const html = readFileSync(
			resolve(import.meta.dirname, "..", "..", "html", "TaskCard.html"),
			"utf8",
		);
		// Either an explicit demo section title or the request_pending marker.
		const hasMarker =
			/pendingRequest|request_pending|↪\s*PENDING/i.test(html);
		expect(hasMarker).toBe(true);
	});

	it("TaskCard.tsx accepts a pendingRequest prop", () => {
		const src = readFileSync(
			resolve(import.meta.dirname, "..", "TaskCard.tsx"),
			"utf8",
		);
		expect(src).toMatch(/pendingRequest/);
	});

	it("TaskCard.tsx accepts an onActivate handler", () => {
		const src = readFileSync(
			resolve(import.meta.dirname, "..", "TaskCard.tsx"),
			"utf8",
		);
		expect(src).toMatch(/onActivate/);
	});
});
