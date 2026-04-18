/**
 * E2E tests for the Settings panel: opening from avatar, tab switching,
 * form inputs.
 */
import { expect, test } from "@playwright/test";

test.describe("Settings", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");
	});

	test("Settings panel opens when avatar/profile button is clicked", async ({ page }) => {
		await page.getByRole("button", { name: /profile|user/i }).click();
		await expect(page.getByRole("dialog", { name: /settings/i })).toBeVisible();
	});

	test("Settings panel shows five tabs", async ({ page }) => {
		await page.getByRole("button", { name: /profile|user/i }).click();
		await expect(page.getByRole("tab", { name: "Profile" })).toBeVisible();
		await expect(page.getByRole("tab", { name: "Products" })).toBeVisible();
		await expect(page.getByRole("tab", { name: "Agents" })).toBeVisible();
		await expect(page.getByRole("tab", { name: "Notifications" })).toBeVisible();
		await expect(page.getByRole("tab", { name: "Appearance" })).toBeVisible();
	});

	test("Profile tab shows name and email inputs", async ({ page }) => {
		await page.getByRole("button", { name: /profile|user/i }).click();
		await expect(page.getByLabel("Name")).toBeVisible();
		await expect(page.getByLabel("Email")).toBeVisible();
	});

	test("switching tabs shows different content", async ({ page }) => {
		await page.getByRole("button", { name: /profile|user/i }).click();
		await page.getByRole("tab", { name: "Products" }).click();
		await expect(page.getByText("HyperIdle")).toBeVisible();
	});

	test("Escape closes the settings panel", async ({ page }) => {
		await page.getByRole("button", { name: /profile|user/i }).click();
		await expect(page.getByRole("dialog", { name: /settings/i })).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog", { name: /settings/i })).not.toBeVisible();
	});
});
