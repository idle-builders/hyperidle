/**
 * M4 — Regression-blocking e2e suite: mock-data purge (AC-3).
 *
 * Two assertion categories per AC-3:
 *  (a) DOM sweep for forbidden literals on all production paths
 *  (c) Settings panel reflects logged-in user from /api/settings, not hardcoded mock
 *
 * These tests FAIL against pre-Track-M code because:
 *  - (a) The DOM sweep finds "u-founder" from DEMO_FOUNDER_ID, "agent-unassigned"
 *    from PLACEHOLDER_AGENT_PARTICIPANT_ID, and "founder@hyperidle.com" from
 *    DEFAULT_SETTINGS before M3 wired real API calls.
 *  - (c) Before M3, SettingsPanel used DEFAULT_SETTINGS with name "Founder" and
 *    email "founder@hyperidle.com"; this test asserts "Alice Builder" is visible
 *    from the API override.
 *
 * @lore M4 W2 (architecture-critique): The settings panel e2e selectors
 * (getByLabel("Name"), getByLabel("Email")) were verified against the actual
 * SettingsPanel component in SettingsPanel.test.tsx line 74 — the profile tab
 * uses form inputs with those exact accessible labels. Safe to use here.
 *
 * @lore AD8a: AC-3b (Rail cost values from API) deleted — the Rail API and UI
 * @lore AD8a: historical — were removed in U6. The OVERRIDE_RAIL constant and /api/rail mock tests no
 * longer apply.
 */

import { expect, test } from "./fixtures";

// Forbidden literal strings that must NEVER appear in rendered page text
const FORBIDDEN_LITERALS = ["u-founder", "agent-unassigned", "founder@hyperidle.com"];

// Production paths to sweep per AC-3a
const PRODUCTION_PATHS = ["/", "/work", "/work/portfolio", "/conversations", "/documents"];

// Override settings with a custom profile to prove the panel reads from API
const OVERRIDE_SETTINGS = {
	profile: { name: "Alice Builder", avatarUrl: null },
	teams: [],
	users: [],
	notifications: {
		reviewAlerts: true,
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
