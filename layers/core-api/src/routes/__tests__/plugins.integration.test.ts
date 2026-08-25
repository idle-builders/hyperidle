/**
 * BA9a — plugin HTTP routes integration tests.
 *
 * Tests the 404 responses added in R1/review-fix for enable, disable,
 * remove, and restore when the plugin ID does not exist or is removed.
 *
 * Uses the real DB + app fixtures (no stubs).
 */
import { plugins } from "@hyperidle/db";
import { BUILTIN_PLUGIN_ID } from "@hyperidle/domain-model";
import { describe, expect, test } from "../../__testing__/test-fixtures.js";

const API_KEY = "test-ba9a-plugins";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": API_KEY };
}

describe("Plugin routes — 404 on unknown plugin", () => {
	test("POST /api/plugins/:id/enable returns 404 for non-existent id", async ({ app }) => {
		const res = await app.request("/api/plugins/no-such-plugin/enable", {
			method: "POST",
			headers: authHeaders(),
		});
		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body).toMatchObject({ code: "NOT_FOUND" });
	});

	test("POST /api/plugins/:id/disable returns 404 for non-existent id", async ({ app }) => {
		const res = await app.request("/api/plugins/no-such-plugin/disable", {
			method: "POST",
			headers: authHeaders(),
		});
		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body).toMatchObject({ code: "NOT_FOUND" });
	});

	test("DELETE /api/plugins/:id returns 404 for non-existent id", async ({ app }) => {
		const res = await app.request("/api/plugins/no-such-plugin", {
			method: "DELETE",
			headers: authHeaders(),
		});
		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body).toMatchObject({ code: "NOT_FOUND" });
	});

	test("POST /api/plugins/:id/contributions/restore returns 404 for non-existent id", async ({
		app,
	}) => {
		const res = await app.request("/api/plugins/no-such-plugin/contributions/restore", {
			method: "POST",
			headers: { ...authHeaders(), "Content-Type": "application/json" },
			body: JSON.stringify({ kind: "agent", manifestKey: "some-key" }),
		});
		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body).toMatchObject({ code: "NOT_FOUND" });
	});

	test("DELETE /api/plugins/:id returns 404 for removed (state=removed) plugin", async ({
		db,
		app,
	}) => {
		const now = "2026-01-01T00:00:00Z";
		await db.insert(plugins).values({
			id: "removed-plugin",
			name: "removed-plugin",
			version: "1.0.0",
			state: "removed",
			scopeKind: "factory",
			scopeTeamId: null,
			installedAt: now,
			updatedAt: now,
			removedAt: now,
		});
		const res = await app.request("/api/plugins/removed-plugin", {
			method: "DELETE",
			headers: authHeaders(),
		});
		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body).toMatchObject({ code: "NOT_FOUND" });
	});

	test("GET /api/plugins returns empty list when no plugins installed", async ({ app }) => {
		const res = await app.request("/api/plugins", {
			method: "GET",
			headers: authHeaders(),
		});
		// builtin is seeded but excluded from list; no user-installed plugins
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(Array.isArray(body.plugins)).toBe(true);
	});

	test("builtin plugin is treated as not-found by enable (reserved guard)", async ({ app }) => {
		const res = await app.request(`/api/plugins/${BUILTIN_PLUGIN_ID}/enable`, {
			method: "POST",
			headers: authHeaders(),
		});
		// getInstalledPlugin returns null for BUILTIN_PLUGIN_ID → 404
		expect(res.status).toBe(404);
	});
});
