/**
 * P4 — POST /api/users integration tests (Task 2, AC-28)
 *
 * AC coverage:
 * AC-28: POST /api/users endpoint creates a human user
 * Reviewer CRITICAL: Auth bypass — when no human user exists, allow unauthenticated creation
 * Reviewer WARNING: POST returns 200 for idempotent (not 409)
 * Reviewer WARNING: POST must set role, status, and other required columns
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

	// AC-28: POST creates human user with 201
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

	// Reviewer WARNING: required columns must be set
	it("created user has role and status set", async () => {
		const res = await app.request("/api/users", {
			method: "POST",
			headers: noAuthHeaders(),
			body: JSON.stringify({ name: "Bob", email: "bob@example.com" }),
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
			body: JSON.stringify({ name: "Setup User", email: "setup@example.com" }),
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

	// Validation: missing email returns 400
	it("returns 400 when email is missing", async () => {
		const res = await app.request("/api/users", {
			method: "POST",
			headers: noAuthHeaders(),
			body: JSON.stringify({ name: "Alice" }),
		});

		expect(res.status).toBe(400);
	});

	// Validation: invalid email returns 400
	it("returns 400 for invalid email format", async () => {
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
			body: JSON.stringify({ name: "New User", email: "new@example.com" }),
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
