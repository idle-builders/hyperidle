import type { HyperIdleDb } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import type { ApiErrorResponse } from "@hyperidle/domain-model";
import { API_ERROR_CODES } from "@hyperidle/domain-model";
import { constantTimeStringEqual, type HyperIdleEnv } from "@hyperidle/domain-model/http";
import { findUser } from "@hyperidle/user";
import type { Context, MiddlewareHandler } from "hono";

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
 * The X-API-Key is the one credential, in local and shared mode alike: there
 * are no login sessions, invite codes or bearer tokens.
 */

/**
 * Options for the auth middleware factory.
 */
export interface AuthMiddlewareOptions {
	db: HyperIdleDb;
	/** Composition-owned key. Production omits this and reads the deployment env. */
	apiKey?: string;
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
 * Resolves the route actor once an X-API-Key holder has already authenticated.
 * Always returns the first human row, or the placeholder "u-founder" before
 * the welcome screen creates one.
 *
 * @lore P2: the placeholder "u-founder" stands in only while no human row
 * exists — the moment before the welcome screen's `edit_user` creates the
 * person. Any `x-hyperidle-actor-id` header is intentionally ignored: the
 * API key is the one credential and cannot be used to impersonate any user.
 * Tests that need a specific actor call the action in-process via
 * `action.run({ actor, db, eventBus, now }, input)`.
 */
async function resolveApiKeyActorUserId(
	_c: Context<HyperIdleEnv>,
	db: HyperIdleDb,
): Promise<string> {
	const humanUser = await findUser(db, { kind: "human" });
	return humanUser?.id ?? "u-founder";
}

/**
 * Create the auth middleware with database access for identity lookup.
 *
 * A valid X-API-Key resolves `userId` to the first human row in `users`,
 * or "u-founder" while no human row exists yet.
 */
export function createAuthMiddleware(
	options: AuthMiddlewareOptions,
): MiddlewareHandler<HyperIdleEnv> {
	const { db } = options;
	const expectedApiKey = options.apiKey ?? process.env.HYPERIDLE_API_KEY ?? "";

	return async (c, next) => {
		const apiKey = c.req.header("X-API-Key") ?? "";

		if (!constantTimeStringEqual(apiKey, expectedApiKey)) {
			return rejectUnauthorized(
				c,
				"Missing or invalid API key",
				"rejected request: invalid or missing API key",
			);
		}

		c.set("userId", await resolveApiKeyActorUserId(c, db));

		await next();
	};
}

/**
 * Stateless auth middleware for an app built with no db (db-less test apps).
 * It checks the API key and sets no userId — there is no users table to
 * resolve a caller from. Every real composition has a db and uses
 * createAuthMiddleware({ db }).
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
