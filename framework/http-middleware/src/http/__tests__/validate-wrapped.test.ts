/**
 * F. Validate.ts Wrapped zValidator Tests
 *
 * These tests verify `packages/server/src/middleware/validate.ts` is updated
 * to export a pre-configured zValidator wrapper and validationHook.
 *
 * @lore api-typesafety RED phase: `validationHook` and the updated
 * `validateBody` (now delegating to zValidator + validationHook) don't exist
 * yet. Once implemented, the import path for @hono/zod-validator should
 * differ from the wrapped version.
 */

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { z } from "zod";

// The wrapped exports that don't exist yet
import { validateBody, validationHook } from "../validate.js";

describe("F1. validateBody returns 400 with ApiErrorResponse format on failure", () => {
	it("returns 400 with VALIDATION_ERROR code when body is invalid", async () => {
		const schema = z.object({
			name: z.string(),
			count: z.number().int().min(1),
		});

		const app = new Hono();
		app.post("/test", validateBody(schema), (c) => c.json({ ok: true }));

		const res = await app.request("/test", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "test", count: 0 }), // count < 1
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as { code: string; error: string };
		expect(body.code).toBe("VALIDATION_ERROR");
		expect(typeof body.error).toBe("string");
	});

	it("passes valid body through", async () => {
		const schema = z.object({ name: z.string() });

		const app = new Hono();
		app.post("/test", validateBody(schema), (c) => c.json({ ok: true }));

		const res = await app.request("/test", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "Alice" }),
		});

		expect(res.status).toBe(200);
	});

	it("returns 400 with details.issues on validation failure", async () => {
		const schema = z.object({
			email: z.string().email(),
			age: z.number().min(18),
		});

		const app = new Hono();
		app.post("/test", validateBody(schema), (c) => c.json({ ok: true }));

		const res = await app.request("/test", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "not-an-email", age: 10 }),
		});

		expect(res.status).toBe(400);
		const body = (await res.json()) as { code: string; details?: { issues: unknown[] } };
		expect(body.code).toBe("VALIDATION_ERROR");
		expect(body.details?.issues).toBeDefined();
		expect(Array.isArray(body.details?.issues)).toBe(true);
		expect((body.details?.issues ?? []).length).toBeGreaterThan(0);
	});
});

describe("F2. validationHook is exported", () => {
	it("validationHook is a function", () => {
		expect(typeof validationHook).toBe("function");
	});

	it("validationHook returns a response on failure", () => {
		// Create a mock zod validation failure and context
		const mockIssues = [{ path: ["name"], message: "Required" }];
		const mockFailResult = {
			success: false as const,
			error: { issues: mockIssues },
		};

		// Mock context
		let capturedResponse: unknown = null;
		const mockContext = {
			json: (body: unknown, status: number) => {
				capturedResponse = { status, body };
				return { status, body };
			},
		};

		// Call the hook with a failed result
		const result = validationHook(
			mockFailResult as Parameters<typeof validationHook>[0],
			mockContext as Parameters<typeof validationHook>[1],
		);

		// If validation fails, the hook should return a response
		expect(result).toBeDefined();
		expect(capturedResponse).not.toBeNull();
	});
});

describe("F3. validateBody import path differs from direct @hono/zod-validator", () => {
	it("validate.ts exports validateBody (not re-exported from @hono/zod-validator directly)", async () => {
		// This test simply checks the module exists and exports the expected symbols
		const mod = await import("../../index.js");
		expect(mod.validateBody).toBeDefined();
		expect(typeof mod.validateBody).toBe("function");
	});

	it("validationHook is exported from validate.ts (not available from @hono/zod-validator directly)", async () => {
		const mod = await import("../../index.js");
		expect(mod.validationHook).toBeDefined();
		expect(typeof mod.validationHook).toBe("function");
	});
});
