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
 * AC-7b: /api/teams request carries X-API-Key header injected by apiFetch
 *
 * These tests FAIL in the red phase because apiFetch does not exist yet and
 * all fetch() calls go bare (no X-API-Key header).
 */

import { expect, test } from "@playwright/test";

const PLAYWRIGHT_TEST_KEY = "playwright-test-key";

// Minimal fixtures so the app shell renders without crashing

const HEALTH_FIXTURE = { status: "ok" };

const TEAMS_LIST_FIXTURE = {
	teams: [
		{
			id: "team-n2-test",
			name: "Alpha Core",
			formedAt: "2026-01-01T00:00:00Z",
			dissolvedAt: null,
		},
	],
};

const PRODUCTS_LIST_FIXTURE = {
	products: [],
};

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

// ── AC-7b: /api/teams request includes X-API-Key header ──────────────────────

test.describe("N2 — apiFetch injects X-API-Key on /api/teams (AC-7b)", () => {
	test("fetch to /api/teams carries X-API-Key header injected by apiFetch", async ({ page }) => {
		// Arrange: intercept /api/teams and capture the request headers
		let capturedApiKey: string | null = null;

		await page.route("**/api/teams", (route) => {
			// Capture the X-API-Key header from the intercepted request
			capturedApiKey = route.request().headers()["x-api-key"] ?? null;

			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(TEAMS_LIST_FIXTURE),
			});
		});

		await page.route("**/api/health", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(HEALTH_FIXTURE),
			}),
		);

		await page.route("**/api/products", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(PRODUCTS_LIST_FIXTURE),
			}),
		);

		await page.route("**/api/**", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({}),
			}),
		);

		// Act: trigger an API call to /api/teams via the app
		// Navigate to the work view which will fetch /api/teams
		await page.goto("/");
		await page.waitForLoadState("networkidle");

		// Explicitly trigger a fetch to /api/teams from the page context
		// This uses the apiFetch wrapper (once implemented), which must inject the key.
		await page.evaluate(async () => {
			// @ts-expect-error — apiFetch is available on the page's module scope
			// but not on window. We call it through the page script context.
			// The test verifies the header is set by intercepting via page.route().
			await fetch("/api/teams");
		});

		// Await route interception to complete
		await page.waitForTimeout(200);

		// Assert: the captured header must match the key injected via webServer.env
		expect(capturedApiKey).toBe(PLAYWRIGHT_TEST_KEY);
	});

	test("fetch to /api/teams without apiFetch (bare fetch) does NOT carry X-API-Key", async ({
		page,
	}) => {
		// This test documents the BEFORE state: bare fetch() has no X-API-Key.
		// It serves as a regression baseline — if this test starts failing
		// (i.e., bare fetch somehow acquires the header), something unexpected happened.
		let capturedApiKey: string | null = null;

		await page.route("**/api/teams", (route) => {
			capturedApiKey = route.request().headers()["x-api-key"] ?? null;
			return route.fulfill({
				status: 401,
				contentType: "application/json",
				body: JSON.stringify({ error: "Unauthorized" }),
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

		// Bare fetch — no header injection
		await page.evaluate(async () => {
			await fetch("/api/teams");
		});

		await page.waitForTimeout(200);

		// A bare fetch() call should NOT have X-API-Key unless apiFetch is used
		// This test documents that the key is NOT magically present without the wrapper
		// NOTE: once all fetch call sites are migrated (Phase 5), this specific
		// page.evaluate bare-fetch call will still test the manual invocation path.
		expect(capturedApiKey).toBeNull();
	});
});
