/**
 * Common response Zod schemas: progress, error response, pagination.
 */

import { describe, expect, it } from "vitest";
import { errorResponseSchema, paginationSchema, progressSchema } from "../common.schema.js";

describe("progressSchema", () => {
	it("accepts valid progress { done, total }", () => {
		const result = progressSchema.safeParse({ done: 1, total: 5 });
		expect(result.success).toBe(true);
	});

	it("accepts zero progress", () => {
		const result = progressSchema.safeParse({ done: 0, total: 0 });
		expect(result.success).toBe(true);
	});

	it("rejects non-integers", () => {
		const result = progressSchema.safeParse({ done: 1.5, total: 5 });
		expect(result.success).toBe(false);
	});

	it("rejects negative done", () => {
		const result = progressSchema.safeParse({ done: -1, total: 5 });
		expect(result.success).toBe(false);
	});

	it("rejects missing fields", () => {
		const result = progressSchema.safeParse({ done: 1 });
		expect(result.success).toBe(false);
	});
});

describe("errorResponseSchema", () => {
	it("accepts valid error response { error, code }", () => {
		const result = errorResponseSchema.safeParse({
			error: "Not found",
			code: "NOT_FOUND",
		});
		expect(result.success).toBe(true);
	});

	it("accepts error response with optional details", () => {
		const result = errorResponseSchema.safeParse({
			error: "Validation failed",
			code: "VALIDATION_ERROR",
			details: { issues: [{ message: "required" }] },
		});
		expect(result.success).toBe(true);
	});

	it("rejects payload missing error field", () => {
		const result = errorResponseSchema.safeParse({ code: "NOT_FOUND" });
		expect(result.success).toBe(false);
	});

	it("rejects payload missing code field", () => {
		const result = errorResponseSchema.safeParse({ error: "Something went wrong" });
		expect(result.success).toBe(false);
	});
});

describe("paginationSchema", () => {
	it("accepts valid pagination { limit, offset }", () => {
		const result = paginationSchema.safeParse({ limit: 50, offset: 0 });
		expect(result.success).toBe(true);
	});

	it("accepts pagination with defaults applied", () => {
		// paginationSchema should accept empty object and use defaults
		const result = paginationSchema.safeParse({});
		expect(result.success).toBe(true);
	});

	it("rejects negative offset", () => {
		const result = paginationSchema.safeParse({ limit: 50, offset: -1 });
		expect(result.success).toBe(false);
	});

	it("rejects limit exceeding max", () => {
		const result = paginationSchema.safeParse({ limit: 1000, offset: 0 });
		expect(result.success).toBe(false);
	});
});
