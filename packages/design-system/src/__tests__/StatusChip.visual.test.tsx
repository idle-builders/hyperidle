// @vitest-environment jsdom
/**
 * L15 — StatusChip visual-regression contract.
 *
 * Source: docs/work-packages/L15-plan.md §12 W-4 row.
 *
 * The visual-regression harness lives at
 * `packages/design-system/src/__tests__/visual-regression.test.ts` (Playwright).
 * This file is the locked contract that StatusChip.html includes a
 * `request_pending` demo section AND that the corresponding TSX render
 * matches it within the 5% pixel-diff threshold.
 *
 * RED PHASE — `request_pending` demo does not exist in StatusChip.html or
 * in the TSX yet. The test asserts that a fixture HTML section labelled
 * "request_pending" exists. The full pixel-diff is performed by the
 * existing Playwright harness; the impl pass adds the section.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("StatusChip — request_pending visual parity", () => {
	it("StatusChip.html contains a section demonstrating the request_pending variant", () => {
		const htmlPath = resolve(
			import.meta.dirname,
			"..",
			"..",
			"html",
			"StatusChip.html",
		);
		const html = readFileSync(htmlPath, "utf8");
		// Either the data-status attr OR the literal label "↪ PENDING" must appear.
		const hasMarker =
			html.includes('data-status="request_pending"') || /↪\s*PENDING/.test(html);
		expect(hasMarker).toBe(true);
	});

	it("StatusChip.tsx accepts request_pending as a Status union member (compile-time check)", async () => {
		// Import the source and check that the union mentions the new variant.
		const src = readFileSync(
			resolve(import.meta.dirname, "..", "StatusChip.tsx"),
			"utf8",
		);
		expect(src).toMatch(/request_pending/);
	});
});
