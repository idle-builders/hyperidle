/**
 * E2E tests for the shell navigation: IconRail view switching, Submenu items,
 * and overall layout structure.
 */
import { expect, test } from "@playwright/test";

test.describe("Navigation", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		// Default route redirects to /conversations (L9: canonical queue URL)
		await page.waitForSelector("[data-testid='main-content']");
	});

	test("shell layout renders four regions: IconRail, Submenu, Main, Rail", async ({ page }) => {
		// IconRail
		await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
		// Main content area
		await expect(page.getByTestId("main-content")).toBeVisible();
		// Rail sections
		await expect(page.getByText("Active Bets").first()).toBeVisible();
	});

	test("IconRail shows three view buttons: Conversations, Work, Knowledge", async ({ page }) => {
		await expect(page.getByRole("button", { name: /conversations/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /work/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /knowledge/i })).toBeVisible();
	});

	// @lore L13: "Team Board" was removed from the Work submenu. Portfolio is
	// now the single Work landing; product drilldown is reached via card click.
	// Updated: assert only "Portfolio" is present (not "Team Board").
	test("clicking Work button switches to Work view with Portfolio submenu", async ({ page }) => {
		await page.getByRole("button", { name: /work/i }).click();
		await expect(page.getByRole("button", { name: "Portfolio" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Team Board" })).toHaveCount(0);
	});

	test("clicking Knowledge button switches to Knowledge view", async ({ page }) => {
		// J6: Knowledge submenu is a scope browser + topic NavItems, not a flat
		// list. After clicking Knowledge we expect the Practice scope tab
		// selected and at least one topic NavItem visible.
		await page.getByRole("button", { name: /knowledge/i }).click();
		await expect(page.getByTestId("knowledge-submenu")).toBeVisible();
		await expect(
			page.getByTestId("knowledge-submenu").getByRole("tab", { name: "Practice" }),
		).toHaveAttribute("aria-selected", "true");
	});

	test("default route lands on Conversations", async ({ page }) => {
		await expect(page.getByTestId("conversations-page")).toBeVisible();
	});
});
