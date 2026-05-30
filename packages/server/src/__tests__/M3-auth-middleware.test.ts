/**
 * M3 — Auth middleware: createAuthMiddleware(db) sets userId from users table.
 *
 * @lore P2: Updated from factorySettings.founder_id lookup to users table query.
 * The middleware now queries `users WHERE kind = 'human' LIMIT 1` after API key
 * validation. Tests seed a human user row instead of factorySettings founder_id.
 * The fallback to "u-founder" is preserved for unseeded DBs.
 */

import { bets, createTestDb, type HyperIdleDb, teamMembers, teams, users } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-m3-auth";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

/**
 * Seed a human founder user row. P2: auth resolves from users WHERE kind = 'human'.
 */
function seedFounderUser(db: HyperIdleDb, founderId = "test-founder-1"): void {
	const now = new Date().toISOString();
	db.insert(users)
		.values({
			id: founderId,
			kind: "human",
			name: "Test Founder",
			email: "test@hyperidle.dev",
			role: "founder",
			status: "active",
			createdAt: now,
		})
		.onConflictDoNothing()
		.run();
}

describe("M3 — Auth middleware: createAuthMiddleware(db) (A3)", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("sets userId on context from users table (kind=human)", async () => {
		seedFounderUser(db, "test-founder-1");

		// Probe via GET /api/auth/me which returns c.get("userId")
		const res = await app.request("/api/auth/me", { headers: authHeaders() });

		// Endpoint must exist and return the seeded founder id (not "u-founder")
		expect(res.status).toBe(200);
		const body = (await res.json()) as { id: string };
		expect(body.id).toBe("test-founder-1");
		expect(body.id).not.toBe("u-founder");
	});

	it("falls back to u-founder when no human user is seeded (backward compat)", async () => {
		// Do NOT seed any human user
		const res = await app.request("/api/auth/me", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { id: string };
		// The fallback must be "u-founder" to not break unseeded DBs
		expect(body.id).toBe("u-founder");
	});

	it("returns 401 when no API key is provided", async () => {
		const res = await app.request("/api/auth/me");
		expect(res.status).toBe(401);
	});
});

describe("M3 — GET /api/auth/me returns full identity from users table (A4)", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });
		seedFounderUser(db, "test-founder-1");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns id, name, email, avatarUrl from users table", async () => {
		const res = await app.request("/api/auth/me", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as {
			id: string;
			name: string;
			email: string;
			avatarUrl: string | null;
		};
		expect(body.id).toBe("test-founder-1");
		expect(body.name).toBe("Test Founder");
		expect(body.email).toBe("test@hyperidle.dev");
		expect(body.avatarUrl).toBeNull();
	});

	it("response id is NOT the hardcoded 'u-founder'", async () => {
		const res = await app.request("/api/auth/me", { headers: authHeaders() });
		const body = (await res.json()) as { id: string };
		expect(body.id).not.toBe("u-founder");
	});
});

describe("M3 — Bets routes: revision log actor comes from auth context (A5)", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });

		const now = new Date().toISOString();
		db.insert(teams)
			.values({ id: "prod-1", name: "Test Product", phase: "build", createdAt: now })
			.run();
		db.insert(teamMembers)
			.values({
				id: "team-1",
				teamId: "prod-1",
				capacity: 3,
				activeBets: 0,
				formedAt: now,
			})
			.run();
		// @lore U1: bets.teamId references `teams` (domain entity), not `teamMembers`.
		db.insert(bets)
			.values({
				id: "bet-1",
				teamId: "prod-1",
				description: "Test bet",
				status: "active",
				createdAt: now,
			})
			.run();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("revision log actor is the seeded human user id, NOT 'u-founder'", async () => {
		seedFounderUser(db, "test-founder-1");

		const res = await app.request("/api/bets/bet-1", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				field: "hypothesis",
				value: "New hypothesis",
				reason: "Test reason",
			}),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { revisionLog?: string };
		const log = body.revisionLog ? (JSON.parse(body.revisionLog) as Array<{ actor: string }>) : [];
		expect(log.length).toBeGreaterThan(0);
		const lastEntry = log[log.length - 1];
		expect(lastEntry?.actor).toBe("test-founder-1");
		expect(lastEntry?.actor).not.toBe("u-founder");
	});
});
