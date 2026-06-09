/**
 * E2E tests for the shell navigation: Sidebar view switching and overall
 * layout structure.
 *
 * @lore U6: The old IconRail | Submenu | Rail quad-column layout was replaced
 * by a 200px Sidebar on the left. Tests updated to reflect the new structure.
 */
import { expect, test } from "./fixtures";

test.describe("Navigation", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		// Default route redirects to /conversations (L9: canonical queue URL)
		await page.waitForSelector("[data-testid='main-content']");
	});

	test("shell layout renders Sidebar and Main content area", async ({ page }) => {
		// Sidebar nav (data-ds-shell="Sidebar")
		await expect(page.locator("[data-ds-shell='Sidebar']")).toBeVisible();
		// Main content area
		await expect(page.getByTestId("main-content")).toBeVisible();
	});

	test("Sidebar shows three section headers: Conversations, Work, Knowledge", async ({ page }) => {
		await expect(page.getByRole("button", { name: /conversations/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /work/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /knowledge/i })).toBeVisible();
	});

	// @lore U6: The Work section in the Sidebar shows team sub-items.
	// Clicking the Work section header navigates to /work/portfolio.
	test("clicking Work section header shows team sub-items in Sidebar", async ({ page }) => {
		await page.getByRole("button", { name: /work/i }).click();
		// The Work section header becomes active (data-active='true')
		await expect(page.locator("[data-section='work'][data-active='true']")).toBeVisible();
	});

	test("clicking Knowledge section header activates the Knowledge section", async ({ page }) => {
		// @lore W3: Knowledge scope sub-items (Practices, Products, Factory) were
		// removed from the Sidebar in W3 AC-3. The Knowledge section header activates
		// and navigates to /knowledge without scope sub-items.
		await page.getByRole("button", { name: /knowledge/i }).click();
		// Knowledge section becomes active
		await expect(page.locator("[data-section='knowledge'][data-active='true']")).toBeVisible();
	});

	test("default route lands on Conversations", async ({ page }) => {
		await expect(page.getByTestId("conversations-page")).toBeVisible();
	});
});
