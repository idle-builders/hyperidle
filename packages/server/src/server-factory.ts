import { API_ERROR_CODES } from "@hyperidle/shared";
import type { ApiErrorResponse, HealthResponse } from "@hyperidle/shared";
import { serve } from "bun";
import { Hono } from "hono";
import { authMiddleware } from "./middleware/auth.js";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler } from "./middleware/error-handler.js";
import { health } from "./routes/health.js";
import { registerTestRoutes } from "./routes/test-routes.js";
import { registerWsRoute, wsHandler } from "./routes/ws.js";

/**
 * Build the full Hono app with WebSocket support (Bun-only).
 */
function createFullApp(): Hono {
	const app = new Hono();

	// Backward-compat: /health without auth
	app.route("/", health);

	const api = new Hono();
	api.use("*", corsMiddleware);
	api.onError(errorHandler);

	api.get("/health", (c) => {
		const response: HealthResponse = {
			status: "ok",
			timestamp: new Date().toISOString(),
		};
		return c.json(response);
	});

	// WebSocket must be registered before the catch-all auth middleware
	registerWsRoute(api);

	api.use("*", authMiddleware);

	if (process.env.NODE_ENV !== "production") {
		registerTestRoutes(api);
	}

	api.notFound((c) => {
		const response: ApiErrorResponse = {
			error: "Not found",
			code: API_ERROR_CODES.NOT_FOUND,
		};
		return c.json(response, 404);
	});

	app.route("/api", api);
	return app;
}

/**
 * Create a Bun server with WebSocket support.
 * Pass port 0 for a random available port (useful in tests).
 */
export function createBunServer(port: number): ReturnType<typeof serve> {
	const fullApp = createFullApp();
	return serve({
		fetch: fullApp.fetch,
		port,
		websocket: wsHandler,
	});
}
