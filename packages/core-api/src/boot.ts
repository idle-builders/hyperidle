/**
 * AU26 B1a/B1b — `bootCoreApi`: everything an Application needs to run the
 * `core-api` Layer, in one call. The twin of `bootAgentOrchestration`.
 *
 * An Application opens the db and the EventBus, boots both Layers, applies the
 * middleware stack to ONE `/api` router, mounts both Layer apps onto it behind
 * that stack, and disposes both.
 *
 * @lore AU26 B1b: this boot used to own the `/api` router, the middleware stack
 * and the mounting of the OTHER Layer's app — a core-api file deciding that
 * `agent-orchestration`'s routes sit behind core-api's auth. That decision is an
 * Application's alone (`runtime-simplification.md:159-164`), so it moved out to
 * `packages/remote-server/src/create-server.ts` (production) and
 * `test-utils.ts`'s `createTestApp` (the test harness Application). What this
 * boot returns is core-api's own route table, its own pre-auth registrar, and
 * the middleware stack — handed out, not installed.
 */

import type { Hono } from "hono";
import { type ApiMiddlewareStack, createApiMiddlewareStack } from "./api-middleware-stack.js";
import {
	type AppOptions,
	createCoreApiApp,
	registerCoreApiPreAuthRoutes,
	resolveUpgradeTokenStore,
	takeAppDisposers,
} from "./app.js";

export interface CoreApiBoot {
	/** Mounted by the Application at `/` on its `/api` router, AFTER the stack. */
	readonly app: Hono;
	/**
	 * Registered by the Application on its `/api` router, BEFORE the auth
	 * middleware: `GET /health`, the first-run `POST /users` setup route, the
	 * shared-mode invite claim, and the user WebSocket upgrade.
	 */
	readonly registerPreAuthRoutes: (apiRouter: Hono) => void;
	/**
	 * The `/api` middleware stack — built here (`createAuthMiddleware` reads
	 * `@hyperidle/users`, a core-api Service), applied by the Application.
	 * A single instance: the rate limiter's buckets live in its closure.
	 */
	readonly middleware: ApiMiddlewareStack;
	/**
	 * This Layer's teardown, as a flat list the Application registers on its
	 * composed root app — NOT a nested `disposeApp` thunk (see `takeAppDisposers`).
	 */
	readonly disposers: ReadonlyArray<() => void>;
}

export async function bootCoreApi(options?: AppOptions): Promise<CoreApiBoot> {
	const sharedMode = options?.sharedMode ?? process.env.HYPERIDLE_SHARED_MODE === "true";
	// One store, both sides of the auth middleware: the pre-auth WS upgrade
	// consumes tokens, the post-auth `/auth/ws-token` route mints them.
	const tokenStore = resolveUpgradeTokenStore(options);
	const app = await createCoreApiApp({
		...options,
		...(tokenStore ? { upgradeTokenStore: tokenStore } : {}),
	});
	return {
		app,
		registerPreAuthRoutes: (apiRouter) => {
			registerCoreApiPreAuthRoutes(apiRouter, options, tokenStore);
		},
		middleware: createApiMiddlewareStack({
			...(options?.db ? { db: options.db } : {}),
			sharedMode,
		}),
		disposers: takeAppDisposers(app),
	};
}
