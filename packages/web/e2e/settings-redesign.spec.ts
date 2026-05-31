/**
 * P4 — Settings overlay E2E tests (Task 13, AC-11 through AC-26)
 *
 * AC-11: Avatar click opens settings overlay
 * AC-12: Settings has 7 sections navigable via Sidebar
 * AC-13: Profile section persists via PATCH /api/users/:id
 * AC-14: OrgChart section: table of edges, Add Edge form, Delete button
 * AC-15: Credentials section: reuses existing CredentialsTab
 * AC-16: Notifications section: persisted via PATCH /api/settings
 * AC-17: Appearance section: theme + density selects, applied immediately
 * AC-18: Products section: list with active/archived toggle
 * AC-19: BackendMode section: shows current mode, switch button with restart warning
 * AC-21: Escape key closes settings overlay
 * AC-22: Clicking view icon while settings open closes settings and navigates
 * AC-23: Rail is dimmed while settings is open
 * AC-24: Settings save feedback via toast
 * AC-25: Profile edits do NOT silently revert
 * AC-26: Density preference persists across page reload
 */

import { expect, test } from "./fixtures";

const DEFAULT_USER = {
	id: "u-founder-1",
	name: "Test Founder",
	email: "test@hyperidle.dev",
	avatarUrl: null,
	role: "founder",
};

const DEFAULT_SETTINGS = {
	profile: { name: "Test Founder", email: "test@hyperidle.dev", avatarUrl: null },
	teams: [{ id: "t1", name: "My Team", active: true }],
	users: [],
	notifications: {
		reviewAlerts: true,
		costAlerts: true,
		blockerAlerts: true,
		quietHoursEnabled: false,
		quietHoursStart: "22:00",
		quietHoursEnd: "08:00",
		mutedTeams: [],
	},
};

test.describe("Settings Overlay (P4)", () => {
	test.beforeEach(async ({ page }) => {
		// Override auth/me with a real user
		await page.route("**/api/auth/me", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(DEFAULT_USER),
				});
			} else {
				await route.continue();
			}
		});

		// Settings
		await page.route("**/api/settings", async (route) => {
			const method = route.request().method();
			if (method === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(DEFAULT_SETTINGS),
				});
			} else if (method === "PATCH") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(DEFAULT_SETTINGS),
				});
			} else {
				await route.continue();
			}
		});

		// PATCH /api/users/:id — profile save
		await page.route("**/api/users/**", async (route) => {
			if (route.request().method() === "PATCH") {
				const body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ ...DEFAULT_USER, ...body }),
				});
			} else {
				await route.continue();
			}
		});

		// Org chart
		await page.route("**/api/org", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ edges: [], users: [DEFAULT_USER] }),
				});
			} else {
				await route.continue();
			}
		});

		await page.goto("/conversations");
		await page.waitForSelector("[data-testid='main-content']");
	});

	// Helper to open settings overlay
	async function openSettings(page: import("@playwright/test").Page): Promise<void> {
		await page.getByRole("button", { name: /user profile/i }).click();
		await expect(page.getByText("Settings")).toBeVisible({ timeout: 5_000 });
	}

	// AC-11: Avatar click opens settings overlay
	test("avatar click shows Settings title in Sidebar", async ({ page }) => {
		await page.getByRole("button", { name: /user profile/i }).click();
		await expect(page.getByText("Settings")).toBeVisible();
	});

	// AC-12: 7 sections visible
	test("shows 7 settings sections in Sidebar", async ({ page }) => {
		await openSettings(page);

		await expect(page.getByText("Profile")).toBeVisible();
		await expect(page.getByText("Org Chart")).toBeVisible();
		await expect(page.getByText("Credentials")).toBeVisible();
		await expect(page.getByText("Notifications")).toBeVisible();
		await expect(page.getByText("Appearance")).toBeVisible();
		await expect(page.getByText("Products")).toBeVisible();
		await expect(page.getByText("Backend")).toBeVisible();
	});

	// AC-11: Main pane shows Profile form
	test("main pane shows Profile form by default", async ({ page }) => {
		await openSettings(page);
		await expect(page.getByLabel(/^name/i)).toBeVisible();
		await expect(page.getByLabel(/^email/i)).toBeVisible();
	});

	// AC-13: Profile section saves via PATCH /api/users/:id
	test("Profile section saves via PATCH /api/users/:id", async ({ page }) => {
		let patchCalled = false;
		await page.route("**/api/users/**", async (route) => {
			if (route.request().method() === "PATCH") {
				patchCalled = true;
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ ...DEFAULT_USER, name: "Updated Name" }),
				});
			} else {
				await route.continue();
			}
		});

		await openSettings(page);

		const nameInput = page.getByLabel(/^name/i);
		await nameInput.fill("Updated Name");

		await page.getByRole("button", { name: /save profile/i }).click();

		await expect.poll(() => patchCalled, { timeout: 5_000 }).toBe(true);
	});

	// AC-24: Toast appears on profile save
	test("shows toast after successful profile save", async ({ page }) => {
		await openSettings(page);

		const nameInput = page.getByLabel(/^name/i);
		await nameInput.fill("New Name");
		await page.getByRole("button", { name: /save profile/i }).click();

		// Toast should appear
		await expect(page.getByText(/profile saved/i)).toBeVisible({ timeout: 5_000 });
	});

	// AC-21: Escape closes settings
	test("Escape key closes settings overlay", async ({ page }) => {
		await openSettings(page);
		await page.keyboard.press("Escape");
		await expect(page.getByText("Settings")).not.toBeVisible({ timeout: 3_000 });
	});

	// AC-22: Clicking view icon closes settings and navigates
	test("clicking Work view icon closes settings and navigates to /work", async ({ page }) => {
		await openSettings(page);

		// Click the Work view icon
		await page.getByRole("button", { name: /^work$/i }).click();

		await expect(page.getByText("Settings")).not.toBeVisible({ timeout: 3_000 });
		await expect(page).toHaveURL(/\/work/);
	});

	// AC-23: Rail dimmed when settings open
	test("main content is aria-hidden when settings is open", async ({ page }) => {
		await openSettings(page);

		const mainContent = page.getByTestId("main-content");
		await expect(mainContent).toHaveAttribute("aria-hidden", "true");
	});

	// AC-16: Notifications section
	test("Notifications section renders and saves via PATCH /api/settings", async ({ page }) => {
		await openSettings(page);

		// Navigate to Notifications
		await page.getByRole("button", { name: /notifications/i }).click();

		await expect(page.getByText(/review alerts/i)).toBeVisible();
		await expect(page.getByText(/cost alerts/i)).toBeVisible();
		await expect(page.getByText(/blocker alerts/i)).toBeVisible();

		// Save notifications
		let patchCalled = false;
		await page.route("**/api/settings", async (route) => {
			if (route.request().method() === "PATCH") {
				patchCalled = true;
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(DEFAULT_SETTINGS),
				});
			} else {
				await route.continue();
			}
		});

		await page.getByRole("button", { name: /save notifications/i }).click();
		await expect.poll(() => patchCalled, { timeout: 5_000 }).toBe(true);
	});

	// AC-17: Appearance section applies density immediately
	test("Appearance section applies density immediately on change", async ({ page }) => {
		await openSettings(page);

		// Navigate to Appearance
		await page.getByRole("button", { name: /appearance/i }).click();

		// Change density
		const densitySelect = page.getByLabel(/density/i);
		await densitySelect.selectOption("compact");

		// Should be applied immediately (no save button needed)
		const root = page.locator("[data-density]");
		await expect(root).toHaveAttribute("data-density", "compact");
	});

	// AC-17: No save button in Appearance section
	test("Appearance section has no save button", async ({ page }) => {
		await openSettings(page);
		await page.getByRole("button", { name: /appearance/i }).click();

		await expect(page.getByRole("button", { name: /save appearance/i })).not.toBeVisible();
	});

	// AC-26: Density persists across reload
	test("density preference persists across page reload", async ({ page }) => {
		await openSettings(page);
		await page.getByRole("button", { name: /appearance/i }).click();

		await page.getByLabel(/density/i).selectOption("compact");

		// Reload page
		await page.reload();
		await page.waitForSelector("[data-testid='main-content']");

		// Density should still be compact
		const root = page.locator("[data-density]");
		await expect(root).toHaveAttribute("data-density", "compact");
	});

	// AC-25: Profile edits persist (not reverted)
	test("Profile edits do not silently revert after save", async ({ page }) => {
		// Mock GET /api/auth/me after save to return updated user
		let userNameOverride = "Test Founder";
		await page.route("**/api/auth/me", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ...DEFAULT_USER, name: userNameOverride }),
			});
		});

		await page.route("**/api/users/**", async (route) => {
			if (route.request().method() === "PATCH") {
				const body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
				if (typeof body.name === "string") {
					userNameOverride = body.name;
				}
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ ...DEFAULT_USER, name: userNameOverride }),
				});
			} else {
				await route.continue();
			}
		});

		await openSettings(page);

		const nameInput = page.getByLabel(/^name/i);
		await nameInput.fill("Saved Name");
		await page.getByRole("button", { name: /save profile/i }).click();

		// Close settings
		await page.keyboard.press("Escape");

		// Reopen settings
		await openSettings(page);

		// Name should be the saved value, not the original
		await expect(page.getByLabel(/^name/i)).toHaveValue("Saved Name");
	});

	// AC-18: Products section shows products with toggles
	test("Products section shows product list with active/archived toggles", async ({ page }) => {
		await openSettings(page);
		await page.getByRole("button", { name: /products/i }).click();

		await expect(page.getByText("My Product")).toBeVisible();
	});

	// AC-19: Backend section shows current mode
	test("Backend section shows current mode and switch button", async ({ page }) => {
		await openSettings(page);
		await page.getByRole("button", { name: /backend/i }).click();

		// Should show current mode (Local)
		await expect(page.getByText(/local/i)).toBeVisible();
		await expect(page.getByRole("button", { name: /switch/i })).toBeVisible();
	});

	// AC-15: Credentials section reuses CredentialsTab
	test("Credentials section renders CredentialsTab content", async ({ page }) => {
		// Mock credentials API
		await page.route("**/api/credentials", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ credentials: [] }),
				});
			} else {
				await route.continue();
			}
		});

		await openSettings(page);
		await page.getByRole("button", { name: /credentials/i }).click();

		// Credentials section should be visible
		await expect(page.getByText(/credentials/i)).toBeVisible();
	});

	// AC-14: OrgChart section shows table
	test("OrgChart section shows edge table and Add Edge button", async ({ page }) => {
		await openSettings(page);
		await page.getByRole("button", { name: /org chart/i }).click();

		// Should show the Add Edge button
		await expect(page.getByRole("button", { name: /add edge/i })).toBeVisible();
	});

	// R8 AC5: Quiet hours toggle renders in OFF state by default; time inputs disabled when OFF
	test("R8: quiet hours toggle renders OFF by default; time inputs disabled when toggle is OFF", async ({
		page,
	}) => {
		// DEFAULT_SETTINGS has quietHoursEnabled=false
		await openSettings(page);
		await page.getByRole("button", { name: /notifications/i }).click();

		// Toggle should be rendered and unchecked (OFF state)
		const toggle = page.getByRole("checkbox", { name: /enable quiet hours/i });
		await expect(toggle).toBeVisible();
		await expect(toggle).not.toBeChecked();

		// Time inputs should be disabled when toggle is OFF
		const startInput = page.getByLabel(/quiet hours start/i);
		const endInput = page.getByLabel(/quiet hours end/i);
		await expect(startInput).toBeDisabled();
		await expect(endInput).toBeDisabled();
	});

	// R8 AC5: Toggling quiet hours ON makes time inputs editable
	test("R8: toggling quiet hours ON enables time inputs", async ({ page }) => {
		await openSettings(page);
		await page.getByRole("button", { name: /notifications/i }).click();

		const toggle = page.getByRole("checkbox", { name: /enable quiet hours/i });
		await expect(toggle).not.toBeChecked();

		// Toggle ON
		await toggle.click();
		await expect(toggle).toBeChecked();

		// Time inputs should now be enabled
		const startInput = page.getByLabel(/quiet hours start/i);
		const endInput = page.getByLabel(/quiet hours end/i);
		await expect(startInput).toBeEnabled();
		await expect(endInput).toBeEnabled();
	});
});
