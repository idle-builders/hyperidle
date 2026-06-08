/**
 * AD1 RED — Wire Review Routing to Humans: IDOR fix in threads route.
 *
 * These tests FAIL until:
 *  - GET /api/threads validates that participant_id matches c.get("userId")
 *  - Returns 403 for mismatches
 *  - Returns 200 for valid own participant_id queries
 *  - Does NOT break host_kind queries (no participant_id → no IDOR check)
 *
 * AC: The threads API validates that participant_id matches the authenticated
 *     user, returning 403 for mismatches (IDOR fix).
 */

import { createTestDb, type HyperIdleDb, type TestDbHandle, threads, users } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-ad1-idor";
const NOW = new Date().toISOString();

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("AD1 — IDOR fix: GET /api/threads participant_id validation", () => {
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

		// Seed two human users — the auth middleware resolves userId from
		// users WHERE kind = 'human' LIMIT 1, so the first inserted human
		// becomes the authenticated user for tests using the API key.
		await db.insert(users).values([
			{
				id: "human-owner",
				kind: "human",
				name: "Human Owner",
				role: "founder",
				status: "active",
				createdAt: NOW,
			},
			{
				id: "human-other",
				kind: "human",
				name: "Human Other",
				role: "founder",
				status: "active",
				createdAt: NOW,
			},
		]);

		// Seed threads for both users
		await db.insert(threads).values([
			{
				id: "thread-owner",
				hostKind: "task",
				hostId: "task-owner",
				initiatorId: "human-owner",
				participants: JSON.stringify(["human-owner"]),
				lastActiveAt: NOW,
				createdAt: NOW,
			},
			{
				id: "thread-other",
				hostKind: "task",
				hostId: "task-other",
				initiatorId: "human-other",
				participants: JSON.stringify(["human-other"]),
				lastActiveAt: NOW,
				createdAt: NOW,
			},
		]);
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle?.close();
	});

	// -------------------------------------------------------------------------
	// AC: own participant_id → 200
	// -------------------------------------------------------------------------
	it("returns 200 when participant_id matches the authenticated user", async () => {
		// human-owner is the first human user → auth middleware resolves to human-owner
		const res = await app.request("/api/threads?participant_id=human-owner", {
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.threads).toBeDefined();
		// Should only see human-owner's thread
		const threadIds = (body.threads as Array<{ id: string }>).map((t) => t.id);
		expect(threadIds).toContain("thread-owner");
		expect(threadIds).not.toContain("thread-other");
	});

	// -------------------------------------------------------------------------
	// AC: other participant_id → 403
	// -------------------------------------------------------------------------
	it("returns 403 when participant_id does NOT match the authenticated user", async () => {
		// Auth middleware resolves to human-owner, but we query human-other's threads
		const res = await app.request("/api/threads?participant_id=human-other", {
			headers: authHeaders(),
		});

		expect(res.status).toBe(403);
		const body = await res.json();
		expect(body.code).toBeDefined();
		// Must use a standard error code (FORBIDDEN or similar)
		expect(["FORBIDDEN", "forbidden"]).toContain(body.code);
	});

	// -------------------------------------------------------------------------
	// AC: host_kind queries are NOT affected (no participant_id → no IDOR check)
	// -------------------------------------------------------------------------
	it("does NOT apply IDOR check for host_kind queries without participant_id", async () => {
		const res = await app.request("/api/threads?host_kind=task", {
			headers: authHeaders(),
		});

		// host_kind queries are unaffected by the IDOR fix
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.threads).toBeDefined();
	});

	// -------------------------------------------------------------------------
	// AC: missing participant_id and missing host_kind → 400 (existing behavior preserved)
	// -------------------------------------------------------------------------
	it("returns 400 when neither participant_id nor host_kind is provided (existing behavior)", async () => {
		const res = await app.request("/api/threads", {
			headers: authHeaders(),
		});

		expect(res.status).toBe(400);
	});

	// -------------------------------------------------------------------------
	// AC: IDOR fix does not break single-founder local mode
	//     In local mode, there is only one human user → their participant_id === auth userId
	// -------------------------------------------------------------------------
	it("works in single-founder setup (participant_id === only human user)", async () => {
		// human-owner is the only user that matters in local-mode single-founder setup
		const res = await app.request("/api/threads?participant_id=human-owner", {
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
	});
});
