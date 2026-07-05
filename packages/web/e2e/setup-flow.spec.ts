/**
 * R2 — SetupFlow E2E tests (updated from P4)
 *
 * R2 AC coverage:
 * AC-1: Setup flow has two required fields: name and API key. Repo path is optional.
 * AC-2: Backend mode selection is removed from the setup flow.
 * AC-3: Email field is removed from setup.
 * AC-4: No "First Product" section — product created silently.
 * AC-5: After setup completion, app routes to /work (not /conversations).
 * AC-10: FirstRunRedirect checks for human user + team.
 *
 * P4 tests removed/updated:
 * - AC-2 BackendMode select test → removed (backend mode removed in R2)
 * - AC-3 Shared backend fields → removed (backend mode removed in R2)
 * - AC-4 Name and email fields → updated (email removed in R2)
 * - AC-5 Product name and repo path fields → updated (product name removed in R2)
 * - AC-6 Skip credentials button → removed (skip button removed in R2)
 * - AC-7 Start button enabled when name+email+product name → updated (now name+API key)
 * - AC-8 Navigates to /conversations → updated (now /work)
 */

import { expect, test } from "./fixtures";

test.describe("SetupFlow (R2)", () => {
	// Register additional API mocks for setup
	test.beforeEach(async ({ page }) => {
		// No human user — auth/me returns 401
		await page.route("**/api/auth/me", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 401,
					contentType: "application/json",
					body: JSON.stringify({ error: "Unauthorized" }),
				});
			} else {
				await route.continue();
			}
		});

		// No teams — fresh install
		await page.route("**/api/teams", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ teams: [] }),
				});
			} else {
				await route.continue();
			}
		});

		// POST /api/users — create human user (no email required)
		await page.route("**/api/users", async (route) => {
			if (route.request().method() === "POST") {
				await route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify({
						user: {
							id: "u-new-founder",
							name: "Alice",
							kind: "human",
							role: "founder",
							status: "active",
						},
					}),
				});
			} else {
				await route.continue();
			}
		});

		// POST /api/teams
		await page.route("**/api/teams", async (route) => {
			const method = route.request().method();
			if (method === "POST") {
				await route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify({
						id: "team-new",
						name: "My Team",
						status: "healthy",
						activeBets: 0,
					}),
				});
			} else {
				await route.continue();
			}
		});
	});

	// AC-1: Redirected to /setup when no human user
	test("redirects to /setup on fresh install (no human user)", async ({ page }) => {
		await page.goto("/");
		await expect(page).toHaveURL(/\/setup/);
	});

	// AC-1: Name and API key fields exist (required). Repo path optional.
	test("renders name and API key fields; repo path optional", async ({ page }) => {
		await page.goto("/setup");

		await expect(page.getByLabel(/your name/i)).toBeVisible();
		await expect(page.getByLabel(/anthropic api key/i)).toBeVisible();
		await expect(page.getByLabel(/project folder/i)).toBeVisible();
	});

	// AC-2: Backend mode selector is NOT present
	test("does not render backend mode selector", async ({ page }) => {
		await page.goto("/setup");
		await expect(page.getByRole("combobox", { name: /backend mode/i })).not.toBeVisible();
	});

	// AC-3: Email field is NOT present
	test("does not render email field", async ({ page }) => {
		await page.goto("/setup");
		await expect(page.getByLabel(/^email/i)).not.toBeVisible();
	});

	// AC-4: Product name field is NOT present
	test("does not render product name field", async ({ page }) => {
		await page.goto("/setup");
		await expect(page.getByLabel(/product name/i)).not.toBeVisible();
	});

	// AC-6: No "Skip credentials" button
	test("does not render skip credentials button", async ({ page }) => {
		await page.goto("/setup");
		await expect(page.getByRole("button", { name: /skip credentials/i })).not.toBeVisible();
	});

	// AC-1: Start button disabled initially
	test("Start button is disabled when required fields are empty", async ({ page }) => {
		await page.goto("/setup");

		const startBtn = page.getByRole("button", { name: /start hyperidle/i });
		await expect(startBtn).toBeDisabled();
	});

	// AC-1: Start button enabled when name and API key are filled (not email+product)
	test("Start button becomes enabled when name and API key are filled", async ({ page }) => {
		await page.goto("/setup");

		await page.getByLabel(/your name/i).fill("Alice Founder");
		await page.getByLabel(/anthropic api key/i).fill("sk-ant-test");

		const startBtn = page.getByRole("button", { name: /start hyperidle/i });
		await expect(startBtn).toBeEnabled();
	});

	// AC-5: After completing setup, navigates to /work
	test("navigates to /work after successful setup", async ({ page }) => {
		// After setup, auth/me should return a user
		await page.route("**/api/auth/me", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					id: "u-new-founder",
					name: "Alice",
					avatarUrl: null,
				}),
			});
		});

		await page.goto("/setup");

		await page.getByLabel(/your name/i).fill("Alice Founder");
		await page.getByLabel(/anthropic api key/i).fill("sk-ant-test");

		await page.getByRole("button", { name: /start hyperidle/i }).click();

		await expect(page).toHaveURL(/\/work(?:\?onboarding=true)?$/, { timeout: 10_000 });
	});

	// AC-10: FirstRunRedirect checks both user + teams
	test("redirects to /setup when user exists but no teams (AC-10)", async ({ page }) => {
		// User exists
		await page.route("**/api/auth/me", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					id: "u-existing",
					name: "Existing User",
					avatarUrl: null,
				}),
			});
		});

		// But no teams
		await page.route("**/api/teams", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ teams: [] }),
				});
			} else {
				await route.continue();
			}
		});

		await page.goto("/");
		await expect(page).toHaveURL(/\/setup/);
	});
});
