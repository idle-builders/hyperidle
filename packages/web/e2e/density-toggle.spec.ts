/**
 * E2E test for the J1 density toggle. Verifies that switching the
 * Appearance > Density select to "compact" and saving:
 *   1. Sets [data-density="compact"] on the AppShell root.
 *   2. Reduces the computed left padding on <main> versus the default,
 *      proving the --density-pad-x var actually cascades to a consumer.
 *
 * @lore We measure paddingLeft (not class names) because that is the only
 * proof the cascade reaches the rendered element. Asserting the class is
 * present on <main> would only prove the JSX wrote the var-token utility,
 * not that the [data-density] attribute changed the resolved value.
 */
import { expect, test } from "./fixtures";

/**
 * Stub for PATCH /api/settings so Save closes the dialog in e2e.
 * @lore M3: AppShell.handleSettingsSave calls PATCH /api/settings — without
 * a real server in e2e this throws and the dialog never closes. Mock it here.
 */
async function stubSettingsPatch(page: import("@playwright/test").Page): Promise<void> {
	await page.route("**/api/settings", async (route) => {
		if (route.request().method() === "PATCH") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true }),
			});
		} else {
			await route.continue();
		}
	});
}

test.describe("Density toggle", () => {
	test.beforeEach(async ({ page }) => {
		await stubSettingsPatch(page);
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");
	});

	test("changing density to compact updates [data-density] and shrinks main padding", async ({
		page,
	}) => {
		const main = page.locator("[data-testid='main-content']");

		// Capture the default paddingLeft before any change.
		const defaultPaddingLeft = await main.evaluate(
			(el) => Number.parseFloat(getComputedStyle(el).paddingLeft) || 0,
		);
		expect(defaultPaddingLeft).toBeGreaterThan(0);

		// The AppShell root carries data-density. It is the parent of <main>.
		const shellDensityBefore = await page.evaluate(() => {
			const el = document.querySelector("[data-density]");
			return el?.getAttribute("data-density") ?? null;
		});
		expect(shellDensityBefore).toBe("default");

		// Open Settings, switch to Appearance, set density to compact, save.
		await page.getByRole("button", { name: /^user profile$/i }).click();
		await expect(page.getByRole("dialog", { name: /settings/i })).toBeVisible();
		await page.getByRole("tab", { name: "Appearance" }).click();
		await page.getByLabel("Density").selectOption("compact");
		await page.getByRole("button", { name: "Save" }).click();

		// Wait for the panel to close (signals save resolved) and the
		// [data-density] attribute to flip.
		await expect(page.getByRole("dialog", { name: /settings/i })).not.toBeVisible();
		await expect
			.poll(async () =>
				page.evaluate(() => document.querySelector("[data-density]")?.getAttribute("data-density")),
			)
			.toBe("compact");

		const compactPaddingLeft = await main.evaluate(
			(el) => Number.parseFloat(getComputedStyle(el).paddingLeft) || 0,
		);
		expect(compactPaddingLeft).toBeLessThan(defaultPaddingLeft);
	});
});
