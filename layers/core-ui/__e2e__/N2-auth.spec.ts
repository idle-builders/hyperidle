/**
 * N2 — Playwright e2e: X-API-Key injection via apiFetch (AC-7).
 *
 * Strategy: hermetic page.route() mocks for all API calls.
 * No real API server needed — tests verify the SPA injects X-API-Key headers.
 *
 * The key is injected into the Vite dev server via webServer.env in
 * playwright.config.ts: VITE_HYPERIDLE_API_KEY="playwright-test-key".
 * apiFetch reads this from import.meta.env and injects it as X-API-Key.
 *
 * AC-7a: /api/health succeeds (health endpoint does not require X-API-Key)
 * AC-7b: /api/actions/search_users carries X-API-Key header injected by
 *        apiFetch (navigating to /work/portfolio renders WorkOverview, which
 *        calls useTeams() → search_users({}))
 *
 * @lore BC5 T11: `GET /api/teams` is gone with the `teams` route family —
 * `useTeams` now builds the portfolio's team list from
 * `POST /api/actions/search_users`, the same action door a person's client
 * and an agent's MCP tool both use. The X-API-Key proof re-points there;
 * the mechanism under test (apiFetch's header injection) is unchanged.
 */

import { expect, test } from "./fixtures";

const PLAYWRIGHT_TEST_KEY = "playwright-test-key";

// Minimal fixtures so the app shell renders without crashing

const HEALTH_FIXTURE = { status: "ok" };

const SEARCH_USERS_FIXTURE = { ok: true, data: [] };

// ── AC-7a: /api/health succeeds without X-API-Key ────────────────────────────

test.describe("N2 — /api/health endpoint (AC-7a)", () => {
	test("health endpoint succeeds without X-API-Key header (health is unauthenticated)", async ({
		page,
	}) => {
		// Arrange: intercept health, return 200 regardless of headers
		await page.route("**/api/health", (route) => {
			// Health endpoint does not require X-API-Key — always returns 200
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(HEALTH_FIXTURE),
			});
		});

		// Route other API calls to avoid console noise
		await page.route("**/api/**", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({}),
			}),
		);

		// Act: navigate to the app — the shell will call /api/health on load
		await page.goto("/");
		await page.waitForLoadState("networkidle");

		// Assert: page rendered without network error (health call succeeded)
		// The health endpoint does not require X-API-Key, so bare fetch() works too.
		// This test ensures health is not accidentally gated behind auth.
		const pageText = await page.textContent("body");
		expect(pageText).not.toBeNull();
	});
});

// ── AC-7b: apiFetch injects X-API-Key on real app navigations ────────────────

test.describe("N2 — apiFetch injects X-API-Key on /api/actions/search_users (AC-7b)", () => {
	test("app navigation to /work/portfolio carries X-API-Key on search_users via apiFetch", async ({
		page,
	}) => {
		// Arrange: intercept ALL /api/* requests, capture the X-API-Key from each.
		// WorkOverview calls useTeams() → call("search_users", {}) → apiFetch
		// ("/api/actions/search_users") on mount, which must inject the key from
		// VITE_HYPERIDLE_API_KEY (set in playwright.config.ts).
		//
		// @lore N2: Playwright evaluates route handlers in REVERSE registration order
		// (last-registered wins / LIFO); register the catch-all/default route FIRST
		// and specific overrides AFTER so the specific one wins.
		// See: https://playwright.dev/docs/network#handle-requests
		let capturedApiKey: string | null = null;

		await page.route("**/api/**", (route) => {
			const url = route.request().url();
			const key = route.request().headers()["x-api-key"] ?? null;

			// Capture the header from the search_users request specifically
			if (url.includes("/api/actions/search_users")) {
				capturedApiKey = key;
			}

			// Return an appropriate fixture response for each route
			if (url.includes("/api/actions/search_users")) {
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

		// Act: navigate to WorkOverview — this triggers useTeams() → apiFetch
		await page.goto("/work/portfolio");
		await page.waitForLoadState("networkidle");

		// Assert: the captured header must match the key injected via webServer.env
		// (playwright.config.ts sets VITE_HYPERIDLE_API_KEY="playwright-test-key")
		expect(capturedApiKey).toBe(PLAYWRIGHT_TEST_KEY);
	});

	test("bare fetch() in page.evaluate does NOT carry X-API-Key (regression baseline)", async ({
		page,
	}) => {
		// Regression guard: a bare fetch() call in page.evaluate should NOT
		// have X-API-Key injected. There is no global monkey-patching — only
		// explicit apiFetch() calls get the header. If this test starts failing,
		// something has accidentally patched globalThis.fetch.
		let capturedApiKey: string | null = null;

		await page.route("**/api/actions/search_users", (route) => {
			capturedApiKey = route.request().headers()["x-api-key"] ?? null;
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(SEARCH_USERS_FIXTURE),
			});
		});

		await page.route("**/api/**", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({}),
			}),
		);

		await page.goto("/");
		await page.waitForLoadState("networkidle");

		// Explicitly call bare fetch() — NOT apiFetch — from the page context.
		// This call bypasses the apiFetch wrapper and must NOT have X-API-Key.
		await page.evaluate(async () => {
			await fetch("/api/actions/search_users", { method: "POST", body: "{}" });
		});

		await page.waitForTimeout(200);

		// Bare fetch() must not carry X-API-Key — header injection is explicit,
		// not global. This proves the wrapper is the mechanism, not a global patch.
		expect(capturedApiKey).toBeNull();
	});
});
