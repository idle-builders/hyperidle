/**
 * E2E tests for the Settings panel: opening from avatar, tab switching,
 * form inputs.
 *
 * @lore M3: Settings data now comes from /api/settings. We mock the endpoint
 * here to ensure deterministic product names in the Products tab and to allow
 * the PATCH endpoint (called on Save) to succeed so the dialog closes.
 */
import { expect, test } from "./fixtures";

const SETTINGS_FIXTURE = {
	profile: { name: "Test Founder", email: "test@hyperidle.dev", avatarUrl: null },
	teams: [{ id: "team-alpha", name: "Team Alpha", active: true }],
	users: [],
	notifications: {
		reviewAlerts: true,
		costAlerts: false,
		blockerAlerts: true,
		quietHoursEnabled: false,
		quietHoursStart: "22:00",
		quietHoursEnd: "08:00",
		mutedTeams: [],
	},
};

test.describe("Settings", () => {
	test.beforeEach(async ({ page }) => {
		// Mock GET /api/settings so the panel shows deterministic data.
		await page.route("**/api/settings", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(SETTINGS_FIXTURE),
				});
			} else if (route.request().method() === "PATCH") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(SETTINGS_FIXTURE),
				});
			} else {
				await route.continue();
			}
		});
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");
	});

	test("Settings panel opens when avatar/profile button is clicked", async ({ page }) => {
		await page.getByRole("button", { name: /^user profile$/i }).click();
		await expect(page.getByRole("dialog", { name: /settings/i })).toBeVisible();
	});

	test("Settings panel shows five tabs", async ({ page }) => {
		await page.getByRole("button", { name: /^user profile$/i }).click();
		await expect(page.getByRole("tab", { name: "Profile" })).toBeVisible();
		await expect(page.getByRole("tab", { name: "Products" })).toBeVisible();
		await expect(page.getByRole("tab", { name: "Agents" })).toBeVisible();
		await expect(page.getByRole("tab", { name: "Notifications" })).toBeVisible();
		await expect(page.getByRole("tab", { name: "Appearance" })).toBeVisible();
	});

	test("Profile tab shows name and email inputs", async ({ page }) => {
		await page.getByRole("button", { name: /^user profile$/i }).click();
		await expect(page.getByLabel("Name")).toBeVisible();
		await expect(page.getByLabel("Email")).toBeVisible();
	});

	test("switching tabs shows different content", async ({ page }) => {
		await page.getByRole("button", { name: /^user profile$/i }).click();
		await page.getByRole("tab", { name: "Products" }).click();
		await expect(page.getByText("Product Alpha")).toBeVisible();
	});

	test("Escape closes the settings panel", async ({ page }) => {
		await page.getByRole("button", { name: /^user profile$/i }).click();
		await expect(page.getByRole("dialog", { name: /settings/i })).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog", { name: /settings/i })).not.toBeVisible();
	});
});
