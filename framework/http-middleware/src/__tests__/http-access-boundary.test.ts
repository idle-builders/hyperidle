/**
 * The AF11 access-boundary primitives, in their new home: `@hyperidle/http-middleware`.
 *
 * They live in `shared` because both HTTP applications need them and neither may
 * import the other's route module. Behaviour is unchanged from the core-api
 * middleware they were extracted from — these tests pin it.
 */
import { Hono } from "hono";
import { afterEach, describe, expect, test, vi } from "vitest";
import { failClosedAssertion, requireBoundary } from "../http/access-boundary.js";
import type { HyperIdleEnv } from "../http/env.js";

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("requireBoundary", () => {
	test("stamps the declared boundary kind on the context and runs the handler", async () => {
		const app = new Hono<HyperIdleEnv>();
		app.get("/thing", requireBoundary({ kind: "enforced" }), (c) =>
			c.json({ boundary: c.get("__boundary") }),
		);

		const res = await app.request("/thing");

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ boundary: "enforced" });
	});

	test("carries each of the three boundary kinds through", async () => {
		const app = new Hono<HyperIdleEnv>();
		app.get("/self", requireBoundary({ kind: "principal-self" }), (c) =>
			c.json({ boundary: c.get("__boundary") }),
		);
		app.get("/public", requireBoundary({ kind: "public-data" }), (c) =>
			c.json({ boundary: c.get("__boundary") }),
		);

		expect(await (await app.request("/self")).json()).toEqual({ boundary: "principal-self" });
		expect(await (await app.request("/public")).json()).toEqual({ boundary: "public-data" });
	});
});

describe("failClosedAssertion", () => {
	test("throws outside production when a matched route declared no boundary", async () => {
		vi.stubEnv("NODE_ENV", "test");
		const app = new Hono<HyperIdleEnv>();
		let thrown: Error | null = null;
		app.onError((err, c) => {
			thrown = err;
			return c.text("caught", 500);
		});
		app.use("*", failClosedAssertion());
		app.get("/undeclared", (c) => c.json({ ok: true }));

		const res = await app.request("/undeclared");

		expect(res.status).toBe(500);
		expect((thrown as Error | null)?.message).toMatch(
			/undeclared route boundary: GET \/undeclared/,
		);
	});

	test("stays silent when the route declared a boundary", async () => {
		vi.stubEnv("NODE_ENV", "test");
		const app = new Hono<HyperIdleEnv>();
		app.use("*", failClosedAssertion());
		app.get("/declared", requireBoundary({ kind: "enforced" }), (c) => c.json({ ok: true }));

		const res = await app.request("/declared");

		expect(res.status).toBe(200);
	});

	test("does not fire on an unmatched path (a 404 is not an undeclared data route)", async () => {
		vi.stubEnv("NODE_ENV", "test");
		const app = new Hono<HyperIdleEnv>();
		app.use("*", failClosedAssertion());
		app.get("/declared", requireBoundary({ kind: "enforced" }), (c) => c.json({ ok: true }));

		const res = await app.request("/no-such-route");

		expect(res.status).toBe(404);
	});

	test("in production it does not throw — lint is the real gate", async () => {
		vi.stubEnv("NODE_ENV", "production");
		const app = new Hono<HyperIdleEnv>();
		app.use("*", failClosedAssertion());
		app.get("/undeclared", (c) => c.json({ ok: true }));

		const res = await app.request("/undeclared");

		expect(res.status).toBe(200);
	});
});
