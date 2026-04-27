/**
 * L2 — Founder/Actor Routing Schema (red phase, GET /api/me).
 *
 * Pins the contract from `docs/work-packages/TRACK-L.md` L2 and
 * `.plan-L2.md` §3.4 (`/api/me`):
 *
 *   - 200: returns { id, role, domain_tags } when X-Actor-Id resolves
 *   - 200: env-fallback HYPERIDLE_DEFAULT_ACTOR_ID when header is absent
 *   - 404: X-Actor-Id references a non-existent actor row
 *   - 401: no header, no env fallback
 *
 * These tests MUST fail today: the route does not exist; the actors table
 * does not exist; the auth middleware does not resolve actor identity.
 */
import { createTestDb, type HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { sql } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-l2-me";
const NOW = "2026-04-26T12:00:00.000Z";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

function seedActors(db: HyperIdleDb): void {
	db.run(
		sql.raw(
			`INSERT INTO actors (id, role, domain_tags, created_at) VALUES ('actor:ceo','CEO','["market","growth","portfolio"]','${NOW}')`,
		),
	);
	db.run(
		sql.raw(
			`INSERT INTO actors (id, role, domain_tags, created_at) VALUES ('actor:cpo','CPO','["product","design","tech","content"]','${NOW}')`,
		),
	);
}

describe("L2: GET /api/me", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		// Ensure clean state — tests opt-in to the env fallback explicitly.
		vi.stubEnv("HYPERIDLE_DEFAULT_ACTOR_ID", "");
		db = createTestDb();
		seedActors(db);
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns 200 with the actor body when X-Actor-Id is valid", async () => {
		const res = await app.request("/api/me", {
			headers: authHeaders({ "X-Actor-Id": "actor:ceo" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			id: string;
			role: string;
			domain_tags: string[];
		};
		expect(body.id).toBe("actor:ceo");
		expect(body.role).toBe("CEO");
		expect(Array.isArray(body.domain_tags)).toBe(true);
		expect(body.domain_tags).toEqual(expect.arrayContaining(["market", "growth", "portfolio"]));
	});

	it("returns 200 with the env-fallback actor when the header is absent", async () => {
		vi.stubEnv("HYPERIDLE_DEFAULT_ACTOR_ID", "actor:cpo");
		const res = await app.request("/api/me", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { id: string; role: string };
		expect(body.id).toBe("actor:cpo");
		expect(body.role).toBe("CPO");
	});

	it("returns 404 when X-Actor-Id references an unknown actor", async () => {
		const res = await app.request("/api/me", {
			headers: authHeaders({ "X-Actor-Id": "actor:ghost" }),
		});
		expect(res.status).toBe(404);
		const body = (await res.json()) as { error: string; code: string };
		expect(body.code).toBe("NOT_FOUND");
	});

	it("returns 401 when no actor is identifiable (no header, no env)", async () => {
		const res = await app.request("/api/me", { headers: authHeaders() });
		expect(res.status).toBe(401);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe("UNAUTHORIZED");
	});

	it("returns 401 when API key is missing/wrong (existing auth still applies)", async () => {
		const res = await app.request("/api/me", {
			headers: { "X-Actor-Id": "actor:ceo", "Content-Type": "application/json" },
		});
		expect(res.status).toBe(401);
	});
});
