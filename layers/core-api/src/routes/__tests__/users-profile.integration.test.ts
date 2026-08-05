/**
 * P4 — PATCH /api/users/:id integration tests (Task 1, AC-27, AC-29)
 *
 * AC coverage:
 * AC-27: PATCH /api/users/:id endpoint exists and updates name/email
 * AC-29: PATCH /api/users/:id rejects unauthorized updates (user can only patch self)
 */

import { type HyperIdleDb, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-users-profile";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

const NOW = new Date().toISOString();

async function seedUser(db: HyperIdleDb): Promise<void> {
	await db.insert(users).values({
		id: "u-human-1",
		kind: "human",
		name: "Alice",
		email: "alice@example.com",
		role: "founder",
		status: "active",
		createdAt: NOW,
	});
}

describe("PATCH /api/users/:id — profile update", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// AC-27: PATCH with valid body returns 200 + updated fields
	test("updates name and returns 200 with updated user", async ({ db, app }) => {
		await seedUser(db);
		const res = await app.request("/api/users/u-human-1", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Alice Updated" }),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.name).toBe("Alice Updated");
		expect(body.id).toBe("u-human-1");
	});

	// AC-27: PATCH with email updates email
	test("updates email and returns 200 with updated user", async ({ db, app }) => {
		await seedUser(db);
		const res = await app.request("/api/users/u-human-1", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ email: "alice-new@example.com" }),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.email).toBe("alice-new@example.com");
	});

	// AC-27: PATCH with both name and email
	test("updates both name and email in one request", async ({ db, app }) => {
		await seedUser(db);
		const res = await app.request("/api/users/u-human-1", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Bob", email: "bob@example.com" }),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.name).toBe("Bob");
		expect(body.email).toBe("bob@example.com");
	});

	// AC-27: PATCH persists changes (GET confirms)
	test("persists changes so a subsequent GET returns the updated value", async ({ db, app }) => {
		await seedUser(db);
		await app.request("/api/users/u-human-1", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Persisted Name" }),
		});

		const getRes = await app.request("/api/users/u-human-1", {
			method: "GET",
			headers: authHeaders(),
		});
		const body = (await getRes.json()) as Record<string, unknown>;
		expect(body.name).toBe("Persisted Name");
	});

	// AC-29: PATCH with different userId returns 403
	test("returns 403 when patching another user's profile", async ({ db, app }) => {
		await seedUser(db);
		// Seed a second human user to attempt PATCH on
		await db.insert(users).values({
			id: "u-human-2",
			kind: "human",
			name: "Bob",
			email: "bob@example.com",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});

		// The auth middleware resolves userId from the first human in the DB (u-human-1)
		// Attempting to PATCH u-human-2 should return 403
		const res = await app.request("/api/users/u-human-2", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Hacked Name" }),
		});

		expect(res.status).toBe(403);
	});

	// Validation: invalid email returns 400
	test("returns 400 for invalid email format", async ({ db, app }) => {
		await seedUser(db);
		const res = await app.request("/api/users/u-human-1", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ email: "not-an-email" }),
		});

		expect(res.status).toBe(400);
	});

	// Validation: empty name returns 400
	test("returns 400 for empty name string", async ({ db, app }) => {
		await seedUser(db);
		const res = await app.request("/api/users/u-human-1", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ name: "" }),
		});

		expect(res.status).toBe(400);
	});

	// Returns 403 for unknown user id (self-only check prevents leaking existence)
	// @lore P4: 403 is returned for unknown user ids, not 404, because the
	// self-only auth check fails first. This prevents leaking user existence
	// information to unauthorized callers.
	test("returns 403 for an unknown user id (self-only check fails before existence check)", async ({
		db,
		app,
	}) => {
		await seedUser(db);
		const res = await app.request("/api/users/u-does-not-exist", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ name: "Ghost" }),
		});

		expect(res.status).toBe(403);
	});

	// Unauthenticated request returns 401
	test("returns 401 when no API key is provided", async ({ db, app }) => {
		await seedUser(db);
		const res = await app.request("/api/users/u-human-1", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "Intruder" }),
		});

		expect(res.status).toBe(401);
	});
});
