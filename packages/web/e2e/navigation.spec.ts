/**
 * E2E tests for the shell navigation: IconRail view switching, Submenu items,
 * and overall layout structure.
 */
import { expect, test } from "@playwright/test";

test.describe("Navigation", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		// Default route redirects to /conversations/review
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
		await expect(page.getByText("Portfolio")).toBeVisible();
		await expect(page.getByText("Team Board")).toBeVisible();
	});

	test("clicking Knowledge button switches to Knowledge view", async ({ page }) => {
		await page.getByRole("button", { name: /knowledge/i }).click();
		await expect(page.getByText("All Items")).toBeVisible();
	});

	test("Submenu shows correct items for Conversations view", async ({ page }) => {
		await expect(page.getByText("Review Queue")).toBeVisible();
		await expect(page.getByText("Chat")).toBeVisible();
	});

	test("clicking Submenu item navigates to that page", async ({ page }) => {
		await page.getByText("Chat").click();
		await expect(page.getByTestId("conversations-chat-page")).toBeVisible();
	});

	test("default route lands on Conversations Review", async ({ page }) => {
		await expect(page.getByTestId("conversations-review-page")).toBeVisible();
	});
});
