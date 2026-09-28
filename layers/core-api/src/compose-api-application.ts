/**
 * @lore: compose-api-application — Hono notFound fires on ROOT app only, not sub-apps; canonical JSON 404 for /api/* must be declared on the root app
 * @lore: preAuthRegistrars run strictly before `middleware.auth`; registration order determines auth boundary
 */

import { API_ERROR_CODES } from "@hyperidle/domain-model";
import type { ErrorHandler, MiddlewareHandler } from "hono";
import { Hono } from "hono";

/** The `/api` middleware stack a composition root applies. */
export interface ComposedApiMiddleware {
	readonly cors: MiddlewareHandler;
	readonly errorHandler: ErrorHandler;
	readonly auth: MiddlewareHandler;
}

export interface ComposeApiApplicationOptions {
	readonly middleware: ComposedApiMiddleware;
	// biome-ignore lint/suspicious/noExplicitAny: layer-blind by design — a Layer's own `Env` is opaque here, and Hono's own `.route()` accepts any sub-app env.
	readonly preAuthRegistrars: ReadonlyArray<(api: Hono<any>) => void>;
	// biome-ignore lint/suspicious/noExplicitAny: see `preAuthRegistrars` above
	readonly apps: ReadonlyArray<Hono<any>>;
}

export function composeApiApplication(options: ComposeApiApplicationOptions): Hono {
	const app = new Hono();

	const api = new Hono();
	const { middleware } = options;
	api.use("*", middleware.cors);
	api.onError(middleware.errorHandler);

	for (const register of options.preAuthRegistrars) {
		register(api);
	}

	api.use("*", middleware.auth);

	for (const mounted of options.apps) {
		api.route("/", mounted);
	}

	app.route("/api", api);

	// @lore: compose-api-application — Hono `notFound` only fires on the ROOT app; unknown `/api/*` paths must return JSON, not Hono's text/plain default
	app.notFound((c) => {
		if (c.req.path.startsWith("/api")) {
			return c.json({ error: "Not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}
		return c.text("404 Not Found", 404);
	});

	return app;
}
