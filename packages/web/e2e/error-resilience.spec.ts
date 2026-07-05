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
		await expect(page.getByRole("button", { name: /go to conversations/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /go back/i })).toBeVisible();
	});

	test("NotFound is standalone outside the app shell", async ({ page }) => {
		await page.goto("/totally-bogus");
		await expect(page.getByTestId("not-found-page")).toBeVisible();
		await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
	});
});
