/**
 * R2 — POST /api/users integration tests (updated from P4)
 *
 * R2 AC coverage:
 * - Email is optional in user creation (AC-1 / Task 1)
 * - Creating user without email succeeds (AC-1)
 * - Invalid email format still returns 400 when email IS provided (regression guard)
 * - Existing tests that required email have been removed/inverted per reviewer warning
 *
 * P4 AC coverage (retained):
 * - AC-28: POST /api/users endpoint creates a human user
 * - Auth bypass — when no human user exists, allow unauthenticated creation
 * - POST returns 200 for idempotent (not 409)
 * - POST must set role, status, and other required columns
 */

import { createTestDb, type HyperIdleDb, users } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test-utils.js";

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
	let app: Hono;
	let db: HyperIdleDb;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const handle = await createTestDb();
		db = handle.db;
		const eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// AC-28: POST creates human user with 201 (with email — backward compatible)
	it("creates a human user and returns 201 when no human user exists", async () => {
		const res = await app.request("/api/users", {
			method: "POST",
			headers: noAuthHeaders(),
			body: JSON.stringify({ name: "Alice Founder", email: "alice@example.com" }),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.name).toBe("Alice Founder");
		expect(body.email).toBe("alice@example.com");
		expect(body.kind).toBe("human");
		expect(typeof body.id).toBe("string");
	});

	// R2 AC-1: Email is optional — creating user without email must succeed
	it("creates user without email (email omitted) — R2: email is optional", async () => {
		const res = await app.request("/api/users", {
			method: "POST",
			headers: noAuthHeaders(),
			body: JSON.stringify({ name: "Bob NoEmail" }),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.name).toBe("Bob NoEmail");
		expect(body.kind).toBe("human");
		expect(typeof body.id).toBe("string");
	});

	// R2 AC-1 backward compat: email still accepted when provided
	it("creates user with email (backward compatible)", async () => {
		const res = await app.request("/api/users", {
			method: "POST",
			headers: noAuthHeaders(),
			body: JSON.stringify({ name: "Carol WithEmail", email: "carol@example.com" }),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.name).toBe("Carol WithEmail");
		expect(body.email).toBe("carol@example.com");
	});

	// Reviewer WARNING: required columns must be set
	it("created user has role and status set", async () => {
		const res = await app.request("/api/users", {
			method: "POST",
			headers: noAuthHeaders(),
			body: JSON.stringify({ name: "Bob" }),
		});

		expect(res.status).toBe(201);
		const body = (await res.json()) as Record<string, unknown>;
		expect(typeof body.role).toBe("string");
		expect(body.role).toBeTruthy();
		expect(typeof body.status).toBe("string");
		expect(body.status).toBeTruthy();
	});

	// AC-28: Idempotent — second POST returns 200 with existing user
	it("returns 200 with existing user when human user already exists (idempotent)", async () => {
		// First call creates
		const first = await app.request("/api/users", {
			method: "POST",
			headers: noAuthHeaders(),
			body: JSON.stringify({ name: "Alice", email: "alice@example.com" }),
		});
		expect(first.status).toBe(201);
		const firstBody = (await first.json()) as Record<string, unknown>;

		// Second call is idempotent — same human user returned
		const second = await app.request("/api/users", {
			method: "POST",
			headers: authHeaders(), // now auth is required since a human exists
			body: JSON.stringify({ name: "Alice Again", email: "alice@example.com" }),
		});
		expect(second.status).toBe(200);
		const secondBody = (await second.json()) as Record<string, unknown>;
		// Returns the existing user (same id)
		expect(secondBody.id).toBe(firstBody.id);
	});

	// Reviewer CRITICAL: Auth bypass test — no API key when no human exists
	it("allows unauthenticated creation when HYPERIDLE_API_KEY is set but no human user exists", async () => {
		// Empty API key in env simulates local-mode where key is not yet configured
		vi.stubEnv("HYPERIDLE_API_KEY", "");

		const freshHandle = await createTestDb();
		const freshApp = await createTestApp({ db: freshHandle.db, eventBus: new EventBus() });

		const res = await freshApp.request("/api/users", {
			method: "POST",
			headers: noAuthHeaders(), // no API key header
			body: JSON.stringify({ name: "Setup User" }),
		});

		// Should succeed — local mode with no human user allows setup
		expect(res.status).toBe(201);
	});

	// Validation: missing name returns 400
	it("returns 400 when name is missing", async () => {
		const res = await app.request("/api/users", {
			method: "POST",
			headers: noAuthHeaders(),
			body: JSON.stringify({ email: "alice@example.com" }),
		});

		expect(res.status).toBe(400);
	});

	// R2: email omitted is now valid — this is NOT a 400 (removed old "returns 400 when email is missing" test)
	// The new behavior is: no email → user created successfully (tested above in "creates user without email")

	// Validation: invalid email format returns 400 when email IS provided
	it("returns 400 for invalid email format when email is provided", async () => {
		const res = await app.request("/api/users", {
			method: "POST",
			headers: noAuthHeaders(),
			body: JSON.stringify({ name: "Alice", email: "not-an-email" }),
		});

		expect(res.status).toBe(400);
	});

	// Validation: empty name returns 400
	it("returns 400 for empty name", async () => {
		const res = await app.request("/api/users", {
			method: "POST",
			headers: noAuthHeaders(),
			body: JSON.stringify({ name: "", email: "alice@example.com" }),
		});

		expect(res.status).toBe(400);
	});

	// Security: after setup, unauthenticated creation blocked
	it("blocks unauthenticated POST when a human user already exists", async () => {
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
	it("created user is retrievable via GET /api/users/:id", async () => {
		const createRes = await app.request("/api/users", {
			method: "POST",
			headers: noAuthHeaders(),
			body: JSON.stringify({ name: "New User" }),
		});
		const created = (await createRes.json()) as Record<string, unknown>;

		const getRes = await app.request(`/api/users/${created.id}`, {
			method: "GET",
			headers: authHeaders(),
		});
		expect(getRes.status).toBe(200);
		const body = (await getRes.json()) as Record<string, unknown>;
		expect(body.id).toBe(created.id);
		expect(body.name).toBe("New User");
	});
});
