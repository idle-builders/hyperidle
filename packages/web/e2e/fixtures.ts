/**
 * Shared Playwright test fixtures for HyperIdle e2e tests.
 *
 * @lore M3: M3 wired real API calls for /api/auth/me, /api/settings, /api/rail,
 * /api/threads, and /api/products. Every page load now makes these requests. In
 * CI there is no backend server — only Vite serves the SPA bundle. Without mocks
 * every test would get ECONNREFUSED on the proxied /api/* calls.
 *
 * This file extends Playwright's `test` with an auto-use fixture that intercepts
 * the five core M3 endpoints before every test. Individual tests can register
 * their own page.route() calls to override specific endpoints — Playwright's LIFO
 * route matching means the last-registered handler wins for the same pattern.
 *
 * Usage:
 *   import { expect, test } from "./fixtures";
 *   // or for re-exports:
 *   export { expect } from "./fixtures";
 *
 * All spec files import from "./fixtures" instead of "@playwright/test".
 */

import { test as base, expect } from "@playwright/test";

/** Default mock response for GET /api/auth/me */
const DEFAULT_AUTH_ME = {
	id: "test-founder",
	name: "Test Founder",
	email: "test@hyperidle.dev",
	role: "founder",
	avatarUrl: null,
};

/** Default mock response for GET /api/settings */
const DEFAULT_SETTINGS = {
	profile: { name: "Test Founder", email: "test@hyperidle.dev", avatarUrl: null },
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

/** Default mock response for GET /api/rail */
const DEFAULT_RAIL = {
	bets: [],
	blockers: [],
	awaitingOrdering: [],
	costBurnRate: {
		todaySpend: null,
		todayCap: null,
		weekSpend: null,
		weekCap: null,
		weekTokens: null,
	},
};

/** Default mock response for GET /api/threads (list) */
const DEFAULT_THREADS = { threads: [] };

/** Default mock response for GET /api/products */
const DEFAULT_PRODUCTS = {
	products: [
		{
			id: "test-product-1",
			name: "Test Product",
			phase: "build",
			status: "healthy",
			leadAgentId: "test-agent-1",
			activeBets: 0,
			shipped: 0,
			shipRate: "—",
			progress: { done: 0, total: 0 },
		},
	],
};

type CoreApiFixtures = {
	/** Auto-use fixture: registers default M3 API mocks before every test. */
	_coreApiMocks: void;
};

/**
 * Extended test with auto-use core API mocks.
 *
 * Registers low-priority fallback handlers for the five M3 core endpoints.
 * Individual tests may register their own page.route() calls — Playwright's
 * LIFO matching ensures test-specific routes win over these defaults.
 */
export const test = base.extend<CoreApiFixtures>({
	_coreApiMocks: [
		async ({ page }, use) => {
			// Register default handlers before the test body runs.
			// These are fallbacks — test-specific route registrations take precedence
			// because Playwright matches routes LIFO (last registered first matched).

			// GET /api/auth/me — identity for useCurrentUser hook
			await page.route("**/api/auth/me", async (route) => {
				if (route.request().method() === "GET") {
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify(DEFAULT_AUTH_ME),
					});
				} else {
					await route.continue();
				}
			});

			// GET /api/settings — app-wide settings for useSettings hook
			await page.route("**/api/settings", async (route) => {
				const method = route.request().method();
				if (method === "GET") {
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify(DEFAULT_SETTINGS),
					});
				} else if (method === "PATCH") {
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify(DEFAULT_SETTINGS),
					});
				} else {
					await route.continue();
				}
			});

			// GET /api/rail — rail data for useRail hook
			await page.route("**/api/rail", async (route) => {
				if (route.request().method() === "GET") {
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify(DEFAULT_RAIL),
					});
				} else {
					await route.continue();
				}
			});

			// GET /api/threads — thread list for conversations page
			// Uses a glob that matches /api/threads and /api/threads?cursor=...
			// but NOT /api/threads/:id (that has its own route in thread specs).
			await page.route("**/api/threads", async (route) => {
				if (route.request().method() === "GET") {
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify(DEFAULT_THREADS),
					});
				} else {
					await route.continue();
				}
			});

			// GET /api/products — product list for work portfolio
			await page.route("**/api/products", async (route) => {
				if (route.request().method() === "GET") {
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify(DEFAULT_PRODUCTS),
					});
				} else {
					await route.continue();
				}
			});

			// Run the test.
			await use();
		},
		{ auto: true },
	],
});

export { expect };

/**
 * Register core API mocks on a manually-created page (browser.newContext/newPage).
 * The auto-use fixture only covers the default `page` — tests that create their
 * own contexts must call this to get the same /api/* fallbacks.
 */
export async function registerCoreMocks(page: import("@playwright/test").Page): Promise<void> {
	await page.route("**/api/auth/me", async (route) => {
		if (route.request().method() === "GET") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(DEFAULT_AUTH_ME),
			});
		} else {
			await route.continue();
		}
	});
	await page.route("**/api/settings", async (route) => {
		const m = route.request().method();
		if (m === "GET" || m === "PATCH") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(DEFAULT_SETTINGS),
			});
		} else {
			await route.continue();
		}
	});
	await page.route("**/api/rail", async (route) => {
		if (route.request().method() === "GET") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(DEFAULT_RAIL),
			});
		} else {
			await route.continue();
		}
	});
	await page.route("**/api/threads", async (route) => {
		if (route.request().method() === "GET") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(DEFAULT_THREADS),
			});
		} else {
			await route.continue();
		}
	});
	await page.route("**/api/products", async (route) => {
		if (route.request().method() === "GET") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(DEFAULT_PRODUCTS),
			});
		} else {
			await route.continue();
		}
	});
}
