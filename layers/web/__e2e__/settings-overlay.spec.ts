/**
 * J3 — Settings overlay + Command-K integration E2E.
 *
 * AC validation scenarios:
 * - Open Settings → press Esc → verify closed.
 * - Open Settings → press Command-K → Settings closed + search open.
 */
import { expect, test } from "./fixtures";

test.describe("Settings overlay (J3)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");
	});

	test("Esc closes the Settings overlay", async ({ page }) => {
		await page.getByRole("button", { name: /user profile/i }).click();
		await expect(page.getByRole("dialog", { name: /settings/i })).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog", { name: /settings/i })).not.toBeVisible();
	});

	test("Command-K pressed while Settings is open closes Settings and opens search", async ({
		page,
	}) => {
		await page.getByRole("button", { name: /user profile/i }).click();
		await expect(page.getByRole("dialog", { name: /settings/i })).toBeVisible();
		await page.keyboard.press("Meta+k");
		await expect(page.getByRole("dialog", { name: /settings/i })).not.toBeVisible();
		await expect(page.getByRole("dialog", { name: /global search/i })).toBeVisible();
	});

	test("Settings main content is inert (aria-hidden) while overlay open", async ({ page }) => {
		await page.getByRole("button", { name: /user profile/i }).click();
		await expect(page.getByRole("dialog", { name: /settings/i })).toBeVisible();
		const main = page.getByTestId("main-content");
		await expect(main).toHaveAttribute("aria-hidden", "true");
	});
});
