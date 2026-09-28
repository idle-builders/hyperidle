/**
 * Journey: an unknown URL shows an actionable "Page not found" screen instead
 * of a blank page, with a real way back into the app.
 */
import { expect, test } from "./fixtures";

test.describe("Error resilience", () => {
	test("navigating to /nonexistent shows a 'Page not found' message", async ({ page }) => {
		await page.goto("/nonexistent");
		await expect(page.getByText(/page not found/i)).toBeVisible();
	});

	test("NotFound page provides a way back into the app", async ({ page }) => {
		await page.goto("/another-random-url");
		await expect(page.getByTestId("not-found-go-to-conversations")).toBeVisible();
		await expect(page.getByTestId("not-found-go-back")).toBeVisible();
	});
});
