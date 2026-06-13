/**
 * AI6 — Renderer container parity E2E.
 *
 * AC: "Same content kind via block payload vs artifact kind-renderer shares
 * container treatment."
 *
 * Canon: block/ family is the reference. kinds/ renderers must converge to:
 *   - rounded-[var(--r-default)] (16px border-radius)
 *   - border border-[var(--border-subtle)] (visible border)
 *   - overflow-hidden (where applicable)
 *
 * Strategy: render both families at /designsystem, capture screenshots, and
 * assert computed border-radius matches between block payload and kind renderer
 * for the same content kind (image + table).
 *
 * These tests FAIL until kinds/ renderer changes in §5 of architecture.md are applied.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "./fixtures";

const PROOF_DIR = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../../plans/AI6/screenshots",
);

test.beforeAll(() => {
	fs.mkdirSync(PROOF_DIR, { recursive: true });
});

test.describe("AI6 — renderer container parity (block/ vs kinds/)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/designsystem", { waitUntil: "domcontentloaded" });
		await page.waitForTimeout(1500);
	});

	// ── Image: block/ImagePayload vs kinds/image-renderer ────────────────────

	test("image-renderer has r-default (16px) border-radius matching block/ImagePayload", async ({
		page,
	}) => {
		// The design system catalog renders both families.
		// kinds/image-renderer is rendered via artifact preview stories.
		// We look for the [data-ds-component] markers.
		const kindImageRenderer = page
			.locator('[data-component="image-renderer"], [data-kind="image"]')
			.first();
		const blockImagePayload = page
			.locator('[data-component="ImagePayload"], [data-ds-component="ImagePayload"]')
			.first();

		// If both exist, assert matching border-radius.
		// If either doesn't exist yet, the test still captures the state.
		const kindVisible = await kindImageRenderer.isVisible().catch(() => false);
		const blockVisible = await blockImagePayload.isVisible().catch(() => false);

		if (kindVisible && blockVisible) {
			const kindRadius = await kindImageRenderer.evaluate(
				(el) => getComputedStyle(el).borderRadius,
			);
			const blockRadius = await blockImagePayload.evaluate(
				(el) => getComputedStyle(el).borderRadius,
			);
			// Both should resolve to 16px (var(--r-default)).
			expect(kindRadius).toBe(blockRadius);
		} else {
			// At minimum, assert that the kinds/image-renderer uses r-default class.
			// Find any element with an image renderer class that should have the correct radius.
			const imageRendererContainer = page
				.locator('[class*="image-renderer"], [class*="ImagePayload"]')
				.first();
			if (await imageRendererContainer.isVisible().catch(() => false)) {
				const classAttr = await imageRendererContainer.getAttribute("class");
				// After migration, kinds/image-renderer must use r-default.
				expect(classAttr).toContain("r-default");
			} else {
				// Take a screenshot for manual review and note that renderer elements
				// are not yet identifiable via the current markup.
				await page.screenshot({
					path: path.join(PROOF_DIR, "AI6-renderer-parity-no-markers.png"),
				});
				// This test cannot pass until the renderer stories expose data markers.
				// The explicit assertion here fails as expected (red).
				expect(
					false,
					"kinds/image-renderer or block/ImagePayload not found on /designsystem — ensure renderer stories render these components with identifiable markers",
				).toBe(true);
			}
		}
	});

	// ── Screenshot: side-by-side renderer capture ─────────────────────────────

	test("screenshot: renderer families side-by-side for reviewer inspection", async ({ page }) => {
		// Navigate to artifact preview or renderer section if there's a story nav.
		// Capture full design system page for side-by-side review.
		await page.screenshot({
			path: path.join(PROOF_DIR, "AI6-renderer-parity-full.png"),
			fullPage: false,
		});
		expect(fs.existsSync(path.join(PROOF_DIR, "AI6-renderer-parity-full.png"))).toBe(true);
	});

	// ── code-renderer: no bg-success/10 (undefined class) ────────────────────

	test("code-renderer does not use undefined bg-success/10 class in rendered output", async ({
		page,
	}) => {
		// After migration, kinds/code-renderer must NOT contain the broken class.
		// We check the page source for any element with the exact broken class.
		const brokenElement = page.locator('[class*="bg-success/10"], [class*="bg-error/10"]');
		const count = await brokenElement.count();
		expect(
			count,
			"Found elements with undefined bg-success/10 or bg-error/10 classes — these must be replaced with color-mix() equivalents",
		).toBe(0);
	});

	// ── Border assertions: kinds/ must have border-subtle ────────────────────

	test("kinds/ renderers: image and table containers have visible border (border-subtle class)", async ({
		page,
	}) => {
		// After migration, kinds/image-renderer and kinds/data-renderer wrap content
		// in a container with border-[var(--border-subtle)].
		// Check that no kinds/ renderer uses the old rounded-[--r-subtle] (10px) without a border.
		//
		// This test specifically checks that the broken `rounded-[var(--r-subtle)]` class
		// (10px, no border) is gone from the rendered artifact preview surfaces.
		const subtleRadiusWithoutBorder = page.locator('[class*="r-subtle"]:not([class*="border"])');
		// We only care about renderer containers — not all components using r-subtle are wrong.
		// The test is intentionally broad in red phase; green phase will narrow via data markers.
		const rendererContainersWithOldRadius = await subtleRadiusWithoutBorder
			.filter({ hasText: "" })
			.count();

		// In red phase, this may be non-zero (kinds/ still use r-subtle).
		// In green phase, kinds/ image + table + html renderers use r-default + border-subtle.
		// The test records current state; the assertion that matters is 0 after migration.
		expect(
			rendererContainersWithOldRadius,
			`Found ${rendererContainersWithOldRadius} elements with r-subtle but no border — kinds/ renderers must use r-default + border-subtle after migration`,
		).toBe(0);
	});
});
