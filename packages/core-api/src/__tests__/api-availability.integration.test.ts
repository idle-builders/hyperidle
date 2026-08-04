import { describe, expect, vi } from "vitest";
import { test } from "../test-fixtures.js";

const TEST_API_KEY = "test-key-availability";

function auth(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY };
}

/**
 * API Availability Regression Guard (I6).
 *
 * On every CI run, verify every route module returns non-404 for its
 * base path. This is a regression guard — if a route is accidentally
 * un-mounted (the S1 showstopper that started Track I), this test fails.
 *
 * @lore I6: Each route module is tested by hitting its base GET endpoint.
 * We expect a status other than 404. Some routes return 200 (list endpoints),
 * others may return 400 (missing params) — but never 404 (not mounted).
 */
describe("API Availability Regression Guard (I6)", () => {
	/**
	 * Every route module mounted in app.ts. The base path is the first
	 * segment after /api/. For each, a GET to the base path must return
	 * something other than 404.
	 */
	const ROUTE_MODULES = [
		{ path: "/api/health", description: "Health (public)" },
		{ path: "/api/bets", description: "Bets" },
		{ path: "/api/tasks", description: "Tasks" },
		{ path: "/api/knowledge", description: "Knowledge" },
		{ path: "/api/conversations", description: "Conversations" },
		{ path: "/api/users", description: "Users" },
		{ path: "/api/routines", description: "Routines" },
		{ path: "/api/sessions", description: "Sessions" },
		{ path: "/api/status", description: "Status" },
		{ path: "/api/git-export", description: "Git Export" },
		{ path: "/api/notifications", description: "Notifications" },
	] as const;

	for (const route of ROUTE_MODULES) {
		test(`${route.description} (${route.path}) is mounted and returns non-404`, async ({ app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const isPublic = route.path === "/api/health";
			const headers = isPublic ? {} : auth();
			const res = await app.request(route.path, { headers });

			expect(res.status, `${route.path} returned 404 — route may be un-mounted`).not.toBe(404);
			vi.unstubAllEnvs();
		});
	}

	test("unknown /api route returns 404 (sanity check)", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/definitely-not-a-route", { headers: auth() });
		expect(res.status).toBe(404);
		vi.unstubAllEnvs();
	});
});
