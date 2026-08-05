import type { HyperIdleDb } from "@hyperidle/db";
import type { ApiErrorResponse } from "@hyperidle/shared";
import { API_ERROR_CODES, createLogger } from "@hyperidle/shared";
import { constantTimeStringEqual, type HyperIdleEnv } from "@hyperidle/shared/http";
import { findUser, validateBearerToken } from "@hyperidle/users";
import type { Context, MiddlewareHandler } from "hono";
import { CORE_API_ACTOR_OVERRIDE_HEADER } from "../services/actor-transport-header.js";

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
 *
 * @lore S1 SF-2: signature changed from (db: HyperIdleDb) to
 * (options: AuthMiddlewareOptions) to support dual-strategy auth in shared
 * mode. All callers updated accordingly.
 */

/**
 * Options for the auth middleware factory.
 *
 * @lore S1 SF-2: The signature change from (db: HyperIdleDb) to
 * (options: AuthMiddlewareOptions) is a breaking change. All callers
 * (app.ts, test files) updated to use the new options object form.
 */
export interface AuthMiddlewareOptions {
	db: HyperIdleDb;
	sharedMode: boolean;
}

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

function rejectUnauthorized(c: Context, message: string, logMessage: string): Response {
	authLogger.warn(logMessage, {
		path: c.req.path,
		method: c.req.method,
		sourceIp: readSourceIp(c),
	});
	const response: ApiErrorResponse = {
		error: message,
		code: API_ERROR_CODES.UNAUTHORIZED,
	};
	return c.json(response, 401);
}

/**
 * Handle Bearer token validation in shared mode.
 * Returns a Response on auth failure, or null if auth should fall through.
 *
 * @lore S1: Extracted to reduce cognitive complexity of createAuthMiddleware.
 * Returns null on INVALID_TOKEN so the caller can fall through to API key check.
 * Returns a Response on SESSION_EXPIRED or SESSION_REVOKED (hard stop).
 */
async function handleBearerAuth(
	c: Context<HyperIdleEnv>,
	db: HyperIdleDb,
	token: string,
): Promise<Response | null | "ok"> {
	const result = await validateBearerToken(db, token);

	if (result.ok) {
		c.set("userId", result.session.userId);
		c.set("authMethod", "login_session");
		c.set("loginSessionId", result.session.id);
		return "ok";
	}

	if (result.reason === "SESSION_EXPIRED") {
		authLogger.warn("rejected request: session expired", {
			path: c.req.path,
			method: c.req.method,
			sourceIp: readSourceIp(c),
		});
		const response: ApiErrorResponse = {
			error: "Session has expired",
			code: API_ERROR_CODES.SESSION_EXPIRED,
		};
		return c.json(response, 401);
	}

	if (result.reason === "SESSION_REVOKED") {
		authLogger.warn("rejected request: session revoked", {
			path: c.req.path,
			method: c.req.method,
			sourceIp: readSourceIp(c),
		});
		const response: ApiErrorResponse = {
			error: "Session has been revoked",
			code: API_ERROR_CODES.SESSION_REVOKED,
		};
		return c.json(response, 401);
	}

	// INVALID_TOKEN — fall through to API key check
	return null;
}

/**
 * Resolves the route actor once an X-API-Key holder has already
 * authenticated (local mode, or shared mode's API-key fallback).
 *
 * AU21 §12: an actor-override header lets the seam's own Application-layer
 * composition root (never an external client — see
 * `actor-transport-header.ts`'s `@lore`) carry the calling agent's own
 * identity as the route actor. Falls back to the existing human-resolution
 * behavior (`@lore P2`) when the header is absent.
 */
async function resolveApiKeyActorUserId(
	c: Context<HyperIdleEnv>,
	db: HyperIdleDb,
): Promise<string> {
	const actorOverride = c.req.header(CORE_API_ACTOR_OVERRIDE_HEADER);
	if (actorOverride) return actorOverride;
	const humanUser = await findUser(db, { kind: "human" });
	return humanUser?.id ?? "u-founder";
}

/**
 * Create the auth middleware with database access for identity lookup.
 *
 * In local mode (sharedMode=false):
 * - Unchanged X-API-Key behavior.
 * - Sets authMethod="api_key", loginSessionId=undefined.
 *
 * In shared mode (sharedMode=true):
 * 1. Checks Authorization: Bearer <token> first.
 *    - Valid → sets userId from session, authMethod="login_session".
 *    - Expired → 401 SESSION_EXPIRED.
 *    - Revoked → 401 SESSION_REVOKED.
 * 2. Falls back to X-API-Key (admin key).
 *    - Valid → resolves first human user, authMethod="api_key".
 * 3. No credentials → 401 UNAUTHORIZED.
 *
 * @lore P2: In local mode, resolves userId from users table (kind='human').
 * Fallback to "u-founder" for unseeded DBs. All production paths should
 * have a human user row.
 */
export function createAuthMiddleware(
	options: AuthMiddlewareOptions,
): MiddlewareHandler<HyperIdleEnv> {
	const { db, sharedMode } = options;

	return async (c, next) => {
		if (sharedMode) {
			// Shared mode: try Bearer token first
			const authHeader = c.req.header("Authorization") ?? "";
			if (authHeader.startsWith("Bearer ")) {
				const token = authHeader.slice(7);
				const bearerResult = await handleBearerAuth(c, db, token);

				if (bearerResult === "ok") {
					await next();
					return;
				}
				if (bearerResult !== null) {
					return bearerResult;
				}
				// null → fall through to API key check
			}

			// Shared mode: fall back to X-API-Key (admin key)
			const apiKey = c.req.header("X-API-Key") ?? "";
			const expectedKey = process.env.HYPERIDLE_API_KEY ?? "";

			if (apiKey.length > 0 && constantTimeStringEqual(apiKey, expectedKey)) {
				c.set("userId", await resolveApiKeyActorUserId(c, db));
				c.set("authMethod", "api_key");
				c.set("loginSessionId", undefined);
				await next();
				return;
			}

			return rejectUnauthorized(
				c,
				"Missing or invalid credentials",
				"rejected request: no valid credentials in shared mode",
			);
		}

		// Local mode: X-API-Key only (unchanged behavior)
		const apiKey = c.req.header("X-API-Key") ?? "";
		const expectedKey = process.env.HYPERIDLE_API_KEY ?? "";

		if (!constantTimeStringEqual(apiKey, expectedKey)) {
			return rejectUnauthorized(
				c,
				"Missing or invalid API key",
				"rejected request: invalid or missing API key",
			);
		}

		c.set("userId", await resolveApiKeyActorUserId(c, db));
		c.set("authMethod", "api_key");
		c.set("loginSessionId", undefined);

		await next();
	};
}

/**
 * Stateless auth middleware for use when db is not available (e.g. health checks
 * or the public /api route with no db). Sets userId to a hardcoded founder constant as fallback.
 *
 * @lore M3: kept for backward compat with code paths that don't have db access.
 * Primary path is createAuthMiddleware({ db, sharedMode }).
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
