/**
 * E2E tests for Global Search (Cmd+K): opening, typing, filtering, closing.
 */
import { expect, test } from "@playwright/test";

test.describe("Global Search", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");
	});

	test("Cmd+K opens the search panel", async ({ page }) => {
		await page.keyboard.press("Meta+k");
		await expect(page.getByRole("dialog")).toBeVisible();
		// Search input should be auto-focused
		const input = page.getByRole("textbox");
		await expect(input).toBeFocused();
	});

	test("Escape closes the search panel", async ({ page }) => {
		await page.keyboard.press("Meta+k");
		await expect(page.getByRole("dialog")).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog")).not.toBeVisible();
	});

	test("typing in search shows results or empty state", async ({ page }) => {
		await page.keyboard.press("Meta+k");
		const input = page.getByRole("textbox");
		await input.fill("nonexistent-search-term-xyz");
		// Wait for debounce + API response
		await page.waitForTimeout(300);
		// Should show either results or "No matches" empty state
		const hasResults = (await page.getByText("Conversations").count()) > 0;
		const hasEmptyState = (await page.getByText("No matches").count()) > 0;
		expect(hasResults || hasEmptyState).toBe(true);
	});
});
