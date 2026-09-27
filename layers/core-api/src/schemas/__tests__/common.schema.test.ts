/**
 * Common response Zod schemas: progress, error response, pagination.
 */

import { describe, expect, it } from "vitest";
import { errorResponseSchema, paginationSchema, progressSchema } from "../common.schema.js";

describe("progressSchema", () => {
	it.each([
		["valid progress", { done: 1, total: 5 }, true],
		["zero progress", { done: 0, total: 0 }, true],
		["non-integer done", { done: 1.5, total: 5 }, false],
		["negative done", { done: -1, total: 5 }, false],
		["missing total", { done: 1 }, false],
	] as const)("%s -> valid=%s", (_label, input, valid) => {
		expect(progressSchema.safeParse(input).success).toBe(valid);
	});
});

describe("errorResponseSchema", () => {
	it.each([
		["error + code", { error: "Not found", code: "NOT_FOUND" }, true],
		[
			"error + code + optional details",
			{
				error: "Validation failed",
				code: "VALIDATION_ERROR",
				details: { issues: [{ message: "required" }] },
			},
			true,
		],
		["missing error field", { code: "NOT_FOUND" }, false],
		["missing code field", { error: "Something went wrong" }, false],
	] as const)("%s -> valid=%s", (_label, input, valid) => {
		expect(errorResponseSchema.safeParse(input).success).toBe(valid);
	});
});

describe("paginationSchema", () => {
	it.each([
		["valid limit + offset", { limit: 50, offset: 0 }, true],
		["empty object uses defaults", {}, true],
		["negative offset", { limit: 50, offset: -1 }, false],
		["limit exceeding max", { limit: 1000, offset: 0 }, false],
	] as const)("%s -> valid=%s", (_label, input, valid) => {
		expect(paginationSchema.safeParse(input).success).toBe(valid);
	});
});
