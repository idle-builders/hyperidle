import type { ApiErrorResponse } from "@hyperidle/shared";
import { API_ERROR_CODES, createLogger } from "@hyperidle/shared";
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
 */

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
