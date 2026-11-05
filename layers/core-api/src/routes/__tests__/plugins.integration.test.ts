/**
 * Plugin lifecycle through `POST /api/actions/edit_plugin` / `search_plugins`:
 * the not-found refusals for enable, disable, remove, and restore when the
 * plugin ID does not exist or is removed — `unknown_plugin`/`plugin_removed`.
 *
 * Uses the real DB + app fixtures (no stubs).
 */
import type { HyperIdleDb } from "@hyperidle/db";
import { plugins, users } from "@hyperidle/db";
import { describe, expect, test } from "../../__testing__/test-fixtures.js";

function authHeaders(): Record<string, string> {
	return { "Content-Type": "application/json" };
}

/** Seed the founder so HTTP actions run as a person, not nobody. */
async function seedFounder(db: HyperIdleDb): Promise<void> {
	await db
		.insert(users)
		.values({
			id: "u-founder",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: "2026-01-01T00:00:00Z",
		})
		.onConflictDoNothing();
}

describe("edit_plugin — not found", () => {
	test("state on a non-existent id is unknown_plugin", async ({ app, db, asPerson }) => {
		await seedFounder(db);
		await asPerson("u-founder");
		const res = await app.request("/api/actions/edit_plugin", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ id: "no-such-plugin", state: "enabled" }),
		});
		expect(res.status).toBe(422);
		const body = await res.json();
		expect(body.problems?.[0]?.code).toBe("unknown_plugin");
	});

	test("disable on a non-existent id is unknown_plugin", async ({ app, db, asPerson }) => {
		await seedFounder(db);
		await asPerson("u-founder");
		const res = await app.request("/api/actions/edit_plugin", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ id: "no-such-plugin", state: "disabled" }),
		});
		expect(res.status).toBe(422);
		const body = await res.json();
		expect(body.problems?.[0]?.code).toBe("unknown_plugin");
	});

	test("remove on a non-existent id is unknown_plugin", async ({ app, db, asPerson }) => {
		await seedFounder(db);
		await asPerson("u-founder");
		const res = await app.request("/api/actions/edit_plugin", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ id: "no-such-plugin", remove: true }),
		});
		expect(res.status).toBe(422);
		const body = await res.json();
		expect(body.problems?.[0]?.code).toBe("unknown_plugin");
	});

	test("restore on a non-existent id is unknown_plugin", async ({ app, db, asPerson }) => {
		await seedFounder(db);
		await asPerson("u-founder");
		const res = await app.request("/api/actions/edit_plugin", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ id: "no-such-plugin", restore: { contribution: "some-key" } }),
		});
		expect(res.status).toBe(422);
		const body = await res.json();
		expect(body.problems?.[0]?.code).toBe("unknown_plugin");
	});

	test("remove on a removed (state=removed) plugin is plugin_removed", async ({
		db,
		app,
		asPerson,
	}) => {
		await seedFounder(db);
		await asPerson("u-founder");
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

	test("search_plugins returns an empty list when no plugins are installed", async ({
		app,
		db,
		asPerson,
	}) => {
		await seedFounder(db);
		await asPerson("u-founder");
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
