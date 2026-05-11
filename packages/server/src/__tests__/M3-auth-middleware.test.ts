/**
 * M3 RED — Auth middleware: createAuthMiddleware(db) sets userId from factorySettings.
 *
 * These tests FAIL until:
 *  - createAuthMiddleware(db) is implemented
 *  - factorySettings are seeded with founder_id
 *  - GET /api/auth/me returns identity from factorySettings
 *
 * C1 (critique): seed target is seed.ts + seed-pg.ts, NOT seed-fixtures.ts.
 */

import {
	bets,
	createTestDb,
	factorySettings,
	type HyperIdleDb,
	products,
	teams,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-m3-auth";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

function seedFounderSettings(db: HyperIdleDb, founderId = "test-founder-1"): void {
	const now = new Date().toISOString();
	db.insert(factorySettings)
		.values({ key: "founder_id", value: founderId, updatedAt: now })
		.onConflictDoNothing()
		.run();
	db.insert(factorySettings)
		.values({ key: "founder_name", value: "Test Founder", updatedAt: now })
		.onConflictDoNothing()
		.run();
	db.insert(factorySettings)
		.values({ key: "founder_email", value: "test@hyperidle.dev", updatedAt: now })
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

	it("sets userId on context from factorySettings founder_id", async () => {
		seedFounderSettings(db, "test-founder-1");

		// Probe via GET /api/auth/me which returns c.get("userId")
		const res = await app.request("/api/auth/me", { headers: authHeaders() });

		// Endpoint must exist and return the seeded founder id (not "u-founder")
		expect(res.status).toBe(200);
		const body = (await res.json()) as { id: string };
		expect(body.id).toBe("test-founder-1");
		expect(body.id).not.toBe("u-founder");
	});

	it("falls back to u-founder when factorySettings has no founder_id (backward compat)", async () => {
		// Do NOT seed founder_id
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

describe("M3 — GET /api/auth/me returns full identity from factorySettings (A4)", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });
		seedFounderSettings(db, "test-founder-1");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns id, name, email, avatarUrl from factorySettings", async () => {
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
		db.insert(products)
			.values({ id: "prod-1", name: "Test Product", phase: "build", createdAt: now })
			.run();
		db.insert(teams)
			.values({
				id: "team-1",
				productId: "prod-1",
				capacity: 3,
				activeBets: 0,
				formedAt: now,
			})
			.run();
		db.insert(bets)
			.values({
				id: "bet-1",
				productId: "prod-1",
				teamId: "team-1",
				pitch: "Test bet",
				status: "in_progress",
				createdAt: now,
			})
			.run();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("revision log actor is the seeded founder_id, NOT 'u-founder'", async () => {
		seedFounderSettings(db, "test-founder-1");

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
