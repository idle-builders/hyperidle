/**
 * api-contract red phase: AC-1
 *
 * Tests that `validationHook` exists in validate.ts and:
 * 1. Returns a 400 Response with ApiErrorResponse shape on Zod validation failure.
 * 2. Returns void (undefined) on success.
 * 3. Type signature matches @hono/zod-validator's hook discriminated union.
 *
 * IMPORTANT: These tests are written for the TARGET state (after implementation).
 * They will fail until the implementation lands in Phase 3b.
 */

import { zValidator } from "@hono/zod-validator";
import type { ApiErrorResponse } from "@hyperidle/shared";
import { API_ERROR_CODES } from "@hyperidle/shared";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { z } from "zod";
// @ambiguity: The architecture specifies `validationHook` is the new export.
// Until Phase 3b lands, this import will fail because only `validateBody` exists.
// The test is intentionally failing (red phase).
import { validationHook } from "../validate.js";

describe("validationHook — AC-1: exported function exists", () => {
	it("is exported from validate.ts", () => {
		// Will fail: validationHook does not yet exist in the module
		expect(validationHook).toBeDefined();
		expect(typeof validationHook).toBe("function");
	});
});

describe("validationHook — AC-1: returns void on validation success", () => {
	it("passes control to the next handler (returns void) when body is valid", async () => {
		const schema = z.object({ name: z.string() });

		const app = new Hono().post("/test", zValidator("json", schema, validationHook), (c) =>
			c.json({ ok: true }),
		);

		const res = await app.request("/test", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "hello" }),
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toEqual({ ok: true });
	});
});

describe("validationHook — AC-1: returns 400 with ApiErrorResponse on failure", () => {
	it("returns 400 with VALIDATION_ERROR code when body is invalid", async () => {
		const schema = z.object({ name: z.string() });

		const app = new Hono().post("/test", zValidator("json", schema, validationHook), (c) =>
			c.json({ ok: true }),
		);

		const res = await app.request("/test", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: 42 }), // name must be string — invalid
		});

		expect(res.status).toBe(400);

		const body = (await res.json()) as ApiErrorResponse;
		// Must match ApiErrorResponse shape
		expect(body).toHaveProperty("error");
		expect(body).toHaveProperty("code");
		expect(body.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
		// Must include structured errors array / issues
		expect(body).toHaveProperty("details");
		expect((body.details as { issues?: unknown[] })?.issues).toBeDefined();
		expect(Array.isArray((body.details as { issues?: unknown[] })?.issues)).toBe(true);
	});

	it("returns 400 when required field is missing", async () => {
		const schema = z.object({ name: z.string(), count: z.number() });

		const app = new Hono().post("/test", zValidator("json", schema, validationHook), (c) =>
			c.json({ ok: true }),
		);

		const res = await app.request("/test", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "only-name" }), // count missing
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as ApiErrorResponse;
		expect(body.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
	});

	it("does NOT call the handler when validation fails", async () => {
		const schema = z.object({ value: z.number().positive() });
		let handlerCalled = false;

		const app = new Hono().post("/test", zValidator("json", schema, validationHook), (c) => {
			handlerCalled = true;
			return c.json({ ok: true });
		});

		await app.request("/test", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ value: -1 }), // negative — invalid
		});

		expect(handlerCalled).toBe(false);
	});
});
