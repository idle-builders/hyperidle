/**
 * P4 — SetupFlow E2E tests (Tasks 12, AC-1 through AC-10)
 *
 * AC-1: On first launch (no human user exists), app shows SetupFlow at /setup
 * AC-2: BackendMode select with "Run locally" (default) and "Connect to shared backend"
 * AC-3: Shared backend selection shows URL + key fields and "Test Connection" button
 * AC-4: Name and email fields for user identity
 * AC-5: Product name (required) + repo path (optional)
 * AC-6: Anthropic API Key field (optional) with "Skip credentials" and "Start HyperIdle" buttons
 * AC-7: Start button disabled until name + email + product name are filled
 * AC-8: After completing setup, main UI renders at /conversations
 * AC-10: FirstRunRedirect checks for human user + product (not just products)
 */

import { expect, test } from "./fixtures";

test.describe("SetupFlow (P4)", () => {
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

		// No products — fresh install
		await page.route("**/api/products", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ products: [] }),
				});
			} else {
				await route.continue();
			}
		});

		// POST /api/users — create human user
		await page.route("**/api/users", async (route) => {
			if (route.request().method() === "POST") {
				await route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify({
						id: "u-new-founder",
						name: "Alice",
						email: "alice@example.com",
						kind: "human",
						role: "founder",
						status: "active",
					}),
				});
			} else {
				await route.continue();
			}
		});

		// Mock post-setup auth/me (after user creation)
		// POST /api/products
		await page.route("**/api/products", async (route) => {
			const method = route.request().method();
			if (method === "POST") {
				await route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify({
						id: "p-new-product",
						name: "My First Product",
						phase: "build",
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

	// AC-2: BackendMode select with correct options and default
	test("BackendMode select has correct options with 'Run locally' as default", async ({ page }) => {
		await page.goto("/setup");
		await page.waitForSelector("select");

		const backendSelect = page.getByRole("combobox", { name: /backend mode/i });
		await expect(backendSelect).toBeVisible();
		await expect(backendSelect.getByRole("option", { name: /run locally/i })).toBeAttached();
		await expect(
			backendSelect.getByRole("option", { name: /connect to shared backend/i }),
		).toBeAttached();

		// Default is "Run locally"
		const selectedValue = await backendSelect.evaluate((el: HTMLSelectElement) =>
			el.options[el.selectedIndex].text,
		);
		expect(selectedValue).toMatch(/run locally/i);
	});

	// AC-3: Shared backend fields appear when selected
	test("shared backend fields appear when 'Connect to shared backend' selected", async ({
		page,
	}) => {
		await page.goto("/setup");

		const backendSelect = page.getByRole("combobox", { name: /backend mode/i });
		await backendSelect.selectOption({ label: /connect to shared backend/i });

		await expect(page.getByLabel(/server url/i)).toBeVisible();
		await expect(page.getByLabel(/shared backend key/i)).toBeVisible();
		await expect(page.getByRole("button", { name: /test connection/i })).toBeVisible();
	});

	// AC-4: Name and email fields exist
	test("renders name and email fields for user identity", async ({ page }) => {
		await page.goto("/setup");

		await expect(page.getByLabel(/^name/i)).toBeVisible();
		await expect(page.getByLabel(/^email/i)).toBeVisible();
	});

	// AC-5: Product name and repo path fields exist
	test("renders product name and repo path fields", async ({ page }) => {
		await page.goto("/setup");

		await expect(page.getByLabel(/product name/i)).toBeVisible();
		await expect(page.getByLabel(/repo/i)).toBeVisible();
	});

	// AC-6: API key field and buttons exist
	test("renders API credentials field, skip button, and start button", async ({ page }) => {
		await page.goto("/setup");

		await expect(page.getByLabel(/anthropic api key/i)).toBeVisible();
		await expect(page.getByRole("button", { name: /skip credentials/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /start hyperidle/i })).toBeVisible();
	});

	// AC-7: Start button disabled initially
	test("Start button is disabled when required fields are empty", async ({ page }) => {
		await page.goto("/setup");

		const startBtn = page.getByRole("button", { name: /start hyperidle/i });
		await expect(startBtn).toBeDisabled();
	});

	// AC-7: Start button enabled when all required fields filled
	test("Start button becomes enabled when name, email, and product name are filled", async ({
		page,
	}) => {
		await page.goto("/setup");

		await page.getByLabel(/^name/i).fill("Alice Founder");
		await page.getByLabel(/^email/i).fill("alice@example.com");
		await page.getByLabel(/product name/i).fill("My First Product");

		const startBtn = page.getByRole("button", { name: /start hyperidle/i });
		await expect(startBtn).toBeEnabled();
	});

	// AC-8: After completing setup, navigates to /conversations
	test("navigates to /conversations after successful setup", async ({ page }) => {
		// After setup, auth/me should return a user
		await page.route("**/api/auth/me", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					id: "u-new-founder",
					name: "Alice",
					email: "alice@example.com",
					avatarUrl: null,
				}),
			});
		});

		await page.goto("/setup");

		await page.getByLabel(/^name/i).fill("Alice Founder");
		await page.getByLabel(/^email/i).fill("alice@example.com");
		await page.getByLabel(/product name/i).fill("My First Product");

		await page.getByRole("button", { name: /start hyperidle/i }).click();

		await expect(page).toHaveURL(/\/conversations/, { timeout: 10_000 });
	});

	// AC-10: FirstRunRedirect checks both user + products
	test("redirects to /setup when user exists but no products (AC-10)", async ({ page }) => {
		// User exists
		await page.route("**/api/auth/me", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					id: "u-existing",
					name: "Existing User",
					email: "existing@example.com",
					avatarUrl: null,
				}),
			});
		});

		// But no products
		await page.route("**/api/products", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ products: [] }),
				});
			} else {
				await route.continue();
			}
		});

		await page.goto("/");
		await expect(page).toHaveURL(/\/setup/);
	});
});
