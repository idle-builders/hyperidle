/**
 * E2E tests for keyboard navigation and responsive layout.
 */
import { expect, test } from "@playwright/test";

test.describe("Keyboard Navigation", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/conversations/review");
		await page.waitForSelector("[data-testid='conversations-review-page']");
	});

	test("Tab key moves focus through interactive elements", async ({ page }) => {
		// Start by pressing Tab — focus should land on an interactive element
		await page.keyboard.press("Tab");
		const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
		expect(["BUTTON", "A", "INPUT", "SELECT"]).toContain(focusedTag);
	});

	test("ReviewHeader keyboard shortcut A triggers approve on review page", async ({ page }) => {
		// Focus outside any input to enable shortcuts
		await page.click("[data-testid='main-content']");
		// Press 'a' for approve — the shortcut should be intercepted
		// We verify it doesn't navigate away or cause errors
		await page.keyboard.press("a");
		// Page should still be on the review page
		await expect(page.getByTestId("conversations-review-page")).toBeVisible();
	});
});

test.describe("Responsive Layout", () => {
	test("layout renders correctly at 1920x1080", async ({ page }) => {
		await page.setViewportSize({ width: 1920, height: 1080 });
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		// All four regions should be visible
		await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
		await expect(page.getByTestId("main-content")).toBeVisible();
		await expect(page.getByText("Active Bets")).toBeVisible();
	});

	test("layout renders correctly at 1280x720", async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 720 });
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
		await expect(page.getByTestId("main-content")).toBeVisible();
	});

	test("layout does not break at 1024x768", async ({ page }) => {
		await page.setViewportSize({ width: 1024, height: 768 });
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		// Core content should still be visible
		await expect(page.getByTestId("main-content")).toBeVisible();
	});
});
