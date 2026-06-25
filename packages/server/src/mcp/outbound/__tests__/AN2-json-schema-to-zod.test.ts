/**
 * AN2 RED — jsonSchemaToZod unit tests (Task 2)
 *
 * Tests FAIL until:
 *   packages/server/src/mcp/outbound/json-schema-to-zod.ts is created and exports
 *   `jsonSchemaToZod(schema: Record<string, unknown>): z.ZodType`.
 *
 * Covers: object/required/primitives/array/enum convert; exotic → unknown;
 *         non-object root → loose (z.object({})).
 */

import { describe, expect, it } from "vitest";
import { jsonSchemaToZod } from "../json-schema-to-zod.js";

describe("AN2 jsonSchemaToZod — object types", () => {
	it("converts an empty object schema to a zod object that accepts {}", () => {
		const schema = { type: "object", properties: {} };
		const z = jsonSchemaToZod(schema);
		const result = z.safeParse({});
		expect(result.success).toBe(true);
	});

	it("converts an object with a required string property", () => {
		const schema = {
			type: "object",
			properties: { name: { type: "string" } },
			required: ["name"],
		};
		const z = jsonSchemaToZod(schema);

		// Valid: name present
		expect(z.safeParse({ name: "Alice" }).success).toBe(true);

		// Invalid: name missing (required)
		expect(z.safeParse({}).success).toBe(false);
	});

	it("converts an object with an optional property", () => {
		const schema = {
			type: "object",
			properties: { count: { type: "number" } },
		};
		const z = jsonSchemaToZod(schema);

		// Valid: property absent (optional)
		expect(z.safeParse({}).success).toBe(true);

		// Valid: property present
		expect(z.safeParse({ count: 42 }).success).toBe(true);

		// Invalid: wrong type
		expect(z.safeParse({ count: "not a number" }).success).toBe(false);
	});

	it("converts required multiple fields", () => {
		const schema = {
			type: "object",
			properties: {
				id: { type: "string" },
				value: { type: "number" },
			},
			required: ["id", "value"],
		};
		const z = jsonSchemaToZod(schema);

		expect(z.safeParse({ id: "x", value: 1 }).success).toBe(true);
		expect(z.safeParse({ id: "x" }).success).toBe(false);
		expect(z.safeParse({ value: 1 }).success).toBe(false);
	});
});

describe("AN2 jsonSchemaToZod — primitive types", () => {
	it("string type", () => {
		const z = jsonSchemaToZod({
			type: "object",
			properties: { v: { type: "string" } },
			required: ["v"],
		});
		expect(z.safeParse({ v: "hello" }).success).toBe(true);
		expect(z.safeParse({ v: 123 }).success).toBe(false);
	});

	it("number type", () => {
		const z = jsonSchemaToZod({
			type: "object",
			properties: { v: { type: "number" } },
			required: ["v"],
		});
		expect(z.safeParse({ v: 3.14 }).success).toBe(true);
		expect(z.safeParse({ v: "3.14" }).success).toBe(false);
	});

	it("integer type coerces to number", () => {
		const z = jsonSchemaToZod({
			type: "object",
			properties: { v: { type: "integer" } },
			required: ["v"],
		});
		expect(z.safeParse({ v: 42 }).success).toBe(true);
		expect(z.safeParse({ v: "42" }).success).toBe(false);
	});

	it("boolean type", () => {
		const z = jsonSchemaToZod({
			type: "object",
			properties: { v: { type: "boolean" } },
			required: ["v"],
		});
		expect(z.safeParse({ v: true }).success).toBe(true);
		expect(z.safeParse({ v: "true" }).success).toBe(false);
	});

	it("array type", () => {
		const z = jsonSchemaToZod({
			type: "object",
			properties: { v: { type: "array" } },
			required: ["v"],
		});
		expect(z.safeParse({ v: [1, 2, 3] }).success).toBe(true);
		expect(z.safeParse({ v: {} }).success).toBe(false);
	});

	it("enum type restricts values", () => {
		const z = jsonSchemaToZod({
			type: "object",
			properties: { v: { type: "string", enum: ["a", "b", "c"] } },
			required: ["v"],
		});
		expect(z.safeParse({ v: "a" }).success).toBe(true);
		expect(z.safeParse({ v: "d" }).success).toBe(false);
	});
});

describe("AN2 jsonSchemaToZod — exotic schemas", () => {
	it("unknown type degrades to z.unknown() — parses anything", () => {
		const z = jsonSchemaToZod({
			type: "object",
			properties: { v: { type: "SomeExoticType" } },
			required: ["v"],
		});
		// Must not throw; exotic type → z.unknown() → anything passes
		expect(z.safeParse({ v: 123 }).success).toBe(true);
		expect(z.safeParse({ v: null }).success).toBe(true);
	});

	it("$ref schema falls back to loose object", () => {
		const z = jsonSchemaToZod({ $ref: "#/definitions/Foo" });
		// Non-object root → loose object accepts anything object-shaped
		const result = z.safeParse({});
		expect(result.success).toBe(true);
	});

	it("non-object root schema degrades to loose object", () => {
		const z = jsonSchemaToZod({ type: "string" });
		// Root is not an object schema → loose object fallback
		const result = z.safeParse({});
		expect(result.success).toBe(true);
	});
});
