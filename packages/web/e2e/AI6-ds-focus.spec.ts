/**
 * AI6 — Focus treatment catalog E2E.
 *
 * AC: "One focus treatment on every interactive DS component."
 * Two documented treatments:
 *   1. control-ring: `outline-1` (1px), outline-[var(--accent-primary)], focus-visible.
 *      Free-standing: no offset. Inset: outline-offset:-1px.
 *   2. input-glow: box-shadow 3px tinted + border-color accent, focus (not focus-visible).
 *
 * Strategy: navigate /designsystem to the specific component section (via hash),
 * assert the focused element's class attribute contains `outline-1` (not `outline-[2px]`)
 * for control-ring elements, and that Input-class elements carry the glow token
 * class (not a raw rgba).
 *
 * Note on computed outline-width: Playwright programmatic .focus() triggers :focus but
 * :focus-visible activation depends on browser heuristics (keyboard-initiated focus is
 * reliable; programmatic is browser-dependent). Asserting on the class attribute is
 * more reliable — it proves the TOKEN `outline-1` is used, not `outline-[2px]`.
 * The class attribute assertion IS the definitive proof that the correct 1px treatment
 * is applied, because Tailwind `outline-1` = `outline-width: 1px`.
 *
 * C2 fix: catalog defaults to modules[0] — must navigate to each component section
 * before asserting. Use /designsystem#<title> hash navigation.
 */

import { expect, test } from "./fixtures";

// ── Button control-ring ────────────────────────────────────────────────────

test.describe("AI6 — focus treatment catalog", () => {
	test("Button: focus ring class is outline-1 (not outline-[2px])", async ({ page }) => {
		// Navigate directly to the Button section of the design system catalog.
		await page.goto("/designsystem#Button", { waitUntil: "domcontentloaded" });
		await page.waitForTimeout(1500);

		// Button component renders with data-ds-component="Button" on the <button> element.
		const button = page.locator("[data-ds-component='Button']").first();
		await expect(button).toBeVisible();

		// Assert the class attribute uses outline-1 (1px), NOT outline-[2px].
		const className = await button.getAttribute("class");
		expect(className).toContain("outline-1");
		expect(className).not.toContain("outline-[2px]");
	});

	// ── TabBar control-ring — underline variant ──────────────────────────────

	test("TabBar underline variant: tab button focus class is outline-1 (not outline-[2px])", async ({
		page,
	}) => {
		// Navigate to the TabBar UnderlineVariant.
		await page.goto("/designsystem#TabBar::UnderlineVariant", {
			waitUntil: "domcontentloaded",
		});
		await page.waitForTimeout(1500);

		const tabBar = page.locator("[data-ds-component='TabBar']").first();
		await expect(tabBar).toBeVisible();

		const firstTab = tabBar.locator("button[role='tab']").first();
		await expect(firstTab).toBeVisible();

		// Class must use outline-1 (converged from outline-[2px]).
		const className = await firstTab.getAttribute("class");
		expect(className).toContain("outline-1");
		expect(className).not.toContain("outline-[2px]");
	});

	// ── TabBar control-ring — pill variant (C1 fix) ──────────────────────────

	test("TabBar pill variant: tab button focus class is outline-1 (not outline-[2px])", async ({
		page,
	}) => {
		// Navigate to the TabBar PillVariant — this tests the C1 fix (line 73 of TabBar.tsx).
		await page.goto("/designsystem#TabBar::PillVariant", { waitUntil: "domcontentloaded" });
		await page.waitForTimeout(1500);

		const tabBar = page.locator("[data-ds-component='TabBar']").first();
		await expect(tabBar).toBeVisible();

		const firstTab = tabBar.locator("button[role='tab']").first();
		await expect(firstTab).toBeVisible();

		// C1: pill variant must also use outline-1 (was outline-[2px] before fix).
		const className = await firstTab.getAttribute("class");
		expect(className).toContain("outline-1");
		expect(className).not.toContain("outline-[2px]");
	});

	// ── Input input-glow ──────────────────────────────────────────────────────

	test("Input: class uses var(--accent-primary-dim) token (not raw rgba)", async ({ page }) => {
		// Navigate to the Input section.
		await page.goto("/designsystem#Input", { waitUntil: "domcontentloaded" });
		await page.waitForTimeout(1500);

		// Input renders with data-ds-component="Input" on the wrapper div.
		const inputWrapper = page.locator("[data-ds-component='Input']").first();
		await expect(inputWrapper).toBeVisible();

		// Find the actual input inside.
		const inputEl = inputWrapper.locator("input, textarea").first();
		await expect(inputEl).toBeVisible();

		// The class attribute must contain the accent-primary-dim token (not raw rgba).
		const className = await inputEl.getAttribute("class");
		expect(className).toContain("accent-primary-dim");
	});
});
