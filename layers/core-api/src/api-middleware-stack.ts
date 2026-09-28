/**
 * The `/api` middleware stack, built by `core-api` and
 * **applied by the Application**.
 *
 * `createAuthMiddleware` legitimately reads `@hyperidle/user` (a core-api
 * Service), so the stack is constructed here. It is NOT applied here: the
 * Application (`applications/remote-server/src/create-server.ts`, or a test harness)
 * owns the `/api` router, `use()`s these handlers on it, and only then mounts
 * both Layer apps behind them. "Only an Application may choose to put another
 * Layer's routes behind this stack" (`docs/architecture/overview.md` §Applications) — that
 * choice is not core-api's to make, which is why the stack is handed out rather
 * than installed.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { ErrorHandler, MiddlewareHandler } from "hono";
import { authMiddleware, createAuthMiddleware } from "./middleware/auth.js";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler } from "./middleware/error-handler.js";

export interface ApiMiddlewareStack {
	/** CORS — first, so even a rejected request answers with the right headers. */
	readonly cors: MiddlewareHandler;
	/** `api.onError(...)` — not a middleware; the Application installs it as the handler. */
	readonly errorHandler: ErrorHandler;
	/** The auth catch-all. Everything registered AFTER it is authenticated. */
	readonly auth: MiddlewareHandler;
}

export function createApiMiddlewareStack(deps: {
	readonly db?: HyperIdleDb;
	readonly apiKey?: string;
}): ApiMiddlewareStack {
	return {
		cors: corsMiddleware,
		errorHandler,
		// M3 A3: with a db, auth resolves `userId` off the `users` table; without
		// one (db-less test apps) the stateless middleware stands in.
		auth: deps.db
			? createAuthMiddleware({
					db: deps.db,
					...(deps.apiKey !== undefined ? { apiKey: deps.apiKey } : {}),
				})
			: authMiddleware,
	};
}
