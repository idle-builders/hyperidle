import { API_ERROR_CODES } from "@hyperidle/shared";
import type { ApiErrorResponse, HealthResponse } from "@hyperidle/shared";
import { Hono } from "hono";
import { authMiddleware } from "./middleware/auth.js";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler } from "./middleware/error-handler.js";
import { health } from "./routes/health.js";
import { registerTestRoutes } from "./routes/test-routes.js";

/**
 * Create the Hono application.
 * WebSocket routes are registered separately via registerWsRoute() in Bun-only context.
 */
function createApp(): Hono {
	const app = new Hono();

	// Backward-compat: /health without auth
	app.route("/", health);

	// ----- /api sub-router -----
	const api = new Hono();

	// CORS on all /api routes
	api.use("*", corsMiddleware);

	// Error handler
	api.onError(errorHandler);

	// Public: /api/health (no auth required)
	api.get("/health", (c) => {
		const response: HealthResponse = {
			status: "ok",
			timestamp: new Date().toISOString(),
		};
		return c.json(response);
	});

	// Auth middleware for all other /api routes (except /health above)
	api.use("*", authMiddleware);

	// Register test routes only in non-production environments
	if (process.env.NODE_ENV !== "production") {
		registerTestRoutes(api);
	}

	// 404 handler for unknown /api routes
	api.notFound((c) => {
		const response: ApiErrorResponse = {
			error: "Not found",
			code: API_ERROR_CODES.NOT_FOUND,
		};
		return c.json(response, 404);
	});

	app.route("/api", api);

	// Top-level 404 handler for all unmatched routes
	app.notFound((c) => {
		// Check if this is an /api route
		if (c.req.path.startsWith("/api")) {
			const response: ApiErrorResponse = {
				error: "Not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}
		return c.text("404 Not Found", 404);
	});

	return app;
}

const app = createApp();

export { app, createApp };
