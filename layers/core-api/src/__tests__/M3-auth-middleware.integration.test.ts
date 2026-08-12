/**
 * M3 — Auth middleware: createAuthMiddleware(db) sets userId from users table.
 *
 * @lore P2: Updated from factorySettings.founder_id lookup to users table query.
 * The middleware now queries `users WHERE kind = 'human' LIMIT 1` after API key
 * validation. Tests seed a human user row instead of factorySettings founder_id.
 * The fallback to "u-founder" is preserved for unseeded DBs.
 */

import { bets, type HyperIdleDb, teamMembers, teams, users } from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-m3-auth";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedFounderUser(db: HyperIdleDb, ids: ScopedIds): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(users)
		.values({
			id: ids("founder"),
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
	test("sets userId on context from users table (kind=human)", async ({ app, db, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedFounderUser(db, ids);
		const res = await app.request("/api/auth/me", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { id: string };
		expect(body.id).toBe(ids("founder"));
		expect(body.id).not.toBe("u-founder");
		vi.unstubAllEnvs();
	});

	test("falls back to u-founder when no human user is seeded (backward compat)", async ({
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/auth/me", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { id: string };
		expect(body.id).toBe("u-founder");
		vi.unstubAllEnvs();
	});

	test("returns 401 when no API key is provided", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/auth/me");
		expect(res.status).toBe(401);
		vi.unstubAllEnvs();
	});
});

describe("M3 — GET /api/auth/me returns full identity from users table (A4)", () => {
	test("returns id, name, email, avatarUrl from users table", async ({ app, db, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedFounderUser(db, ids);
		const res = await app.request("/api/auth/me", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			id: string;
			name: string;
			email: string;
			avatarUrl: string | null;
		};
		expect(body.id).toBe(ids("founder"));
		expect(body.name).toBe("Test Founder");
		expect(body.email).toBe("test@hyperidle.dev");
		expect(body.avatarUrl).toBeNull();
		vi.unstubAllEnvs();
	});

	test("response id is NOT the hardcoded 'u-founder'", async ({ app, db, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedFounderUser(db, ids);
		const res = await app.request("/api/auth/me", { headers: authHeaders() });
		const body = (await res.json()) as { id: string };
		expect(body.id).not.toBe("u-founder");
		vi.unstubAllEnvs();
	});
});

describe("M3 — Bets routes: revision log actor comes from auth context (A5)", () => {
	test("revision log actor is the seeded human user id, NOT 'u-founder'", async ({
		app,
		db,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const now = new Date().toISOString();
		await db
			.insert(teams)
			.values({ id: ids("team"), name: "Test Product", phase: "build", createdAt: now });

		await db.insert(teamMembers).values({
			id: ids("tm"),
			teamId: ids("team"),
			capacity: 3,
			activeBets: 0,
			formedAt: now,
		});

		// @lore U1: bets.teamId references `teams` (domain entity), not `teamMembers`.
		await db.insert(bets).values({
			id: ids("bet"),
			teamId: ids("team"),
			description: "Test bet",
			status: "active",
			createdAt: now,
		});

		await seedFounderUser(db, ids);
		const res = await app.request(`/api/bets/${ids("bet")}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ field: "hypothesis", value: "New hypothesis", reason: "Test reason" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { revisionLog?: string };
		const log = body.revisionLog ? (JSON.parse(body.revisionLog) as Array<{ actor: string }>) : [];
		expect(log.length).toBeGreaterThan(0);
		const lastEntry = log[log.length - 1];
		expect(lastEntry?.actor).toBe(ids("founder"));
		expect(lastEntry?.actor).not.toBe("u-founder");
		vi.unstubAllEnvs();
	});
});
