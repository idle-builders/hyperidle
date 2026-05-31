/**
 * M4 — Regression-blocking e2e suite: mock-data purge (AC-3).
 *
 * Three assertion categories per AC-3:
 *  (a) DOM sweep for forbidden literals on all production paths
 *  (b) Rail cost values match API-seeded data, not old MOCK_RAIL_COST constants
 *  (c) Settings panel reflects logged-in user from /api/settings, not hardcoded mock
 *
 * These tests FAIL against pre-Track-M code because:
 *  - (a) The DOM sweep finds "u-founder" from DEMO_FOUNDER_ID, "agent-unassigned"
 *    from PLACEHOLDER_AGENT_PARTICIPANT_ID, and "founder@hyperidle.com" from
 *    DEFAULT_SETTINGS before M3 wired real API calls.
 *  - (b) Before M3, Rail rendered MOCK_RAIL_COST.todaySpend.minor = 1240 ($12.40)
 *    directly; this test asserts that "$12.40" is absent and the override value
 *    "$7.50" is present instead.
 *  - (c) Before M3, SettingsPanel used DEFAULT_SETTINGS with name "Founder" and
 *    email "founder@hyperidle.com"; this test asserts "Alice Builder" is visible
 *    from the API override.
 *
 * @lore M4 W2 (architecture-critique): The settings panel e2e selectors
 * (getByLabel("Name"), getByLabel("Email")) were verified against the actual
 * SettingsPanel component in SettingsPanel.test.tsx line 74 — the profile tab
 * uses form inputs with those exact accessible labels. Safe to use here.
 *
 * @lore M4 W4 (architecture-critique): MOCK_RAIL_COST values verified from git
 * history (commit 78d30f6, packages/web/src/fixtures/app-shell-data.ts):
 *   todaySpend: { minor: 1240, currency: "USD" }  → $12.40
 *   weekSpend:  { minor: 8420, currency: "USD" }  → $84.20
 * The test asserts these values are absent and override values are shown.
 */

import { expect, test } from "./fixtures";

// Forbidden literal strings that must NEVER appear in rendered page text
const FORBIDDEN_LITERALS = ["u-founder", "agent-unassigned", "founder@hyperidle.com"];

// Production paths to sweep per AC-3a
const PRODUCTION_PATHS = ["/", "/work", "/work/portfolio", "/conversations", "/knowledge"];

// The old MOCK_RAIL_COST values (from commit 78d30f6, deleted in M3):
//   todaySpend: { minor: 1240, currency: "USD" } → formats as "$12.40"
//   weekSpend:  { minor: 8420, currency: "USD" } → formats as "$84.20"
const OLD_MOCK_TODAY_SPEND_FORMATTED = "$12.40";
const OLD_MOCK_WEEK_SPEND_FORMATTED = "$84.20";

// Override rail with known distinct values to prove the render path uses the API
const OVERRIDE_RAIL = {
	bets: [
		{ id: "b1", title: "M4 Test Bet", status: "in_progress", progress: { done: 1, total: 2 } },
	],
	blockers: [],
	awaitingOrdering: [],
	costBurnRate: {
		todaySpend: { minor: 750, currency: "USD" }, // → $7.50 (not $12.40)
		todayCap: { minor: 10000, currency: "USD" },
		weekSpend: { minor: 3500, currency: "USD" }, // → $35.00 (not $84.20)
		weekCap: { minor: 50000, currency: "USD" },
		weekTokens: 98765,
	},
};

// Override settings with a custom profile to prove the panel reads from API
const OVERRIDE_SETTINGS = {
	profile: { name: "Alice Builder", email: "alice@example.com", avatarUrl: null },
	teams: [],
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

// ---------------------------------------------------------------------------
// AC-3a: DOM literal sweep
// ---------------------------------------------------------------------------

test.describe("M4 AC-3a — DOM literal sweep: no forbidden strings on production paths", () => {
	for (const path of PRODUCTION_PATHS) {
		test(`no forbidden literals on ${path}`, async ({ page }) => {
			await page.goto(path);
			await page.waitForSelector("[data-testid='main-content']");
			const text = await page.evaluate(() => document.body.innerText);
			for (const literal of FORBIDDEN_LITERALS) {
				expect(
					text,
					`Forbidden literal "${literal}" found on path "${path}". ` +
						"This indicates a hardcoded mock-data string is leaking into the rendered page.",
				).not.toContain(literal);
			}
		});
	}
});

// ---------------------------------------------------------------------------
// AC-3b: Rail cost values match API response
// ---------------------------------------------------------------------------

test.describe("M4 AC-3b — Rail cost values match API response, not old MOCK_RAIL_COST", () => {
	test("rail renders today spend from API override, not old $12.40 mock value", async ({
		page,
	}) => {
		// Register override BEFORE the page loads — auto fixtures registered in
		// fixtures.ts are fallbacks; this route takes precedence (LIFO matching).
		await page.route("**/api/rail", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(OVERRIDE_RAIL),
			});
		});

		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		// The override today spend ($7.50) must appear
		await expect(
			page.getByText("$7.50"),
			"Override today spend ($7.50) must be visible in the Rail cost display.",
		).toBeVisible();

		// The old MOCK_RAIL_COST today spend ($12.40) must be absent
		await expect(
			page.getByText(OLD_MOCK_TODAY_SPEND_FORMATTED),
			`Old MOCK_RAIL_COST today spend (${OLD_MOCK_TODAY_SPEND_FORMATTED}) must NOT appear. ` +
				"If it does, Rail is rendering from a hardcoded constant, not the API.",
		).toHaveCount(0);
	});

	test("rail renders week spend from API override, not old $84.20 mock value", async ({ page }) => {
		await page.route("**/api/rail", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(OVERRIDE_RAIL),
			});
		});

		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		// The override week spend ($35.00) must appear
		await expect(
			page.getByText("$35.00"),
			"Override week spend ($35.00) must be visible in the Rail cost display.",
		).toBeVisible();

		// The old MOCK_RAIL_COST week spend ($84.20) must be absent
		await expect(
			page.getByText(OLD_MOCK_WEEK_SPEND_FORMATTED),
			`Old MOCK_RAIL_COST week spend (${OLD_MOCK_WEEK_SPEND_FORMATTED}) must NOT appear. ` +
				"If it does, Rail is rendering from a hardcoded constant, not the API.",
		).toHaveCount(0);
	});

	test("rail bet title matches API override, not hardcoded mock titles", async ({ page }) => {
		await page.route("**/api/rail", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(OVERRIDE_RAIL),
			});
		});

		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		// The override bet title must be visible
		await expect(page.getByText("M4 Test Bet")).toBeVisible();

		// Old MOCK_RAIL_BETS titles must NOT appear (they were "User auth flow" and
		// "Dashboard redesign" from the deleted fixtures/app-shell-data.ts)
		await expect(page.getByText("User auth flow")).toHaveCount(0);
		await expect(page.getByText("Dashboard redesign")).toHaveCount(0);
	});
});

// ---------------------------------------------------------------------------
// AC-3c: Settings panel reflects logged-in user
// ---------------------------------------------------------------------------

test.describe("M4 AC-3c — Settings panel reflects logged-in user profile", () => {
	test("settings panel shows name from API override, not hardcoded Founder", async ({ page }) => {
		// Override settings BEFORE the page loads
		await page.route("**/api/settings", async (route) => {
			const method = route.request().method();
			if (method === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(OVERRIDE_SETTINGS),
				});
			} else if (method === "PATCH") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(OVERRIDE_SETTINGS),
				});
			} else {
				await route.continue();
			}
		});

		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		// Open settings panel
		await page.getByRole("button", { name: /^user profile$/i }).click();
		await expect(page.getByRole("dialog", { name: /settings/i })).toBeVisible();

		// Profile tab must show the API-provided name, not any hardcoded mock
		await expect(
			page.getByLabel("Name"),
			"Settings profile Name input must show API-provided name 'Alice Builder'.",
		).toHaveValue("Alice Builder");

		// Old DEFAULT_SETTINGS had name "Founder" — it must not appear
		await expect(
			page.getByLabel("Name"),
			"Settings profile Name must NOT be the old hardcoded 'Founder' mock.",
		).not.toHaveValue("Founder");
	});

	test("settings panel shows email from API override, not founder@hyperidle.com", async ({
		page,
	}) => {
		await page.route("**/api/settings", async (route) => {
			const method = route.request().method();
			if (method === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(OVERRIDE_SETTINGS),
				});
			} else if (method === "PATCH") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(OVERRIDE_SETTINGS),
				});
			} else {
				await route.continue();
			}
		});

		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");
		await page.getByRole("button", { name: /^user profile$/i }).click();
		await expect(page.getByRole("dialog", { name: /settings/i })).toBeVisible();

		// Must show the override email, not the old hardcoded forbidden literal
		await expect(page.getByLabel("Email")).toHaveValue("alice@example.com");
		await expect(page.getByLabel("Email")).not.toHaveValue("founder@hyperidle.com");
	});

	test("settings panel does not contain 'u-founder' anywhere in DOM", async ({ page }) => {
		await page.route("**/api/settings", async (route) => {
			const method = route.request().method();
			if (method === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(OVERRIDE_SETTINGS),
				});
			} else {
				await route.continue();
			}
		});

		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");
		await page.getByRole("button", { name: /^user profile$/i }).click();
		await expect(page.getByRole("dialog", { name: /settings/i })).toBeVisible();

		const dialogText = await page
			.getByRole("dialog", { name: /settings/i })
			.evaluate((el) => el.textContent ?? "");

		expect(
			dialogText,
			"Settings dialog must not contain the forbidden literal 'u-founder'.",
		).not.toContain("u-founder");
	});
});
