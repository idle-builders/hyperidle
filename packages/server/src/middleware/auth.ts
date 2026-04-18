import { API_ERROR_CODES } from "@hyperidle/shared";
import type { ApiErrorResponse } from "@hyperidle/shared";
import type { MiddlewareHandler } from "hono";
import { constantTimeStringEqual } from "./timing-safe.js";

/**
 * API key authentication middleware.
 * Checks X-API-Key header against HYPERIDLE_API_KEY env var.
 *
 * @lore I2 A1: comparison goes through a SHA-256-padded constant-time
 * comparator. Even when the caller supplies no key (`apiKey === undefined`)
 * we still run the comparator against a fixed empty string so authentication
 * latency is independent of header presence.
 */
export const authMiddleware: MiddlewareHandler = async (c, next) => {
	const apiKey = c.req.header("X-API-Key") ?? "";
	const expectedKey = process.env.HYPERIDLE_API_KEY ?? "";

	const ok = expectedKey.length > 0 && constantTimeStringEqual(apiKey, expectedKey);

	if (!ok) {
		const response: ApiErrorResponse = {
			error: "Missing or invalid API key",
			code: API_ERROR_CODES.UNAUTHORIZED,
		};
		return c.json(response, 401);
	}

	await next();
};
