/**
 * The auth middleware: the X-API-Key is the one credential. A valid key makes
 * the caller the person on the users table (the first human row), or the
 * agent the composition root names in the actor-override header. There are no
 * login sessions, no invite codes and no bearer tokens.
 */

import { CORE_API_ACTOR_OVERRIDE_HEADER } from "@hyperidle/api-contract";
import { type HyperIdleDb, users } from "@hyperidle/db";
import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import { createAuthMiddleware } from "../middleware/auth.js";

const TEST_API_KEY = "test-key-auth-middleware";

async function seedHuman(db: HyperIdleDb, id: string): Promise<void> {
	await db
		.insert(users)
		.values({
			id,
			kind: "human",
			name: `Human ${id}`,
			role: "member",
			status: "active",
			createdAt: new Date().toISOString(),
		})
		.onConflictDoNothing();
}

/** A minimal app that echoes the resolved caller. */
function makeProbeApp(db: HyperIdleDb): Hono<HyperIdleEnv> {
	const app = new Hono<HyperIdleEnv>();
	app.use("*", createAuthMiddleware({ db }));
	app.get("/probe", (c) => c.json({ userId: c.get("userId") }));
	return app;
}

describe("auth middleware — the API key is the one credential", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("a valid key resolves the caller to the human row", async ({ db }) => {
		await seedHuman(db, "u-auth-human");
		const res = await makeProbeApp(db).request("/probe", {
			headers: { "X-API-Key": TEST_API_KEY },
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ userId: "u-auth-human" });
	});

	test("with several humans, the caller is one of them", async ({ db }) => {
		await seedHuman(db, "u-auth-first");
		await seedHuman(db, "u-auth-second");
		const res = await makeProbeApp(db).request("/probe", {
			headers: { "X-API-Key": TEST_API_KEY },
		});
		const body = (await res.json()) as { userId: string };
		expect(["u-auth-first", "u-auth-second"]).toContain(body.userId);
	});

	test("the actor-override header names the caller", async ({ db }) => {
		await seedHuman(db, "u-auth-human");
		const res = await makeProbeApp(db).request("/probe", {
			headers: { "X-API-Key": TEST_API_KEY, [CORE_API_ACTOR_OVERRIDE_HEADER]: "agent-1" },
		});
		expect(await res.json()).toEqual({ userId: "agent-1" });
	});

	test("before the welcome screen made a person, the caller is the placeholder id", async ({
		db,
	}) => {
		const res = await makeProbeApp(db).request("/probe", {
			headers: { "X-API-Key": TEST_API_KEY },
		});
		expect(await res.json()).toEqual({ userId: "u-founder" });
	});

	test("no key is 401 UNAUTHORIZED", async ({ db }) => {
		const res = await makeProbeApp(db).request("/probe");
		expect(res.status).toBe(401);
		expect(((await res.json()) as { code: string }).code).toBe("UNAUTHORIZED");
	});

	test("a wrong key is 401", async ({ db }) => {
		const res = await makeProbeApp(db).request("/probe", { headers: { "X-API-Key": "wrong" } });
		expect(res.status).toBe(401);
	});

	test("a bearer token is not a credential", async ({ db }) => {
		await seedHuman(db, "u-auth-human");
		const res = await makeProbeApp(db).request("/probe", {
			headers: { Authorization: "Bearer anything" },
		});
		expect(res.status).toBe(401);
	});
});

describe("the current user is open_user, not an auth route", () => {
	test("GET /api/auth/me is not a route", async ({ app }) => {
		const res = await app.request("/api/auth/me");
		expect(res.status).toBe(404);
	});
});
