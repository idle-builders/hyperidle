/**
 * The auth middleware: the X-API-Key is the one credential. A valid key makes
 * the caller the person whose own key it is. The team key with no person bound
 * resolves to nobody (""). The x-hyperidle-actor-id header is ignored.
 * X-HyperIdle-Run is honoured only for an agent's key — a human key never gets a run context.
 */

import { type HyperIdleDb, users } from "@hyperidle/db";
import { type HyperIdleEnv, RUN_CONTEXT_HEADER } from "@hyperidle/domain-model/http";
import { giveUserKey } from "@hyperidle/user";
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

async function seedAgent(db: HyperIdleDb, id: string): Promise<void> {
	await db
		.insert(users)
		.values({
			id,
			kind: "ai",
			name: `Agent ${id}`,
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

/** A probe that also exposes the run context, to test X-HyperIdle-Run wiring. */
function makeRunProbeApp(db: HyperIdleDb): Hono<HyperIdleEnv> {
	const app = new Hono<HyperIdleEnv>();
	app.use("*", createAuthMiddleware({ db }));
	app.get("/probe", (c) => c.json({ userId: c.get("userId"), run: c.get("run") ?? null }));
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
		await giveUserKey(db, "u-auth-human", TEST_API_KEY);
		const res = await makeProbeApp(db).request("/probe", {
			headers: { "X-API-Key": TEST_API_KEY },
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ userId: "u-auth-human" });
	});

	test("with several humans, the key resolves to the one it is bound to", async ({ db }) => {
		await seedHuman(db, "u-auth-first");
		await seedHuman(db, "u-auth-second");
		await giveUserKey(db, "u-auth-first", TEST_API_KEY);
		const res = await makeProbeApp(db).request("/probe", {
			headers: { "X-API-Key": TEST_API_KEY },
		});
		expect(await res.json()).toEqual({ userId: "u-auth-first" });
	});

	test("x-hyperidle-actor-id is ignored — the caller is the key holder, not the named override", async ({
		db,
	}) => {
		await seedHuman(db, "u-auth-human");
		await giveUserKey(db, "u-auth-human", TEST_API_KEY);
		const res = await makeProbeApp(db).request("/probe", {
			headers: { "X-API-Key": TEST_API_KEY, "x-hyperidle-actor-id": "agent-1" },
		});
		expect(res.status).toBe(200);
		// Must resolve to the key holder, never to the header value.
		expect(await res.json()).toEqual({ userId: "u-auth-human" });
	});

	test("the team key with no person bound resolves to nobody", async ({ db }) => {
		// No person has been given this key — it is the team key only.
		const res = await makeProbeApp(db).request("/probe", {
			headers: { "X-API-Key": TEST_API_KEY },
		});
		expect(await res.json()).toEqual({ userId: "" });
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

describe("X-HyperIdle-Run — only an agent's key may carry a run context", () => {
	const RUN_HEADER_VALUE = JSON.stringify({ sessionId: "s-1", taskId: "t-1", threadId: null });

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("agent key with run header sets the run context on the request", async ({ db }) => {
		await seedAgent(db, "u-auth-agent");
		await giveUserKey(db, "u-auth-agent", TEST_API_KEY);
		const res = await makeRunProbeApp(db).request("/probe", {
			headers: { "X-API-Key": TEST_API_KEY, [RUN_CONTEXT_HEADER]: RUN_HEADER_VALUE },
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { userId: string; run: unknown };
		expect(body.userId).toBe("u-auth-agent");
		expect(body.run).toMatchObject({ sessionId: "s-1", taskId: "t-1", threadId: null });
	});

	test("human key with run header does not get a run context", async ({ db }) => {
		await seedHuman(db, "u-auth-human-run");
		await giveUserKey(db, "u-auth-human-run", TEST_API_KEY);
		const res = await makeRunProbeApp(db).request("/probe", {
			headers: { "X-API-Key": TEST_API_KEY, [RUN_CONTEXT_HEADER]: RUN_HEADER_VALUE },
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { userId: string; run: unknown };
		expect(body.userId).toBe("u-auth-human-run");
		expect(body.run).toBeNull();
	});
});
