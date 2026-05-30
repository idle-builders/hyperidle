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

async function seedFounderUser(db: HyperIdleDb, founderId = "test-founder-1"): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(users)
		.values({
			id: founderId,
			kind: "human",
			name: "Test Founder",
			email: "test@hyperidle.dev",
			role: "founder",
			status: "active",
			createdAt: now,
		})
		.onConflictDoNothing();
}

describe("M3 — Auth middleware: createAuthMiddleware(db) (A3)", () => {
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

	it("sets userId on context from users table (kind=human)", async () => {
		await seedFounderUser(db, "test-founder-1");
		const res = await app.request("/api/auth/me", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { id: string };
		expect(body.id).toBe("test-founder-1");
		expect(body.id).not.toBe("u-founder");
	});

	it("falls back to u-founder when no human user is seeded (backward compat)", async () => {
		const res = await app.request("/api/auth/me", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { id: string };
		expect(body.id).toBe("u-founder");
	});

	it("returns 401 when no API key is provided", async () => {
		const res = await app.request("/api/auth/me");
		expect(res.status).toBe(401);
	});
});

describe("M3 — GET /api/auth/me returns full identity from users table (A4)", () => {
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
		await seedFounderUser(db, "test-founder-1");
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle?.close();
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

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle?.close();
	});

	it("revision log actor is the seeded human user id, NOT 'u-founder'", async () => {
		await seedFounderUser(db, "test-founder-1");
		const res = await app.request("/api/bets/bet-1", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ field: "hypothesis", value: "New hypothesis", reason: "Test reason" }),
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
