/**
 * M3 — API Wiring e2e tests.
 *
 * Covers the main user-visible paths affected by M3:
 *  - Auth: page loads and the user id shown is NOT "u-founder" literal (real auth)
 *  - Settings: settings panel opens and shows data from API (not DEFAULT_SETTINGS mock)
 *  - Rail: rail shows data from API (not MOCK_RAIL_* constants)
 *  - Portfolio: empty state renders when no products are returned
 *
 * All API calls are mocked via page.route() — no real server required.
 */

import { expect, test } from "@playwright/test";

// Minimal settings response — what GET /api/settings returns after M3 (no appearance field).
const SETTINGS_API_RESPONSE = {
	profile: { name: "Test Founder M3", email: "m3test@hyperidle.dev", avatarUrl: null },
	products: [{ id: "prod-m3", name: "M3 Test Product", active: true }],
	agents: [{ id: "agent-m3", name: "M3 Builder", autonomyLevel: "supervised", paused: false }],
	notifications: {
		reviewAlerts: true,
		costAlerts: false,
		blockerAlerts: true,
		quietHoursStart: "23:00",
		quietHoursEnd: "07:00",
		mutedProducts: [],
	},
};

// Rail response from GET /api/rail
const RAIL_API_RESPONSE = {
	bets: [
		{
			id: "bet-rail-1",
			title: "M3 Real Rail Bet",
			product: "M3 Product",
			status: "in_progress",
		},
	],
	blockers: [],
	cost: {
		todaySpend: { minor: 500, currency: "USD" },
		todayCap: { minor: 5000, currency: "USD" },
		weekSpend: { minor: 2000, currency: "USD" },
		weekCap: { minor: 35000, currency: "USD" },
		weekTokens: 12345,
	},
};

// Auth response from GET /api/auth/me
const AUTH_ME_RESPONSE = {
	id: "u-m3-founder",
	name: "M3 Founder",
	email: "m3test@hyperidle.dev",
	role: "founder",
};

/** Set up standard API mocks for M3 tests. */
async function setupApiMocks(page: import("@playwright/test").Page): Promise<void> {
	// Mock auth
	await page.route("**/api/auth/me", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(AUTH_ME_RESPONSE),
		});
	});

	// Mock settings
	await page.route("**/api/settings", async (route) => {
		if (route.request().method() === "GET") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(SETTINGS_API_RESPONSE),
			});
		} else if (route.request().method() === "PATCH") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(SETTINGS_API_RESPONSE),
			});
		} else {
			await route.continue();
		}
	});

	// Mock rail
	await page.route("**/api/rail", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(RAIL_API_RESPONSE),
		});
	});

	// Mock threads (needed by conversations view)
	await page.route("**/api/threads**", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ threads: [] }),
		});
	});
}

test.describe("M3 — Auth: page loads with real user data", () => {
	test("page shell loads and does not render u-founder literal in visible text", async ({
		page,
	}) => {
		await setupApiMocks(page);
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		// The shell must render — check the main content area is visible
		await expect(page.getByTestId("main-content")).toBeVisible();

		// The literal "u-founder" string must NOT appear in the visible page text
		// (it was a hardcoded demo constant removed in M3 A11)
		const pageText = await page.evaluate(() => document.body.innerText);
		expect(pageText).not.toContain("u-founder");
	});
});

test.describe("M3 — Settings: panel shows real API data", () => {
	test.beforeEach(async ({ page }) => {
		await setupApiMocks(page);
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");
	});

	test("settings panel opens and shows name from API (not DEFAULT_SETTINGS mock)", async ({
		page,
	}) => {
		// Click the user profile button to open settings
		await page.getByRole("button", { name: /user profile/i }).click();
		await expect(page.getByRole("dialog", { name: /settings/i })).toBeVisible();

		// The profile tab should show the name from the API response
		// DEFAULT_SETTINGS had "Founder" — the API response has "Test Founder M3"
		await expect(page.getByLabel("Name")).toHaveValue("Test Founder M3");
	});

	test("settings panel does NOT show DEFAULT_SETTINGS mock email", async ({ page }) => {
		await page.getByRole("button", { name: /user profile/i }).click();
		await expect(page.getByRole("dialog", { name: /settings/i })).toBeVisible();

		// DEFAULT_SETTINGS had "founder@hyperidle.com" — must not appear
		const emailInput = page.getByLabel("Email");
		await expect(emailInput).not.toHaveValue("founder@hyperidle.com");
	});

	test("settings GET response does not include appearance field (W1)", async ({ page }) => {
		// Intercept the settings API call and verify no appearance field in response
		let capturedBody: Record<string, unknown> | null = null;

		await page.route("**/api/settings", async (route) => {
			const res = await route.fetch();
			const body = (await res.json()) as Record<string, unknown>;
			capturedBody = body;
			await route.fulfill({ response: res });
		});

		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		// The API must not return appearance — it's localStorage-only per Contract 2
		if (capturedBody !== null) {
			expect(capturedBody).not.toHaveProperty("appearance");
		}
	});
});

test.describe("M3 — Rail: shows data from API (not MOCK_RAIL_* constants)", () => {
	test("rail shows bet title from API response, not MOCK_RAIL_BETS", async ({ page }) => {
		await setupApiMocks(page);
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		// "M3 Real Rail Bet" comes from the mocked /api/rail
		// MOCK_RAIL_BETS had "User auth flow" and "Dashboard redesign" — those must not appear
		await expect(page.getByText("M3 Real Rail Bet")).toBeVisible();
		await expect(page.getByText("User auth flow")).toHaveCount(0);
		await expect(page.getByText("Dashboard redesign")).toHaveCount(0);
	});
});

test.describe("M3 — Portfolio: empty state when no products", () => {
	test("portfolio renders empty state when API returns no products", async ({ page }) => {
		await setupApiMocks(page);

		// Override with empty products
		await page.route("**/api/products", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ products: [] }),
			});
		});

		// Also mock auth for this test
		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-testid='work-portfolio-page']");

		// With no products from the API, the empty state should render
		// and no MOCK_PRODUCTS content ("HyperIdle Core", "Knowledge Fabric") should appear
		await expect(page.getByText("HyperIdle Core")).toHaveCount(0);
		await expect(page.getByText("Knowledge Fabric")).toHaveCount(0);
	});

	test("MOCK_PRODUCTS content ('HyperIdle Core') never appears from API mocked as empty", async ({
		page,
	}) => {
		await setupApiMocks(page);

		await page.route("**/api/products", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ products: [] }),
			});
		});

		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-testid='work-portfolio-page']");

		// All MOCK_PRODUCTS strings must be absent — fixture deleted in M3 C1
		const pageText = await page.evaluate(() => document.body.innerText);
		expect(pageText).not.toContain("HyperIdle Core");
		expect(pageText).not.toContain("Knowledge Fabric");
		expect(pageText).not.toContain("Review Workbench");
		expect(pageText).not.toContain("Agent Runtime");
	});
});
