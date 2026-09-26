/**
 * Real-browser check: apiFetch injects X-API-Key on every action-door
 * request the app makes.
 *
 * The key is injected into the Vite dev server via webServer.env in
 * playwright.config.ts: VITE_HYPERIDLE_API_KEY="playwright-test-key".
 * apiFetch reads this from import.meta.env and injects it as X-API-Key.
 */

import { expect, test } from "./fixtures";

const PLAYWRIGHT_TEST_KEY = "playwright-test-key";

const HEALTH_FIXTURE = { status: "ok" };
const SEARCH_USERS_FIXTURE = { ok: true, data: [] };

test("navigating the app carries X-API-Key on every action-door request", async ({ page }) => {
	// @lore Playwright evaluates route handlers in REVERSE registration order
	// (last-registered wins / LIFO); register the catch-all/default route
	// FIRST and specific overrides AFTER so the specific one wins.
	let capturedApiKey: string | null = null;

	await page.route("**/api/**", (route) => {
		const url = route.request().url();
		const key = route.request().headers()["x-api-key"] ?? null;

		if (url.includes("/api/actions/search_users")) {
			capturedApiKey = key;
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(SEARCH_USERS_FIXTURE),
			});
		}
		if (url.includes("/api/health")) {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(HEALTH_FIXTURE),
			});
		}
		return route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({}),
		});
	});

	// WorkOverview calls useTeams() -> search_users({}) via apiFetch on mount.
	await page.goto("/work/portfolio");
	await page.waitForLoadState("networkidle");

	expect(capturedApiKey).toBe(PLAYWRIGHT_TEST_KEY);
});
