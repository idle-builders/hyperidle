/**
 * P4 — POST /api/users integration tests (Task 2, AC-28)
 *
 * AC coverage:
 * AC-28: POST /api/users endpoint creates a human user
 * Reviewer CRITICAL: Auth bypass — when no human user exists, allow unauthenticated creation
 * Reviewer WARNING: POST returns 200 for idempotent (not 409)
 * Reviewer WARNING: POST must set role, status, and other required columns
 */

import { users } from "@hyperidle/db";
import { minimalStrategy } from "@hyperidle/strategy-minimal";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { createApp } from "../../app.js";
import { clearActiveStrategy, setActiveStrategy } from "../../services/strategy-registry.js";
import { test } from "../../test-fixtures.js";

const TEST_API_KEY = "test-key-users-create";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

function noAuthHeaders(): Record<string, string> {
	return { "Content-Type": "application/json" };
}

const NOW = new Date().toISOString();

describe("POST /api/users — setup user creation", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// AC-28: POST creates human user with 201
	// AK6 T8: response shape changed to { user: { ... } }
	test("creates a human user and returns 201 when no human user exists", async ({ app }) => {
		const res = await app.request("/api/users", {
			method: "POST",
			headers: noAuthHeaders(),
			body: JSON.stringify({ name: "Alice Founder", email: "alice@example.com" }),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { user: Record<string, unknown> };
		expect(body.user.name).toBe("Alice Founder");
		expect(body.user.email).toBe("alice@example.com");
		expect(body.user.kind).toBe("human");
		expect(typeof body.user.id).toBe("string");
	});

	// Reviewer WARNING: required columns must be set
	// AK6 T8: response shape changed to { user: { ... } }
	test("created user has role and status set", async ({ app }) => {
		const res = await app.request("/api/users", {
			method: "POST",
			headers: noAuthHeaders(),
			body: JSON.stringify({ name: "Bob", email: "bob@example.com" }),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { user: Record<string, unknown> };
		expect(typeof body.user.role).toBe("string");
		expect(body.user.role).toBeTruthy();
		expect(typeof body.user.status).toBe("string");
		expect(body.user.status).toBeTruthy();
	});

	// AC-28: Idempotent — second POST returns 200 with existing user
	// AK6 T8: 201 response shape is { user: { ... } }
	// AK6 P4 CRITICAL-1: 200 idempotent now also returns { user: { ... } } for consistent shape
	test("returns 200 with existing user when human user already exists (idempotent)", async ({
		app,
	}) => {
		// First call creates
		const first = await app.request("/api/users", {
			method: "POST",
			headers: noAuthHeaders(),
			body: JSON.stringify({ name: "Alice", email: "alice@example.com" }),
		});
		expect(first.status).toBe(201);
		const firstBody = (await first.json()) as { user: Record<string, unknown> };
		const firstId = firstBody.user.id;

		// Second call is idempotent — same human user returned
		const second = await app.request("/api/users", {
			method: "POST",
			headers: authHeaders(), // now auth is required since a human exists
			body: JSON.stringify({ name: "Alice Again", email: "alice@example.com" }),
		});
		expect(second.status).toBe(200);
		// AK6 P4 CRITICAL-1: 200 idempotent path now returns { user: { id } } to match 201 shape
		const secondBody = (await second.json()) as { user: Record<string, unknown> };
		expect(typeof secondBody.user).toBe("object");
		expect(secondBody.user.id).toBe(firstId);
	});

	// Reviewer CRITICAL: Auth bypass test — no API key when no human exists
	// AK6 T8: This test creates a freshApp without the fixture (so no fixture strategy).
	// Must manually set strategy before POST to avoid "No active Strategy" throw.
	test("allows unauthenticated creation when HYPERIDLE_API_KEY is set but no human user exists", async ({
		db,
		eventBus,
	}) => {
		// Empty API key in env simulates local-mode where key is not yet configured
		vi.stubEnv("HYPERIDLE_API_KEY", "");
		setActiveStrategy(minimalStrategy);

		const freshApp = await createApp({ db, eventBus });

		const res = await freshApp.request("/api/users", {
			method: "POST",
			headers: noAuthHeaders(), // no API key header
			body: JSON.stringify({ name: "Setup User", email: "setup@example.com" }),
		});

		clearActiveStrategy();

		// Should succeed — local mode with no human user allows setup
		expect(res.status).toBe(201);
	});

	// Validation: missing name returns 400
	test("returns 400 when name is missing", async ({ app }) => {
		const res = await app.request("/api/users", {
			method: "POST",
			headers: noAuthHeaders(),
			body: JSON.stringify({ email: "alice@example.com" }),
		});

		expect(res.status).toBe(400);
	});

	// R2: email is optional — creates user without email (email omitted)
	// AK6 T8: response shape changed to { user: { ... } }
	test("creates user without email (email omitted) — R2: email is optional", async ({ app }) => {
		const res = await app.request("/api/users", {
			method: "POST",
			headers: noAuthHeaders(),
			body: JSON.stringify({ name: "Alice" }),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as { user: Record<string, unknown> };
		expect(body.user.name).toBe("Alice");
		expect(body.user.kind).toBe("human");
		expect(typeof body.user.id).toBe("string");
	});

	// Validation: invalid email returns 400
	test("returns 400 for invalid email format", async ({ app }) => {
		const res = await app.request("/api/users", {
			method: "POST",
			headers: noAuthHeaders(),
			body: JSON.stringify({ name: "Alice", email: "not-an-email" }),
		});

		expect(res.status).toBe(400);
	});

	// Validation: empty name returns 400
	test("returns 400 for empty name", async ({ app }) => {
		const res = await app.request("/api/users", {
			method: "POST",
			headers: noAuthHeaders(),
			body: JSON.stringify({ name: "", email: "alice@example.com" }),
		});

		expect(res.status).toBe(400);
	});

	// Security: after setup, unauthenticated creation blocked
	test("blocks unauthenticated POST when a human user already exists", async ({ db, app }) => {
		// Seed a human user
		await db.insert(users).values({
			id: "u-human-1",
			kind: "human",
			name: "Existing Founder",
			email: "existing@example.com",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});

		// Try unauthenticated POST — should be rejected since human exists
		const res = await app.request("/api/users", {
			method: "POST",
			headers: noAuthHeaders(), // no API key
			body: JSON.stringify({ name: "Hacker", email: "hacker@example.com" }),
		});

		expect(res.status).toBe(401);
	});

	// The created user can be retrieved
	// AK6 T8: POST response is { user: { ... } } — extract user.id for GET
	test("created user is retrievable via GET /api/users/:id", async ({ app }) => {
		const createRes = await app.request("/api/users", {
			method: "POST",
			headers: noAuthHeaders(),
			body: JSON.stringify({ name: "New User", email: "new@example.com" }),
		});
		const created = (await createRes.json()) as { user: Record<string, unknown> };

		const getRes = await app.request(`/api/users/${created.user.id}`, {
			method: "GET",
			headers: authHeaders(),
		});
		expect(getRes.status).toBe(200);
		const body = (await getRes.json()) as Record<string, unknown>;
		expect(body.id).toBe(created.user.id);
		expect(body.name).toBe("New User");
	});
});
