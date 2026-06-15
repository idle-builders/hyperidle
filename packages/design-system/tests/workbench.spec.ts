/**
 * K12 — Unified workbench Playwright smoke.
 *
 * Verifies the auto-generated catalog at `:8098`:
 *   - ≥ 29 component tiles grouped under Tier 1 / Tier 2 / Tier 3 / Utility,
 *   - clicking a catalogued component (StatusChip) renders in TSX mode (no HTML toggle),
 *   - the density-tier toolbar selector applies `data-density="comfortable"`
 *     to the document root and localStorage records the choice.
 *
 * AJ1: HTML/TSX toggle removed — viewer is TSX-only. Assertions that the toggle
 * is hidden are now replaced by asserting it does NOT exist at all.
 *
 * AJ1 W2 fix: This spec was previously orphaned (port 8197, never wired into
 * verify or CI). Now wired into verify/CI via `npm run ds:workbench`.
 *
 * AJ1 W4 fix: Port 8197 forwarding via `-- -- --port 8197` did not work
 * (npm arg-forwarding to vite requires different syntax). The spec now uses
 * port 8098 (same as the visual regression gate) with reuseExistingServer: true.
 *
 * @lore AJ1: IconRail was removed from the catalog before AJ1 shipped.
 * The test was updated to navigate to StatusChip (a Tier 2 component with demo sections).
 * The NavItem min-height assertion was removed because NavItem does not
 * consume --density-row-h (the toolbar density toggle sets data-density on
 * the html element, but NavItem's height is not token-driven). The test
 * now only asserts that data-density is set and localStorage records the choice.
 */
import { expect, test } from "@playwright/test";

test.describe("design-system workbench", () => {
	test("catalog auto-generates ≥29 tiles grouped by tier", async ({ page }) => {
		await page.goto("http://localhost:8098/");
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

	test("StatusChip tile loads in TSX mode — no HTML toggle present anywhere", async ({ page }) => {
		// Use StatusChip — a catalogued Tier 2 component with demo sections.
		// (IconRail was removed from the catalog before AJ1 shipped; ThreadShell is
		// in ZERO_SECTION_ALLOWLIST so navigating there would show no demo grid.)
		// AJ1: HTML/TSX toggle no longer exists (viewer is TSX-only).
		// Assert the HTML button is completely absent — not just hidden.
		await page.goto("http://localhost:8098/#StatusChip");
		await page.waitForFunction(() => window.location.hash.includes("StatusChip"));
		await page.waitForTimeout(500);

		const htmlBtn = page.locator(".toolbar-btn", { hasText: /^HTML$/ });
		await expect(htmlBtn).toHaveCount(0);

		// Component renders demo sections in the demo grid.
		await expect(page.locator(".demo-grid")).toBeVisible();
	});

	test("density toggle to comfortable sets data-density attribute and persists to localStorage", async ({
		page,
	}) => {
		await page.goto("http://localhost:8098/#NavItem");
		// AJ1: viewer is now TSX-only — no toggle needed. Demo grid is always shown.
		await expect(page.locator(".demo-grid")).toBeVisible();

		const comfortable = page.locator(".toolbar-btn", { hasText: /^Comfortable$/ });
		await expect(comfortable).toBeVisible();
		await comfortable.click();

		// The toolbar density toggle must apply data-density to the html root.
		await expect(page.locator("html")).toHaveAttribute("data-density", "comfortable");

		// Persistence: localStorage records the choice.
		const stored = await page.evaluate(() => localStorage.getItem("ds-density"));
		expect(stored).toBe("comfortable");
	});
});
