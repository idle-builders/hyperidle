/**
 * AU26 B1b (§D-B) — the `/api` middleware stack, built by `core-api` and
 * **applied by the Application**.
 *
 * `createAuthMiddleware` legitimately reads `@hyperidle/users` (a core-api
 * Service), so the stack is constructed here. It is NOT applied here: the
 * Application (`packages/remote-server/src/create-server.ts`, or a test harness)
 * owns the `/api` router, `use()`s these handlers on it, and only then mounts
 * both Layer apps behind them. "Only an Application may choose to put another
 * Layer's routes behind this stack" (`runtime-simplification.md:159-164`) — that
 * choice is not core-api's to make, which is why the stack is handed out rather
 * than installed.
 *
 * @lore AU26 B1b: every field is a SINGLE instance. `createRateLimiter` holds
 * per-identity buckets in a closure, so building the stack twice would silently
 * hand out two independent budgets. An Application builds it once (via
 * `bootCoreApi`, which exposes it on its handle) and applies that one object.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { createRateLimiter, failClosedAssertion } from "@hyperidle/shared/http";
import type { ErrorHandler, MiddlewareHandler } from "hono";
import { authMiddleware, createAuthMiddleware } from "./middleware/auth.js";
import { createBodyLimit } from "./middleware/body-limit.js";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler } from "./middleware/error-handler.js";

export interface ApiMiddlewareStack {
	/** CORS — first, so even a rejected request answers with the right headers. */
	readonly cors: MiddlewareHandler;
	/** `api.onError(...)` — not a middleware; the Application installs it as the handler. */
	readonly errorHandler: ErrorHandler;
	/**
	 * I2 R1-R5: per-identity rate limit, applied BEFORE auth so unauthenticated
	 * floods never touch the database. `/api/health`, `/api/status/health` and
	 * `/api/auth` are exempt (liveness probes + the auth path's own bucket).
	 */
	readonly rateLimit: MiddlewareHandler;
	/** I2 R4: request body cap; rejects 413 with the canonical `ApiErrorResponse`. */
	readonly bodyLimit: MiddlewareHandler;
	/** The auth catch-all. Everything registered AFTER it is authenticated. */
	readonly auth: MiddlewareHandler;
	/** AF11: the fail-closed boundary assertion, mounted directly after auth. */
	readonly failClosed: MiddlewareHandler;
	/**
	 * I2 review O6: the dedicated `/auth/*` bucket, so a WS-reconnect storm
	 * cannot starve the API budget. Applied by `core-api`'s own route table
	 * (the `/auth` routes are core-api's), not by the Application.
	 */
	readonly authMintLimiter: MiddlewareHandler;
}

export function createApiMiddlewareStack(deps: {
	readonly db?: HyperIdleDb;
	readonly sharedMode: boolean;
}): ApiMiddlewareStack {
	const rateLimitPerMin = Number.parseInt(process.env.HYPERIDLE_RATE_LIMIT_PER_MIN ?? "300", 10);
	const baseRateLimit =
		Number.isFinite(rateLimitPerMin) && rateLimitPerMin > 0 ? rateLimitPerMin : 300;
	const maxBodyBytes = Number.parseInt(process.env.HYPERIDLE_MAX_BODY_BYTES ?? "1000000", 10);

	return {
		cors: corsMiddleware,
		errorHandler,
		rateLimit: createRateLimiter({
			limit: baseRateLimit,
			windowMs: 60_000,
			skipPaths: ["/api/health", "/api/status/health", "/api/auth"],
		}),
		bodyLimit: createBodyLimit({
			maxSize: Number.isFinite(maxBodyBytes) && maxBodyBytes > 0 ? maxBodyBytes : 1_000_000,
		}),
		// M3 A3: with a db, auth resolves `userId` off the `users` table; without
		// one (db-less test apps) the stateless middleware stands in.
		auth: deps.db
			? createAuthMiddleware({ db: deps.db, sharedMode: deps.sharedMode })
			: authMiddleware,
		failClosed: failClosedAssertion(),
		authMintLimiter: createRateLimiter({
			limit: Math.max(baseRateLimit * 2, 120),
			windowMs: 60_000,
		}),
	};
}
