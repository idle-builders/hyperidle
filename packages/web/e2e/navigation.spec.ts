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
		await expect(page.getByText("Active Bets")).toBeVisible();
	});

	test("IconRail shows three view buttons: Conversations, Work, Knowledge", async ({ page }) => {
		await expect(page.getByRole("button", { name: /conversations/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /work/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /knowledge/i })).toBeVisible();
	});

	test("clicking Work button switches to Work view with Portfolio and Team submenu", async ({
		page,
	}) => {
		await page.getByRole("button", { name: /work/i }).click();
		await expect(page.getByRole("button", { name: "Portfolio" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Team Board" })).toBeVisible();
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

	// L8: the Conversations Submenu no longer renders the legacy
	// "Review Queue" / "Chat" navigation buttons — those are replaced by
	// the live thread list bucketed into Blocking / Active / Resolved
	// sections. The conversations-submenu.spec.ts suite covers the
	// replacement contract. Skipping these legacy assertions until the
	// chat sub-route is folded into the thread list (separate story).
	test.skip("Submenu shows correct items for Conversations view", async ({ page }) => {
		await expect(page.getByRole("button", { name: /^Review Queue/ })).toBeVisible();
		await expect(page.getByRole("button", { name: /^Chat\b/ })).toBeVisible();
	});

	test.skip("clicking Submenu item navigates to that page", async ({ page }) => {
		await page.getByRole("button", { name: /^Chat\b/ }).click();
		await expect(page.getByTestId("conversations-chat-page")).toBeVisible();
	});

	test("default route lands on Conversations Review", async ({ page }) => {
		await expect(page.getByTestId("conversations-review-page")).toBeVisible();
	});
});
