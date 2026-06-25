/**
 * AN2 — Minimal JSON Schema → Zod converter.
 *
 * Converts the MCP-common JSON Schema subset (object/string/number/integer/
 * boolean/array/enum/required) to a Zod schema for use as RegisteredTool.inputSchema.
 *
 * Anything exotic degrades to z.unknown(). Non-object root schemas degrade to a
 * loose object (z.object({})) because RegisteredTool.inputSchema must parse the
 * args object the harness sends (which is always an object, never a raw primitive).
 *
 * @lore AN2: No eval, no $ref resolution, no schema downloading. The external
 * server still validates its own input; we only need enough fidelity for the
 * harness to present sensible tool parameters and for the handler to receive
 * typed args.
 *
 * @lore AN2: We do NOT use a third-party json-schema-to-zod library to avoid
 * adding dependencies. The MCP-common schema subset is small enough to cover
 * inline (~50 lines).
 */

import z from "zod";

/** Convert one JSON Schema property definition to a Zod type. */
function convertProperty(prop: Record<string, unknown>): z.ZodType {
	// Enum first — applies to any base type
	if (Array.isArray(prop.enum) && prop.enum.length > 0) {
		const vals = prop.enum as [unknown, ...unknown[]];
		// z.enum requires string values; for other types fall through to z.union of literals
		if (vals.every((v) => typeof v === "string")) {
			return z.enum(vals as [string, ...string[]]);
		}
		// Mixed or non-string enum: union of literals
		return z.union(
			(vals as [unknown, unknown, ...unknown[]]).map((v) => z.literal(v as string | number | boolean | null)) as [
				z.ZodTypeAny,
				z.ZodTypeAny,
				...z.ZodTypeAny[],
			],
		);
	}

	switch (prop.type) {
		case "string":
			return z.string();
		case "number":
			return z.number();
		case "integer":
			// JSON Schema integer: whole number. Map to z.number() — zod has no integer type.
			return z.number().int();
		case "boolean":
			return z.boolean();
		case "array":
			return z.array(z.unknown());
		case "object": {
			return convertObjectSchema(prop);
		}
		default:
			// Exotic / $ref / unknown type → z.unknown()
			return z.unknown();
	}
}

/** Convert an object-typed JSON Schema to a Zod object. */
function convertObjectSchema(schema: Record<string, unknown>): z.ZodType {
	const properties = (schema.properties as Record<string, Record<string, unknown>> | undefined) ?? {};
	const required = (schema.required as string[] | undefined) ?? [];
	const requiredSet = new Set(required);

	const shape: Record<string, z.ZodType> = {};
	for (const [key, prop] of Object.entries(properties)) {
		const zodType = convertProperty(prop);
		shape[key] = requiredSet.has(key) ? zodType : zodType.optional();
	}

	return z.object(shape);
}

/**
 * Convert a JSON Schema root to a Zod schema.
 *
 * If the root is not `{ type: "object" }` (e.g. it's a scalar type, a $ref, or
 * anything else), we return a loose `z.object({})` — callers always pass an args
 * object, so the schema must accept an object at the top level.
 */
export function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodType {
	if (schema.type !== "object") {
		// Non-object root (string, $ref, null type, etc.) → loose object fallback
		return z.object({});
	}
	return convertObjectSchema(schema);
}
