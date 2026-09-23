import { describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

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
	// Removed: /api/conversations root (door #72 DELETE), /api/status (doors #115-118 DELETE),
	// /api/notifications root (door #129 DELETE) — these routes were convicted and removed.
	// the architecture doc §8: /api/tasks (the eight-route CRUD surface) is
	// deleted outright — task is an action, `POST /api/actions/<name>`, not a
	// route module with a GET base path. See the actions-router POST check below.
	// @lore BC5 T7b: /api/routines and /api/notifications/inbox move to
	// RETIRED_ROUTES below — both packages and routes are deleted with the
	// routine/notification cutover.
	// @lore BC5 T11: /api/users moves to RETIRED_ROUTES below — user is an
	// action now, `search_users`/`open_user`/`edit_user` under
	// `POST /api/actions/<name>`, not a route module with a GET base path.
	const ROUTE_MODULES = [{ path: "/api/health", description: "Health (public)" }] as const;

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

	/**
	 * AU26 C1 (§D-F) — the git exporter is deleted by founder verdict. Its four
	 * routes must be GONE, not merely disabled: the same canonical JSON 404 any
	 * unknown `/api/*` path returns. The mirror image of the guard above.
	 */
	const RETIRED_ROUTES = [
		// BB1: bets dissolved into tasks — /api/bets route deleted.
		"/api/bets",
		// the architecture doc §8: the eight-route /api/tasks CRUD surface is
		// deleted — task is an action now, not a route module.
		"/api/tasks",
		// document-module B20: /api/knowledge is deleted — document is an
		// action now, `search_documents`/`open_document`/`edit_document` under
		// `POST /api/actions/<name>`, not a route module with a GET base path.
		"/api/knowledge",
		// /api/sessions is deleted — session is an action now,
		// `search_sessions`/`watch_session`/`stop_session` under
		// `POST /api/actions/<name>`, not a route module with a GET base path.
		"/api/sessions",
		"/api/git-export",
		"/api/git-export/config",
		"/api/git-export/run",
		"/api/git-export/status",
		// BC5 T7b: the routine and notifications packages and their routes are deleted.
		"/api/routines",
		"/api/notifications/inbox",
		// BC5 T11: user is one module now — the users/agents/org/teams/
		// recipients/harnesses/filesystems(core)/connections/settings-agent-
		// behavior route families are all deleted; every one folds into
		// search_users/open_user/edit_user.
		"/api/users",
		"/api/agents",
		"/api/org",
		"/api/teams",
		"/api/recipients",
		"/api/harnesses",
		"/api/filesystems",
		"/api/connections",
		"/api/settings/agent-behavior",
	] as const;

	for (const path of RETIRED_ROUTES) {
		test(`retired: ${path} is not mounted`, async ({ app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const res = await app.request(path, { headers: auth() });

			expect(res.status, `${path} is still mounted`).toBe(404);
			expect(res.headers.get("content-type")).toContain("application/json");
			expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
			vi.unstubAllEnvs();
		});
	}

	// the architecture doc §7: the actions router mounts POST-only routes (no
	// GET base path), so it needs its own check rather than joining
	// ROUTE_MODULES's GET sweep — a GET would 404 whether or not the router is
	// mounted, since only POST is registered per action.
	test("Actions (/api/actions/search_tasks) is mounted and returns non-404", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/actions/search_tasks", {
			method: "POST",
			headers: { ...auth(), "Content-Type": "application/json" },
			body: JSON.stringify({}),
		});
		expect(
			res.status,
			"/api/actions/search_tasks returned 404 — router may be un-mounted",
		).not.toBe(404);
		vi.unstubAllEnvs();
	});
});
