/**
 * I4 E3: Error resilience E2E — unknown URL shows NotFound, not a blank page.
 */
import { expect, test } from "./fixtures";

test.describe("Error resilience", () => {
	test("navigating to /nonexistent shows a 'Page not found' message", async ({ page }) => {
		await page.goto("/nonexistent");
		await expect(page.getByText(/page not found/i)).toBeVisible();
	});

	test("NotFound page provides a Go home link back to the app", async ({ page }) => {
		await page.goto("/another-random-url");
		const homeLink = page.getByRole("link", { name: /home|back|dashboard/i }).first();
		await expect(homeLink).toBeVisible();
	});

	test("IconRail remains visible on NotFound so users can navigate away", async ({ page }) => {
		await page.goto("/totally-bogus");
		await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
	});
});
