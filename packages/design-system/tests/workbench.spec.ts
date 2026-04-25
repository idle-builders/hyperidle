/**
 * K12 — Unified workbench Playwright smoke.
 *
 * Verifies the auto-generated catalog at `:8098`:
 *   - ≥ 29 component tiles grouped under Tier 1 / Tier 2 / Tier 3 / Utility,
 *   - clicking a Tier 3 shell (IconRail) loads in TSX mode and hides the
 *     HTML/TSX toggle (no `.html` reference exists),
 *   - the density-tier toolbar selector applies `data-density="comfortable"`
 *     to the document root and the rendered NavItem reflects the
 *     comfortable density tokens from `tokens.css`.
 */
import { expect, test } from "@playwright/test";

test.describe("design-system workbench", () => {
	test("catalog auto-generates ≥29 tiles grouped by tier", async ({ page }) => {
		await page.goto("http://localhost:8197/");
		await expect(page.locator(".catalog-title")).toHaveText("HyperIdle Design System");

		const tiles = page.locator(".component-link");
		await expect(tiles.first()).toBeVisible();
		const count = await tiles.count();
		expect(count).toBeGreaterThanOrEqual(29);

		await expect(page.locator(".tier-heading", { hasText: "Tier 1" })).toBeVisible();
		await expect(page.locator(".tier-heading", { hasText: "Tier 2" })).toBeVisible();
		await expect(page.locator(".tier-heading", { hasText: "Tier 3" })).toBeVisible();
		await expect(page.locator(".tier-heading", { hasText: "Utility" })).toBeVisible();
	});

	test("IconRail tile loads in TSX mode with the HTML/TSX toggle hidden", async ({ page }) => {
		await page.goto("http://localhost:8197/");
		await page.locator(".component-link", { hasText: "IconRail" }).first().click();

		// Wait for navigation to settle.
		await page.waitForFunction(() => window.location.hash.includes("IconRail"));

		// HTML/TSX pill is hidden (only the theme + density pills remain).
		const htmlBtn = page.locator(".toolbar-btn", { hasText: /^HTML$/ });
		await expect(htmlBtn).toHaveCount(0);

		// Component renders inside the demo grid (TSX mode wraps each variant).
		await expect(page.locator(".demo-section").first()).toBeVisible();
	});

	test("density toggle to comfortable reflects on data-density and rendered NavItem", async ({
		page,
	}) => {
		await page.goto("http://localhost:8197/#NavItem");
		// Force TSX mode so the rendered NavItem inherits the document's data-density.
		// (NavItem has both HTML and TSX, so the toggle is visible.)
		await page.locator(".toolbar-btn", { hasText: /^TSX$/ }).click();
		// Wait for TSX render — the demo grid is unique to TSX mode.
		await expect(page.locator(".demo-grid")).toBeVisible();

		const comfortable = page.locator(".toolbar-btn", { hasText: /^Comfortable$/ });
		await expect(comfortable).toBeVisible();
		await comfortable.click();

		await expect(page.locator("html")).toHaveAttribute("data-density", "comfortable");

		// NavItem button consumes --density-row-h. Comfortable = 3.5rem; the
		// viewer's html font-size is 14px (see viewer.css), so 3.5rem = 49px.
		// Default would be 2.75rem = ~38.5px and compact 2rem = 28px, so a
		// minHeight at or above the comfortable threshold proves the density
		// token took effect.
		const navButton = page.locator("[data-ds-component='NavItem'] button").first();
		await expect(navButton).toBeVisible();
		const minH = await navButton.evaluate((el) =>
			Number.parseFloat(getComputedStyle(el).minHeight),
		);
		expect(minH).toBeGreaterThanOrEqual(48);

		// And persistence: localStorage records the choice.
		const stored = await page.evaluate(() => localStorage.getItem("ds-density"));
		expect(stored).toBe("comfortable");
	});
});
