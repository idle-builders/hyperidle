import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { validateBody } from "../middleware/validate.js";

/** Helper: build a mini Hono app that accepts POST /test with a given schema. */
function buildApp(schema: z.ZodTypeAny): Hono {
	const app = new Hono();
	app.post("/test", validateBody(schema), async (c) => {
		// The validated body is stored on the request by zValidator; reading
		// it back via `c.req.json()` avoids the `"json" as never` cast that
		// would be needed with `c.req.valid("json")` on un-typed routes.
		const body = await c.req.json();
		return c.json({ ok: true, data: body });
	});
	return app;
}

describe("validateBody middleware", () => {
	it("validates nested objects correctly", async () => {
		const schema = z.object({
			user: z.object({
				name: z.string(),
				age: z.number(),
			}),
		});
		const app = buildApp(schema);

		// Valid nested object
		const validRes = await app.request("/test", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ user: { name: "Alice", age: 30 } }),
		});
		expect(validRes.status).toBe(200);

		// Invalid nested object (missing age)
		const invalidRes = await app.request("/test", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ user: { name: "Alice" } }),
		});
		expect(invalidRes.status).toBe(400);
		const body = (await invalidRes.json()) as { code: string };
		expect(body.code).toBe("VALIDATION_ERROR");
	});

	it("validates arrays correctly", async () => {
		const schema = z.object({
			tags: z.array(z.string()).min(1),
		});
		const app = buildApp(schema);

		// Valid array
		const validRes = await app.request("/test", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ tags: ["alpha", "beta"] }),
		});
		expect(validRes.status).toBe(200);

		// Empty array (violates min(1))
		const emptyRes = await app.request("/test", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ tags: [] }),
		});
		expect(emptyRes.status).toBe(400);
	});

	it("allows optional fields to be omitted", async () => {
		const schema = z.object({
			required: z.string(),
			optional: z.string().optional(),
		});
		const app = buildApp(schema);

		const res = await app.request("/test", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ required: "present" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			ok: boolean;
			data: { required: string; optional?: string };
		};
		expect(body.data.required).toBe("present");
		expect(body.data.optional).toBeUndefined();
	});

	it("returns VALIDATION_ERROR with issues details on failure", async () => {
		const schema = z.object({
			name: z.string(),
			count: z.number().int().positive(),
		});
		const app = buildApp(schema);

		const res = await app.request("/test", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: 123, count: -1 }),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as {
			code: string;
			error: string;
			details: { issues: unknown[] };
		};
		expect(body.code).toBe("VALIDATION_ERROR");
		expect(body.error).toBe("Validation failed");
		expect(body.details.issues.length).toBeGreaterThan(0);
	});
});
