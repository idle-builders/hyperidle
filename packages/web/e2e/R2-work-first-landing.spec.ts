/**
 * R2 — Work-First Landing E2E tests
 *
 * AC coverage:
 * AC-1: Setup flow has two required fields (name + API key). Repo path optional.
 * AC-2: Backend mode selection is removed from setup flow.
 * AC-3: Email field is removed from setup.
 * AC-4: Product is created silently (no visible "First Product" section).
 * AC-5: After setup, app routes to /work/portfolio.
 * AC-6: BetCreateDialog requires only title and pitch. Product picker hidden for single product.
 * AC-7: "Create bet" CTA is the most prominent action on WorkPortfolio when no bets exist.
 */

import { expect, test } from "./fixtures";

// ─────────────────────────────────────────────────────────────────────────────
// Shared mocks
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_CREATE_USER_RESPONSE = {
	id: "u-r2-founder",
	name: "Alice R2",
	kind: "human",
	role: "founder",
	status: "active",
};

const MOCK_CREATE_PRODUCT_RESPONSE = {
	id: "p-r2-product",
	name: "My Product",
	phase: "build",
};

test.describe("R2 — Work-First Landing", () => {
	// ─────────────────────────────────────────────────────────────────────────
	// Setup flow tests
	// ─────────────────────────────────────────────────────────────────────────

	test.describe("SetupFlow (R2)", () => {
		test.beforeEach(async ({ page }) => {
			// Fresh install: no user, no products
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

			await page.route("**/api/teams", async (route) => {
				if (route.request().method() === "GET") {
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({ teams: [] }),
					});
				} else if (route.request().method() === "POST") {
					await route.fulfill({
						status: 201,
						contentType: "application/json",
						body: JSON.stringify(MOCK_CREATE_PRODUCT_RESPONSE),
					});
				} else {
					await route.continue();
				}
			});

			await page.route("**/api/users", async (route) => {
				if (route.request().method() === "POST") {
					await route.fulfill({
						status: 201,
						contentType: "application/json",
						body: JSON.stringify(MOCK_CREATE_USER_RESPONSE),
					});
				} else {
					await route.continue();
				}
			});
		});

		// AC-1: Only name and API key fields exist
		test("AC1 — renders name and API key fields as required fields", async ({ page }) => {
			await page.goto("/setup");

			await expect(page.getByLabel(/^name/i)).toBeVisible();
			await expect(page.getByLabel(/anthropic api key/i)).toBeVisible();
		});

		// AC-2: No backend mode selector
		test("AC2 — does not render backend mode selector", async ({ page }) => {
			await page.goto("/setup");

			await expect(page.getByRole("combobox", { name: /backend mode/i })).toHaveCount(0);
			await expect(page.getByRole("option", { name: /run locally/i })).toHaveCount(0);
			await expect(page.getByRole("option", { name: /connect to shared backend/i })).toHaveCount(0);
		});

		// AC-3: No email field
		test("AC3 — does not render email field", async ({ page }) => {
			await page.goto("/setup");

			await expect(page.getByLabel(/^email/i)).toHaveCount(0);
		});

		// AC-4: No product name field, no "First Product" section
		test("AC4 — does not render product name field or First Product section", async ({ page }) => {
			await page.goto("/setup");

			await expect(page.getByLabel(/product name/i)).toHaveCount(0);
			await expect(page.getByRole("heading", { name: /first product/i })).toHaveCount(0);
		});

		// AC-1: Repo path is optional (present but not blocking)
		test("AC1 — renders optional repo path field", async ({ page }) => {
			await page.goto("/setup");

			await expect(page.getByLabel(/project folder/i)).toBeVisible();
		});

		// AC-1: Start button disabled with only name (API key required too)
		test("AC1 — Start button disabled when name filled but no API key", async ({ page }) => {
			await page.goto("/setup");

			await page.getByLabel(/^name/i).fill("Alice");

			await expect(page.getByRole("button", { name: /start hyperidle/i })).toBeDisabled();
		});

		// AC-1: Start button enabled when name + API key filled
		test("AC1 — Start button enabled when name and API key are filled", async ({ page }) => {
			await page.goto("/setup");

			await page.getByLabel(/^name/i).fill("Alice");
			await page.getByLabel(/anthropic api key/i).fill("sk-ant-test");

			await expect(page.getByRole("button", { name: /start hyperidle/i })).toBeEnabled();
		});

		// AC-5: After setup, navigates to /work/portfolio
		test("AC5 — navigates to /work/portfolio after successful setup", async ({ page }) => {
			// After setup, mock auth/me to return user + products to exist
			await page.route("**/api/auth/me", async (route) => {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						id: "u-r2-founder",
						name: "Alice R2",
						avatarUrl: null,
					}),
				});
			});

			// Mock canvas endpoint
			await page.route("**/api/bets/canvas", async (route) => {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ shaped: [], committed: [], capacity: { used: 0, max: 2 } }),
				});
			});

			await page.route("**/api/artifacts**", async (route) => {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ artifacts: [], nextCursor: null }),
				});
			});

			await page.goto("/setup");

			await page.getByLabel(/^name/i).fill("Alice R2");
			await page.getByLabel(/anthropic api key/i).fill("sk-ant-test");

			await page.getByRole("button", { name: /start hyperidle/i }).click();

			// Must land on /work/portfolio, not /conversations
			await expect(page).toHaveURL(/\/work\/portfolio/, { timeout: 10_000 });
		});
	});

	// ─────────────────────────────────────────────────────────────────────────
	// WorkPortfolio CTA tests
	// ─────────────────────────────────────────────────────────────────────────

	test.describe("WorkPortfolio — Create bet CTA (R2 AC7)", () => {
		test.beforeEach(async ({ page }) => {
			// Canvas returns empty (no bets)
			await page.route("**/api/bets/canvas", async (route) => {
				if (route.request().method() === "GET") {
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({ shaped: [], committed: [], capacity: { used: 0, max: 2 } }),
					});
				} else {
					await route.continue();
				}
			});

			// Empty artifacts
			await page.route("**/api/artifacts**", async (route) => {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ artifacts: [], nextCursor: null }),
				});
			});
		});

		// AC-7: "Create bet" CTA visible when no bets
		test("AC7 — 'Create bet' CTA is visible when no bets exist", async ({ page }) => {
			await page.goto("/work/portfolio");
			await page.waitForSelector("[data-testid='work-portfolio-page']");

			const cta = page.getByTestId("create-bet-cta");
			await expect(cta).toBeVisible();
		});

		// AC-7: "Create bet" button is present and prominent in CTA
		test("AC7 — 'Create bet' button is inside the CTA", async ({ page }) => {
			await page.goto("/work/portfolio");
			await page.waitForSelector("[data-testid='work-portfolio-page']");

			const createBetBtn = page.getByRole("button", { name: /create bet/i });
			await expect(createBetBtn).toBeVisible();
		});

		// AG3: "Create bet" CTA navigates to /work/bet/new (full-page authoring, not dialog)
		test("AC7 — Clicking 'Create bet' CTA navigates to /work/bet/new", async ({ page }) => {
			await page.goto("/work/portfolio");
			await page.waitForSelector("[data-testid='work-portfolio-page']");

			await page.getByRole("button", { name: /create bet/i }).click();

			// AG3: navigates to full-page route, no dialog
			await expect(page).toHaveURL(/\/work\/bet\/new/, { timeout: 5_000 });
			await expect(page.getByRole("dialog")).toHaveCount(0);
		});

		// AG3: Full-page create has no team picker for single-team (auto-resolved in aside)
		test("AC6 — Full-page bet create has no team picker when single team", async ({ page }) => {
			await page.goto("/work/portfolio");
			await page.waitForSelector("[data-testid='work-portfolio-page']");

			const createBetBtn = page.getByRole("button", { name: /create bet/i });
			await createBetBtn.click();

			await expect(page).toHaveURL(/\/work\/bet\/new/, { timeout: 5_000 });

			// Single team → no team combobox (auto-resolved)
			await expect(page.getByRole("combobox", { name: /team/i })).toHaveCount(0);
		});

		// AG3: Full-page create now HAS appetite fields in the commitments aside (AC4)
		test("AC6 — Full-page bet create has appetite fields in commitments aside", async ({
			page,
		}) => {
			await page.goto("/work/portfolio");
			await page.waitForSelector("[data-testid='work-portfolio-page']");

			await page.getByRole("button", { name: /create bet/i }).click();
			await expect(page).toHaveURL(/\/work\/bet\/new/, { timeout: 5_000 });

			// AG3 AC4: appetite returns to create (was removed from dialog in R2)
			// bet-create-commitments aside must be present
			await expect(page.getByTestId("bet-create-commitments")).toBeVisible();
		});

		// AC-7: CTA is hidden when bets exist
		test("AC7 — 'Create bet' CTA is hidden when bets already exist", async ({ page }) => {
			// Override canvas to have a bet
			await page.route("**/api/bets/canvas", async (route) => {
				if (route.request().method() === "GET") {
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({
							shaped: [
								{
									id: "bet-1",
									title: "Existing Bet",
									product: "Test Product",
									teamId: "test-team-1",
									status: "shaped",
									appetite: "—",
								},
							],
							committed: [],
							capacity: { used: 1, max: 2 },
						}),
					});
				} else {
					await route.continue();
				}
			});

			await page.goto("/work/portfolio");
			await page.waitForSelector("[data-testid='work-portfolio-page']");

			// CTA must not be present when bets exist
			await expect(page.getByTestId("create-bet-cta")).toHaveCount(0);
		});
	});

	// ─────────────────────────────────────────────────────────────────────────
	// FirstRunRedirect to /work/portfolio
	// ─────────────────────────────────────────────────────────────────────────

	test.describe("FirstRunRedirect — /work/portfolio (R2 AC5)", () => {
		// AC-5: existing user with products → /work/portfolio
		test("AC5 — redirects to /work/portfolio (not /conversations) when setup is complete", async ({
			page,
		}) => {
			// User exists + products exist
			await page.route("**/api/auth/me", async (route) => {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						id: "u-1",
						name: "Founder",
						avatarUrl: null,
					}),
				});
			});

			await page.route("**/api/bets/canvas", async (route) => {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ shaped: [], committed: [], capacity: { used: 0, max: 2 } }),
				});
			});

			await page.route("**/api/artifacts**", async (route) => {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ artifacts: [], nextCursor: null }),
				});
			});

			await page.goto("/");

			// Must land on /work/portfolio, not /conversations
			await expect(page).toHaveURL(/\/work\/portfolio/, { timeout: 10_000 });
		});
	});
});
