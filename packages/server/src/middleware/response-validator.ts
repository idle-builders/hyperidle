/**
 * Response validator middleware.
 *
 * Always-on middleware that validates 2xx JSON responses against a declared
 * Zod schema. If the response body does not match, returns 500 with a
 * SCHEMA_VIOLATION code instead of leaking malformed data to the client.
 *
 * Usage:
 *   1. Register a schema: registerResponseSchema("GET", "/api/bets", betListResponseSchema)
 *   2. Add the middleware: app.use("*", responseValidator())
 *
 * @lore api-typesafety: The schema registry uses a module-level Map keyed by
 * "METHOD /path" so schemas are registered once at startup and matched
 * synchronously. The middleware clones and reads the response body only when
 * a schema is registered AND the response is 2xx JSON — other responses pass
 * through untouched.
 */

import type { Context, MiddlewareHandler } from "hono";
import { z } from "zod";

// ── Registry ──────────────────────────────────────────────────────────────────

const schemaRegistry = new Map<string, z.ZodTypeAny>();

function registryKey(method: string, path: string): string {
	return `${method.toUpperCase()} ${path}`;
}

/**
 * Register a Zod schema for a specific method + path combination.
 * The response validator middleware will validate 2xx JSON responses
 * against this schema.
 */
export function registerResponseSchema(method: string, path: string, schema: z.ZodTypeAny): void {
	schemaRegistry.set(registryKey(method, path), schema);
}

/**
 * Retrieve the registered Zod schema for a method + path, or undefined
 * if no schema has been registered.
 */
export function getResponseSchema(method: string, path: string): z.ZodTypeAny | undefined {
	return schemaRegistry.get(registryKey(method, path));
}

// ── Middleware factory ─────────────────────────────────────────────────────────

/**
 * Factory that returns a Hono middleware which validates 2xx JSON responses.
 *
 * - Non-JSON responses: pass through unchanged
 * - 4xx/5xx responses: pass through unchanged
 * - 2xx JSON with no registered schema: pass through unchanged
 * - 2xx JSON with a registered schema: validate; return 500 on mismatch
 */
export function responseValidator(): MiddlewareHandler {
	return async (c: Context, next: () => Promise<void>): Promise<void | Response> => {
		await next();

		const res = c.res;

		// Only intercept 2xx responses
		if (res.status < 200 || res.status >= 300) {
			return;
		}

		// Only intercept JSON responses
		const contentType = res.headers.get("content-type") ?? "";
		if (!contentType.includes("application/json")) {
			return;
		}

		// Look up the schema for this method + path
		const method = c.req.method;
		const path = c.req.path;
		const schema = getResponseSchema(method, path);

		if (!schema) {
			// No schema registered — pass through
			return;
		}

		// Clone the response to read the body without consuming it
		const cloned = res.clone();
		let body: unknown;
		try {
			body = await cloned.json();
		} catch {
			// Not valid JSON (shouldn't happen given content-type check, but be safe)
			return;
		}

		// Validate against the schema
		const result = schema.safeParse(body);
		if (!result.success) {
			const violation = {
				error: `Response body does not match registered schema for ${method} ${path}`,
				code: "SCHEMA_VIOLATION",
				details: {
					issues: result.error.issues,
				},
			};
			c.res = new Response(JSON.stringify(violation), {
				status: 500,
				headers: { "content-type": "application/json" },
			});
			return;
		}
	};
}
