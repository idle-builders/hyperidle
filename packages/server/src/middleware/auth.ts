import { factorySettings, type HyperIdleDb } from "@hyperidle/db";
import type { ApiErrorResponse } from "@hyperidle/shared";
import { API_ERROR_CODES, createLogger } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { constantTimeStringEqual } from "./timing-safe.js";

/**
 * API key authentication middleware.
 * Checks X-API-Key header against HYPERIDLE_API_KEY env var.
 *
 * @lore I2 A1: comparison goes through a SHA-256-padded constant-time
 * comparator. The `expectedKey.length > 0 &&` short-circuit was DROPPED
 * (review W2): `index.ts` already fails fast on a missing
 * HYPERIDLE_API_KEY before any caller can reach this middleware, so the
 * empty-key path cannot occur in production. Removing the short-circuit
 * keeps every request on the same constant-time code path and removes
 * the test-only timing divergence flagged by L-3.
 *
 * @lore I2 review HIGH-2: every rejected request is WARN-logged with
 * timestamp, request path, method, and source IP (when discoverable).
 * The supplied API key is NEVER logged — only the failure metadata that
 * an incident responder needs to correlate against access logs.
 *
 * @lore M3 A3: converted from static export to factory function so the
 * middleware can read founder_id from factorySettings. The fallback
 * founder constant preserves backward compatibility with unseeded DBs and
 * existing tests that don't seed factorySettings.
 */

/**
 * Hono context type that carries the authenticated user identity.
 * Set by createAuthMiddleware after successful API key validation.
 * All authenticated routes can read `c.get("userId")` after the middleware.
 */
// biome-ignore lint/style/useNamingConvention: `Variables` is the Hono Env property name; the framework requires this exact PascalCase key.
export type HyperIdleEnv = { Variables: { userId: string } };

const authLogger = createLogger({ pkg: "server.auth" });

function readSourceIp(c: Context): string | null {
	if (process.env.HYPERIDLE_TRUST_PROXY === "true") {
		const xff = c.req.header("x-forwarded-for");
		if (xff) {
			const first = xff.split(",")[0]?.trim();
			if (first) return first;
		}
	}
	const env = (c.env ?? {}) as { remoteAddr?: { address?: string } };
	return env.remoteAddr?.address ?? null;
}

/**
 * Create the API key auth middleware with database access for identity lookup.
 * After the API key check succeeds, reads founder_id from factorySettings and
 * sets it on `c.get("userId")`.
 *
 * @lore M3 A3: the middleware does NOT fail if founder_id is missing —
 * it falls back to the hardcoded founder constant for unseeded DBs. This preserves
 * backward compatibility with existing tests that don't seed factorySettings.
 */
export function createAuthMiddleware(db: HyperIdleDb): MiddlewareHandler<HyperIdleEnv> {
	return async (c, next) => {
		const apiKey = c.req.header("X-API-Key") ?? "";
		const expectedKey = process.env.HYPERIDLE_API_KEY ?? "";

		const ok = constantTimeStringEqual(apiKey, expectedKey);

		if (!ok) {
			authLogger.warn("rejected request: invalid or missing API key", {
				path: c.req.path,
				method: c.req.method,
				sourceIp: readSourceIp(c),
			});
			const response: ApiErrorResponse = {
				error: "Missing or invalid API key",
				code: API_ERROR_CODES.UNAUTHORIZED,
			};
			return c.json(response, 401);
		}

		// M3: Set authenticated user identity on context.
		// Read founder_id from factorySettings (single-founder v1).
		const founderRow = db
			.select()
			.from(factorySettings)
			.where(eq(factorySettings.key, "founder_id"))
			.get();
		c.set("userId", founderRow?.value ?? "u-founder");

		await next();
	};
}

/**
 * Stateless auth middleware for use when db is not available (e.g. health checks
 * or the public /api route with no db). Sets userId to a hardcoded founder constant as fallback.
 *
 * @lore M3: kept for backward compat with code paths that don't have db access.
 * Primary path is createAuthMiddleware(db).
 */
export const authMiddleware: MiddlewareHandler = async (c, next) => {
	const apiKey = c.req.header("X-API-Key") ?? "";
	const expectedKey = process.env.HYPERIDLE_API_KEY ?? "";

	const ok = constantTimeStringEqual(apiKey, expectedKey);

	if (!ok) {
		authLogger.warn("rejected request: invalid or missing API key", {
			path: c.req.path,
			method: c.req.method,
			sourceIp: readSourceIp(c),
		});
		const response: ApiErrorResponse = {
			error: "Missing or invalid API key",
			code: API_ERROR_CODES.UNAUTHORIZED,
		};
		return c.json(response, 401);
	}

	await next();
};
