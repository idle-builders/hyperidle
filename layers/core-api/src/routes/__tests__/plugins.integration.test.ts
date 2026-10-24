/**
 * Plugin lifecycle through `POST /api/actions/edit_plugin` / `search_plugins`:
 * the not-found refusals for enable, disable, remove, and restore when the
 * plugin ID does not exist or is removed — `unknown_plugin`/`plugin_removed`.
 *
 * Uses the real DB + app fixtures (no stubs).
 */
import { plugins } from "@hyperidle/db";
import { describe, expect, test } from "../../__testing__/test-fixtures.js";

const API_KEY = "test-plugins";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": API_KEY, "Content-Type": "application/json" };
}

describe("edit_plugin — not found", () => {
	test("state on a non-existent id is unknown_plugin", async ({ app }) => {
		const res = await app.request("/api/actions/edit_plugin", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ id: "no-such-plugin", state: "enabled" }),
		});
		expect(res.status).toBe(422);
		const body = await res.json();
		expect(body.problems?.[0]?.code).toBe("unknown_plugin");
	});

	test("disable on a non-existent id is unknown_plugin", async ({ app }) => {
		const res = await app.request("/api/actions/edit_plugin", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ id: "no-such-plugin", state: "disabled" }),
		});
		expect(res.status).toBe(422);
		const body = await res.json();
		expect(body.problems?.[0]?.code).toBe("unknown_plugin");
	});

	test("remove on a non-existent id is unknown_plugin", async ({ app }) => {
		const res = await app.request("/api/actions/edit_plugin", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ id: "no-such-plugin", remove: true }),
		});
		expect(res.status).toBe(422);
		const body = await res.json();
		expect(body.problems?.[0]?.code).toBe("unknown_plugin");
	});

	test("restore on a non-existent id is unknown_plugin", async ({ app }) => {
		const res = await app.request("/api/actions/edit_plugin", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ id: "no-such-plugin", restore: { contribution: "some-key" } }),
		});
		expect(res.status).toBe(422);
		const body = await res.json();
		expect(body.problems?.[0]?.code).toBe("unknown_plugin");
	});

	test("remove on a removed (state=removed) plugin is plugin_removed", async ({ db, app }) => {
		const now = "2026-01-01T00:00:00Z";
		await db.insert(plugins).values({
			id: "removed-plugin",
			name: "removed-plugin",
			version: "1.0.0",
			state: "removed",
			scopeKind: "factory",
			scopeTeamId: null,
			sourceKind: "folder",
			sourceAddress: "/plugins/removed-plugin",
			installedAt: now,
			updatedAt: now,
			removedAt: now,
		});
		const res = await app.request("/api/actions/edit_plugin", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ id: "removed-plugin", remove: true }),
		});
		expect(res.status).toBe(422);
		const body = await res.json();
		expect(body.problems?.[0]?.code).toBe("plugin_removed");
	});

	test("search_plugins returns an empty list when no plugins are installed", async ({ app }) => {
		const res = await app.request("/api/actions/search_plugins", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(Array.isArray(body.data)).toBe(true);
		expect(body.data).toEqual([]);
	});
});
