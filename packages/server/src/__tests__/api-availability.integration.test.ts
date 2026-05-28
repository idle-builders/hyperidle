import { createTestDb, type HyperIdleDb, type TestDbHandle } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

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
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle?.close();
	});

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
		{ path: "/api/rail", description: "Rail" },
		{ path: "/api/conversations", description: "Conversations" },
		{ path: "/api/users", description: "Users" },
		{ path: "/api/routines", description: "Routines" },
		{ path: "/api/sessions", description: "Sessions" },
		{ path: "/api/status", description: "Status" },
		{ path: "/api/git-export", description: "Git Export" },
		{ path: "/api/notifications", description: "Notifications" },
		{ path: "/api/observability", description: "Observability" },
	] as const;

	for (const route of ROUTE_MODULES) {
		it(`${route.description} (${route.path}) is mounted and returns non-404`, async () => {
			const isPublic = route.path === "/api/health";
			const headers = isPublic ? {} : auth();
			const res = await app.request(route.path, { headers });

			expect(res.status, `${route.path} returned 404 — route may be un-mounted`).not.toBe(404);
		});
	}

	it("unknown /api route returns 404 (sanity check)", async () => {
		const res = await app.request("/api/definitely-not-a-route", { headers: auth() });
		expect(res.status).toBe(404);
	});
});
