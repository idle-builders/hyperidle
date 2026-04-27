/**
 * E2E tests for the Settings panel: opening from avatar, tab switching,
 * form inputs.
 *
 * @lore L7: the avatar button now opens an AvatarMenu (Settings + Pause
 * Factory + Sign out). Tests reach Settings by clicking the avatar
 * trigger followed by the "Settings" menuitem in the dropdown.
 */
import { expect, test } from "@playwright/test";

async function openSettings(page: import("@playwright/test").Page): Promise<void> {
	await page.getByRole("button", { name: /^user profile$/i }).click();
	await page.getByRole("menuitem", { name: /^settings$/i }).click();
}

test.describe("Settings", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");
	});

	test("Settings panel opens when avatar/profile button is clicked", async ({ page }) => {
		await openSettings(page);
		await expect(page.getByRole("dialog", { name: /settings/i })).toBeVisible();
	});

	test("Settings panel shows five tabs", async ({ page }) => {
		await openSettings(page);
		await expect(page.getByRole("tab", { name: "Profile" })).toBeVisible();
		await expect(page.getByRole("tab", { name: "Products" })).toBeVisible();
		await expect(page.getByRole("tab", { name: "Agents" })).toBeVisible();
		await expect(page.getByRole("tab", { name: "Notifications" })).toBeVisible();
		await expect(page.getByRole("tab", { name: "Appearance" })).toBeVisible();
	});

	test("Profile tab shows name and email inputs", async ({ page }) => {
		await openSettings(page);
		await expect(page.getByLabel("Name")).toBeVisible();
		await expect(page.getByLabel("Email")).toBeVisible();
	});

	test("switching tabs shows different content", async ({ page }) => {
		await openSettings(page);
		await page.getByRole("tab", { name: "Products" }).click();
		await expect(page.getByText("Product Alpha")).toBeVisible();
	});

	test("Escape closes the settings panel", async ({ page }) => {
		await openSettings(page);
		await expect(page.getByRole("dialog", { name: /settings/i })).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog", { name: /settings/i })).not.toBeVisible();
	});
});
