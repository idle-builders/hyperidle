/**
 * C. Response Validator Middleware Tests
 *
 * These tests verify `packages/server/src/middleware/response-validator.ts`
 * (not yet created) — always-on middleware that validates 2xx JSON responses
 * against a declared Zod schema, returning 500 on mismatch.
 *
 * @lore api-typesafety RED phase: will fail until response-validator.ts is
 * created. Tests define the contract: validate 2xx JSON, pass through
 * non-JSON and error responses unchanged.
 */

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
	responseValidator,
	registerResponseSchema,
	getResponseSchema,
} from "../../middleware/response-validator.js";

// ── helpers ──────────────────────────────────────────────────────────────────

const itemSchema = z.object({ id: z.string(), name: z.string() });

function buildApp(): Hono {
	const app = new Hono();
	app.use("*", responseValidator());
	return app;
}

// ── C1: non-JSON responses pass through ─────────────────────────────────────

describe("C1. non-JSON responses pass through unchanged", () => {
	it("passes through text/plain response", async () => {
		const app = buildApp();
		app.get("/text", (c) => c.text("hello"));

		const res = await app.request("/text");
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("hello");
	});

	it("passes through HTML response", async () => {
		const app = buildApp();
		app.get("/html", (c) => c.html("<p>hello</p>"));

		const res = await app.request("/html");
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("hello");
	});
});

// ── C2: error responses pass through ─────────────────────────────────────────

describe("C2. error responses (4xx, 5xx) pass through unchanged", () => {
	it("passes through 400 response without validation", async () => {
		const app = buildApp();
		app.get("/bad-request", (c) => c.json({ error: "bad", code: "BAD" }, 400));

		const res = await app.request("/bad-request");
		expect(res.status).toBe(400);
		const body = await res.json() as { error: string };
		expect(body.error).toBe("bad");
	});

	it("passes through 404 response without validation", async () => {
		const app = buildApp();
		app.get("/not-found", (c) => c.json({ error: "Not found", code: "NOT_FOUND" }, 404));

		const res = await app.request("/not-found");
		expect(res.status).toBe(404);
	});

	it("passes through 500 response without double-wrapping", async () => {
		const app = buildApp();
		app.get("/server-error", (c) => c.json({ error: "crash", code: "INTERNAL_ERROR" }, 500));

		const res = await app.request("/server-error");
		expect(res.status).toBe(500);
		const body = await res.json() as { error: string };
		expect(body.error).toBe("crash");
	});
});

// ── C3: validates 2xx JSON against registered schema ──────────────────────────

describe("C3. validates 2xx JSON responses against registered schema", () => {
	it("passes through valid 200 response matching registered schema", async () => {
		const app = buildApp();

		// Register a schema for GET /items
		registerResponseSchema("GET", "/items", itemSchema);

		app.get("/items", (c) => c.json({ id: "item-1", name: "Widget" }));

		const res = await app.request("/items");
		expect(res.status).toBe(200);
		const body = await res.json() as { id: string; name: string };
		expect(body.id).toBe("item-1");
		expect(body.name).toBe("Widget");
	});

	it("passes through 201 response matching registered schema", async () => {
		const app = buildApp();
		const createSchema = z.object({ id: z.string(), created: z.boolean() });
		registerResponseSchema("POST", "/items", createSchema);

		app.post("/items", (c) => c.json({ id: "new-1", created: true }, 201));

		const res = await app.request("/items", { method: "POST" });
		expect(res.status).toBe(201);
	});
});

// ── C4: returns 500 on schema mismatch ─────────────────────────────────────────

describe("C4. returns 500 with SCHEMA_VIOLATION code on mismatch", () => {
	it("returns 500 when response body does not match registered schema", async () => {
		const app = buildApp();
		const strictSchema = z.object({ id: z.string(), count: z.number() });
		registerResponseSchema("GET", "/strict-items", strictSchema);

		// Route returns wrong shape (missing count)
		app.get("/strict-items", (c) => c.json({ id: "item-1", notCount: "oops" }));

		const res = await app.request("/strict-items");
		expect(res.status).toBe(500);
		const body = await res.json() as { code: string; error: string };
		expect(body.code).toBe("SCHEMA_VIOLATION");
		expect(typeof body.error).toBe("string");
	});

	it("returns 500 when response has extra strict fields that aren't allowed", async () => {
		const app = buildApp();
		const strictSchema = z.object({ id: z.string() }).strict();
		registerResponseSchema("GET", "/strict-only", strictSchema);

		// Route returns extra field not in schema
		app.get("/strict-only", (c) => c.json({ id: "1", extra: "data" }));

		const res = await app.request("/strict-only");
		// Strict schema would reject extra fields
		expect(res.status).toBe(500);
	});

	it("SCHEMA_VIOLATION response is itself a valid ApiErrorResponse shape", async () => {
		const app = buildApp();
		const strictSchema = z.object({ required: z.string() });
		registerResponseSchema("GET", "/mismatch", strictSchema);

		app.get("/mismatch", (c) => c.json({ wrong: "field" }));

		const res = await app.request("/mismatch");
		expect(res.status).toBe(500);
		const body = await res.json() as { error: string; code: string };
		expect(body).toHaveProperty("error");
		expect(body).toHaveProperty("code");
		expect(body.code).toBe("SCHEMA_VIOLATION");
	});
});

// ── C5: routes with no registered schema pass through ───────────────────────

describe("C5. routes with no registered schema pass through unchanged", () => {
	it("passes 200 JSON response without a registered schema", async () => {
		const app = buildApp();
		// No registerResponseSchema call for this route
		app.get("/unregistered", (c) => c.json({ anything: "goes" }));

		const res = await app.request("/unregistered");
		expect(res.status).toBe(200);
		const body = await res.json() as { anything: string };
		expect(body.anything).toBe("goes");
	});
});

// ── C6: registerResponseSchema API ──────────────────────────────────────────

describe("C6. registerResponseSchema API", () => {
	it("registers and retrieves a schema by method + path", () => {
		const schema = z.object({ id: z.string() });
		registerResponseSchema("GET", "/test-schema", schema);

		const retrieved = getResponseSchema("GET", "/test-schema");
		expect(retrieved).toBe(schema);
	});

	it("returns undefined for unregistered route", () => {
		const retrieved = getResponseSchema("GET", "/not-registered-anywhere");
		expect(retrieved).toBeUndefined();
	});

	it("different methods get different schemas", () => {
		const getSchema = z.object({ items: z.array(z.string()) });
		const postSchema = z.object({ created: z.boolean() });

		registerResponseSchema("GET", "/dual-method", getSchema);
		registerResponseSchema("POST", "/dual-method", postSchema);

		expect(getResponseSchema("GET", "/dual-method")).toBe(getSchema);
		expect(getResponseSchema("POST", "/dual-method")).toBe(postSchema);
	});
});
