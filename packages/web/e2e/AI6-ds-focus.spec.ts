/**
 * AI6 — Focus treatment catalog E2E.
 *
 * AC: "One focus treatment on every interactive DS component."
 * Two documented treatments:
 *   1. control-ring: `outline-1` (1px), outline-[var(--accent-primary)], focus-visible.
 *      Free-standing: no offset. Inset: outline-offset:-1px.
 *   2. input-glow: box-shadow 3px tinted + border-color accent, focus (not focus-visible).
 *
 * Strategy: navigate to /designsystem, Tab into each interactive surface,
 * assert the focused element's computed `outline-width` is "1px" (not "2px")
 * for control-ring elements, and that Input-class elements have a non-transparent
 * `box-shadow` (the glow treatment).
 *
 * These tests FAIL until the focus convergence changes in §1 of architecture.md
 * are applied (Button.tsx:57 outline-[2px] → outline-1, etc.).
 */

import { expect, test } from "./fixtures";

// /designsystem requires a dev server. Tests are read-only probes.

test.describe("AI6 — focus treatment catalog", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/designsystem", { waitUntil: "domcontentloaded" });
		await page.waitForTimeout(1500);
	});

	// ── Button control-ring ────────────────────────────────────────────────────

	test("Button: focused outline-width is 1px (not 2px)", async ({ page }) => {
		// Navigate to the Button story section.
		const buttonSection = page.locator("[data-ds-component='Button']").first();
		await expect(buttonSection).toBeVisible();

		// Tab to the first Button element and assert computed outline-width.
		await buttonSection.first().focus();
		const outlineWidth = await buttonSection.first().evaluate(
			(el) => getComputedStyle(el).outlineWidth,
		);
		expect(outlineWidth).toBe("1px");
	});

	// ── TabBar control-ring ────────────────────────────────────────────────────

	test("TabBar: focused tab outline-width is 1px (not 2px)", async ({ page }) => {
		const tabBarSection = page.locator("[data-ds-component='TabBar']").first();
		await expect(tabBarSection).toBeVisible();

		// Tab to first button inside TabBar.
		const firstTab = tabBarSection.locator("button[role='tab']").first();
		await expect(firstTab).toBeVisible();
		await firstTab.focus();

		const outlineWidth = await firstTab.evaluate(
			(el) => getComputedStyle(el).outlineWidth,
		);
		expect(outlineWidth).toBe("1px");
	});

	// ── Input input-glow ──────────────────────────────────────────────────────

	test("Input: focused box-shadow contains var(--accent-primary-dim) token reference (not raw rgba)", async ({
		page,
	}) => {
		// Find an Input component on the design-system page.
		const inputSection = page.locator("[data-ds-component='Input'], input[type='text']").first();
		await expect(inputSection).toBeVisible();
		await inputSection.focus();

		// The box-shadow should use the token, not a hardcoded rgba.
		// We check the class attribute for the correct token form.
		const className = await inputSection.getAttribute("class");
		// After migration, Input.tsx:26 must have var(--accent-primary-dim) in class.
		// Before migration it has the raw rgba. This assertion proves the token is used.
		expect(className).toContain("accent-primary-dim");
	});
});
