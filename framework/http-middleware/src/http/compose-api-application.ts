/**
 * `composeApiApplication` — the layer-blind Hono mount recipe (AU31 §5.3).
 *
 * Every composition root (`applications/remote-server/src/create-server.ts`,
 * `applications/desktop/src/create-server.ts`, and the `core-api` test
 * harness's `createTestApp`) builds ONE Hono root, ONE `/api` sub-router, and
 * mounts every Layer app behind the SAME middleware ordering. Before this
 * helper that ~40-line recipe was hand-copied at each site; a probe-proven
 * fragility (the `notFound` trap, the pre-auth/auth ordering) meant a drifted
 * copy would silently reopen a closed bug. This module names no Layer — every
 * parameter is a plain Hono value, a middleware handler, or a registrar
 * callback — so it can live in `@hyperidle/http-middleware` (AU34 split
 * `@hyperidle/shared` into eighteen audience-scoped packages; this file
 * followed the rest of `shared/src/http/*` here) without becoming a third
 * composition package (AU26 ruling, upheld: no package that imports layers).
 *
 * @lore AU26 B1b (AC9/AC10, the Hono `notFound` trap): Hono applies a
 * mounted sub-app's parent middleware, context vars and `onError`, but NOT
 * its `notFound` — only the ROOT app's fires (verified on the installed
 * `hono@4.12.30`, `.pipeline/work/AU26/probes/two-app-mount/`). The
 * canonical JSON 404 for an unknown `/api/*` path therefore MUST be declared
 * on the root app this function builds — and IS, unconditionally, below.
 *
 * @lore AU31 §5.3 (governance `crossing-di`): the backward-compat `/health`
 * root mount is NOT a parameter here, on purpose. Threading a Layer-owned
 * value (`@hyperidle/core-api/routes/health`'s `health`) through a named
 * option on a FRAMEWORK function is exactly the DI shape the governance
 * census flags (`framework → layer [di]` — this package has no Layer
 * identity to legally receive one). Calling `.route("/", health)` on the
 * returned root app is ordinary same-package Hono usage the census does not
 * track as DI, so each composition root mounts its own root-level routes
 * itself, after this function returns.
 *
 * @lore AU31 §9 / M3 A3 / AF11: registration order is what puts a route in
 * front of or behind the auth middleware — `createAuthMiddleware` has no
 * path allow-list. `preAuthRegistrars` (which includes a Layer's own pre-auth
 * routes AND a pre-auth mount like the MCP bridge router — both share the
 * exact `(api: Hono) => void` shape) run strictly before `middleware.auth`
 * is applied; `apps` mount strictly after.
 */

import { API_ERROR_CODES } from "@hyperidle/domain-model";
import type { ErrorHandler, MiddlewareHandler } from "hono";
import { Hono } from "hono";

/** The `/api` middleware stack a composition root applies — same field shapes as `core-api`'s own `ApiMiddlewareStack`, spelled here without importing it (this module stays layer-blind). */
export interface ComposedApiMiddleware {
	readonly cors: MiddlewareHandler;
	readonly errorHandler: ErrorHandler;
	readonly auth: MiddlewareHandler;
}

export interface ComposeApiApplicationOptions {
	readonly middleware: ComposedApiMiddleware;
	/**
	 * Registrars run, in order, on the `/api` sub-router BEFORE `middleware.auth`
	 * — a Layer's own pre-auth routes (health/setup/claim/WS-upgrade) and a
	 * pre-auth router mount (the MCP bridge, which authenticates via a token in
	 * the URL) share this exact shape, so both ride the same list.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: layer-blind by design — a Layer's own `Env` (e.g. `HyperIdleEnv`) is opaque here, and Hono's own `.route()` accepts any sub-app env.
	readonly preAuthRegistrars: ReadonlyArray<(api: Hono<any>) => void>;
	/** Layer apps mounted at `/` on the `/api` sub-router, AFTER `middleware.auth` — every path string keeps its byte-identical public URL. */
	// biome-ignore lint/suspicious/noExplicitAny: see `preAuthRegistrars` above
	readonly apps: ReadonlyArray<Hono<any>>;
}

/**
 * Build the composed application: ONE Hono root, ONE `/api` router, every
 * Layer app mounted behind the SAME auth boundary, the canonical JSON 404 on
 * the root. Returns the root app — callers still own `.fetch`, listening, and
 * disposal.
 */
export function composeApiApplication(options: ComposeApiApplicationOptions): Hono {
	const app = new Hono();

	const api = new Hono();
	const { middleware } = options;
	api.use("*", middleware.cors);
	api.onError(middleware.errorHandler);

	for (const register of options.preAuthRegistrars) {
		register(api);
	}

	// M3 A3: auth. Everything mounted after this line is authenticated — including every mounted app.
	api.use("*", middleware.auth);

	for (const mounted of options.apps) {
		api.route("/", mounted);
	}

	app.route("/api", api);

	// The ONLY `notFound` that fires for a mounted sub-app is the root's — see
	// this module's header. An unknown `/api/*` path must answer with the
	// canonical `ApiErrorResponse` JSON, never Hono's `text/plain` default.
	app.notFound((c) => {
		if (c.req.path.startsWith("/api")) {
			return c.json({ error: "Not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}
		return c.text("404 Not Found", 404);
	});

	return app;
}
