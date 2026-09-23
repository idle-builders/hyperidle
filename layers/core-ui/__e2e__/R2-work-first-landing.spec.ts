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

import { expect, makeUserRow, mockSearchUsers, mockUser, test } from "./fixtures";

// ─────────────────────────────────────────────────────────────────────────────
// Shared mocks
// ─────────────────────────────────────────────────────────────────────────────

// @lore BC5 T10: `GET /api/auth/me`, `GET/POST /api/teams` and `POST
// /api/users` are gone — the welcome screen calls `edit_user` (new person +
// team name) then `edit_user` (new agent), both through the fixtures.ts
// auto-use `open_user({})` default plus these per-test overrides.
const CREATED_FOUNDER_ROW = makeUserRow("u-r2-founder", {
	name: "Alice R2",
	role: "founder",
	team: { id: "p-r2-product", name: "My Product" },
});

test.describe("R2 — Work-First Landing", () => {
	// ─────────────────────────────────────────────────────────────────────────
	// Setup flow tests
	// ─────────────────────────────────────────────────────────────────────────

	test.describe("SetupFlow (R2)", () => {
		test.beforeEach(async ({ page }) => {
			// Fresh install: open_user({}) answers "no row yet" — the welcome
			// screen's own first-run shape.
			await page.route("**/api/actions/open_user", async (route) => {
				const input = JSON.parse(route.request().postData() ?? "{}") as { id?: string };
				if (input.id !== undefined) {
					await route.fallback();
					return;
				}
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						ok: true,
						data: {
							user: null,
							runsOn: [],
							runConfig: null,
							documentIds: [],
							folders: [],
							subscriptions: [],
							connections: null,
							behaviour: null,
							inbox: null,
							reviewTrackRecord: null,
						},
					}),
				});
			});
			await page.route("**/api/actions/edit_user", async (route) => {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						ok: true,
						data: {
							user: CREATED_FOUNDER_ROW,
							runsOn: [],
							runConfig: null,
							documentIds: [],
							folders: [],
							subscriptions: [],
							connections: null,
							behaviour: null,
							inbox: null,
							reviewTrackRecord: null,
						},
					}),
				});
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
			// After setup, the team page's own reads resolve to the created founder.
			await mockUser(page, { row: CREATED_FOUNDER_ROW, self: true });
			await mockSearchUsers(page, { rows: [CREATED_FOUNDER_ROW] });

			// Mock canvas endpoint

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

	// ─────────────────────────────────────────────────────────────────────────
	// FirstRunRedirect to /work/portfolio
	// ─────────────────────────────────────────────────────────────────────────

	test.describe("FirstRunRedirect — /work/portfolio (R2 AC5)", () => {
		// AC-5: existing user with products → /work/portfolio
		test("AC5 — redirects to /work/portfolio (not /conversations) when setup is complete", async ({
			page,
		}) => {
			// User exists + a team exists (every human is in one).
			const founderRow = makeUserRow("u-1", { name: "Founder", team: { id: "t-1", name: "Team" } });
			await mockUser(page, { row: founderRow, self: true });
			await mockSearchUsers(page, { rows: [founderRow] });

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
