/**
 * Shared Playwright test fixtures for HyperIdle e2e tests.
 *
 * @lore M3: M3 wired real API calls for /api/auth/me, /api/settings,
 * /api/threads, and /api/teams. Every page load now makes these requests. In
 * CI there is no backend server — only Vite serves the SPA bundle. Without mocks
 * every test would get ECONNREFUSED on the proxied /api/* calls.
 *
 * @lore AD8a: /api/rail mock removed — the Rail API was deleted in U6 and the
 * route has been purged from the server. See packages/server/src/app.ts.
 *
 * This file extends Playwright's `test` with an auto-use fixture that intercepts
 * the core M3 endpoints before every test. Individual tests can register
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

import type { Route } from "@playwright/test";
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

/** Default mock response for GET /api/threads (list) */
const DEFAULT_THREADS = { threads: [] };

/** Default mock response for GET /api/teams */
const DEFAULT_TEAMS = {
	teams: [
		{
			id: "test-team-1",
			name: "Test Team",
			phase: "build",
			active: true,
			status: "healthy",
			activeBets: 0,
			shipped: 0,
			shipRate: "—",
			progress: { done: 0, total: 0 },
			routineCount: 0,
			agentCount: 0,
			activeAgentCount: 0,
			agentHealthWarning: false,
		},
		{
			id: "test-team-2",
			name: "Second Test Team",
			phase: "build",
			active: true,
			status: "healthy",
			activeBets: 0,
			shipped: 0,
			shipRate: "—",
			progress: { done: 0, total: 0 },
			routineCount: 0,
			agentCount: 0,
			activeAgentCount: 0,
			agentHealthWarning: false,
		},
	],
};

const DEFAULT_HARNESSES = [
	{
		type: "builtin",
		name: "Built-in",
		kind: "local",
		accessMode: "api-gateway",
		authAction: { kind: "none", label: "Built in" },
		discovery: { state: "ready", disabled: false },
		models: [],
		runtime: {
			preCompactionTrigger: false,
			subAgents: false,
			mcpSupport: false,
			modelProviders: ["anthropic", "openrouter"],
			fileEditing: true,
			toolUse: true,
		},
		modelProviders: ["anthropic", "openrouter"],
	},
	{
		type: "claude-code",
		name: "Claude Code",
		kind: "local",
		accessMode: "provider-subscription-cli",
		authAction: {
			kind: "native_cli_login",
			label: "Log in to Claude Code",
			command: ["claude", "auth", "login"],
		},
		discovery: { state: "ready", version: "2.1.178", disabled: false },
		models: [],
		runtime: {
			preCompactionTrigger: false,
			subAgents: true,
			mcpSupport: true,
			modelProviders: ["anthropic"],
			fileEditing: true,
			toolUse: true,
		},
		modelProviders: ["anthropic"],
	},
] as const;

function jsonResponse(body: unknown, status = 200): Parameters<Route["fulfill"]>[0] {
	return {
		status,
		contentType: "application/json",
		body: JSON.stringify(body),
	};
}

function fallbackBodyForApi(pathname: string): unknown {
	if (pathname === "/api/auth/ws-token") return { token: "e2e-ws-token" };
	if (pathname.endsWith("/artifact-thread-summary")) {
		return { summaries: [], totalCount: 0, truncated: false };
	}
	if (pathname === "/api/notifications/inbox") return { unseenCount: 0, rows: [] };
	if (pathname.startsWith("/api/notifications/")) return { ok: true };
	if (pathname === "/api/hint-progress") return { dismissed: [] };
	if (pathname.startsWith("/api/hint-progress/")) return { ok: true };
	if (pathname === "/api/knowledge/triage-count") return { count: 0 };
	if (pathname === "/api/knowledge") return { items: [] };
	if (pathname.startsWith("/api/knowledge/")) return { error: "Not found" };
	if (pathname === "/api/artifacts") return { items: [], nextCursor: null };
	if (pathname.startsWith("/api/artifacts/")) return { error: "Not found" };
	if (pathname === "/api/threads") return DEFAULT_THREADS;
	if (pathname.startsWith("/api/threads/assistant")) {
		return { thread: null, messages: [] };
	}
	if (pathname.startsWith("/api/threads/")) return { thread: null, messages: [] };
	if (pathname === "/api/agents") return [];
	if (pathname.startsWith("/api/agents/")) return { error: "Not found" };
	if (pathname === "/api/harnesses") return DEFAULT_HARNESSES;
	if (pathname === "/api/org") return { users: [], teams: [], edges: [] };
	if (pathname === "/api/connections") return { connections: [] };
	if (pathname === "/api/credentials") return { credentials: [] };
	if (pathname.startsWith("/api/users/")) return { error: "Not found" };
	return { ok: true };
}

type CoreApiFixtures = {
	/** Auto-use fixture: registers default M3 API mocks before every test. */
	_coreApiMocks: void;
};

/**
 * Extended test with auto-use core API mocks.
 *
 * Registers low-priority fallback handlers for the core M3 endpoints.
 * Individual tests may register their own page.route() calls — Playwright's
 * LIFO matching ensures test-specific routes win over these defaults.
 */
export const test = base.extend<CoreApiFixtures>({
	_coreApiMocks: [
		async ({ page }, use) => {
			// Register default handlers before the test body runs.
			// These are fallbacks — test-specific route registrations take precedence
			// because Playwright matches routes LIFO (last registered first matched).
			//
			// @lore release-v0.6.0: Main E2E boots Vite only, not the API server.
			// AppShell background hooks keep adding lightweight /api/* reads. This
			// low-priority fallback prevents unowned shell calls from escaping to
			// Vite's localhost:3001 proxy while still allowing test-specific mocks
			// registered later to win.
			await page.route("**/api/**", async (route) => {
				const url = new URL(route.request().url());
				const method = route.request().method();
				if (method === "GET" || method === "POST" || method === "PUT" || method === "PATCH") {
					const notFound =
						url.pathname.startsWith("/api/knowledge/") ||
						url.pathname.startsWith("/api/artifacts/") ||
						url.pathname.startsWith("/api/agents/") ||
						url.pathname.startsWith("/api/users/");
					await route.fulfill(jsonResponse(fallbackBodyForApi(url.pathname), notFound ? 404 : 200));
					return;
				}
				await route.fulfill(jsonResponse({ ok: true }));
			});

			// GET /api/auth/me — identity for useCurrentUser hook
			await page.route("**/api/auth/me", async (route) => {
				if (route.request().method() === "GET") {
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify(DEFAULT_AUTH_ME),
					});
				} else {
					await route.fallback();
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
					await route.fallback();
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
					await route.fallback();
				}
			});

			// GET /api/teams — team list for work portfolio
			await page.route("**/api/teams", async (route) => {
				if (route.request().method() === "GET") {
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify(DEFAULT_TEAMS),
					});
				} else {
					await route.fallback();
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
	await page.route("**/api/**", async (route) => {
		const url = new URL(route.request().url());
		const method = route.request().method();
		if (method === "GET" || method === "POST" || method === "PUT" || method === "PATCH") {
			const notFound =
				url.pathname.startsWith("/api/knowledge/") ||
				url.pathname.startsWith("/api/artifacts/") ||
				url.pathname.startsWith("/api/agents/") ||
				url.pathname.startsWith("/api/users/");
			await route.fulfill(jsonResponse(fallbackBodyForApi(url.pathname), notFound ? 404 : 200));
			return;
		}
		await route.fulfill(jsonResponse({ ok: true }));
	});
	await page.route("**/api/auth/me", async (route) => {
		if (route.request().method() === "GET") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(DEFAULT_AUTH_ME),
			});
		} else {
			await route.fallback();
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
			await route.fallback();
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
			await route.fallback();
		}
	});
	await page.route("**/api/teams", async (route) => {
		if (route.request().method() === "GET") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(DEFAULT_TEAMS),
			});
		} else {
			await route.fallback();
		}
	});
}
