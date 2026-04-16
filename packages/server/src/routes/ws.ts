import { API_ERROR_CODES } from "@hyperidle/shared";
import type { ApiErrorResponse } from "@hyperidle/shared";
import type { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";

const { upgradeWebSocket, websocket: wsHandler } = createBunWebSocket();

/**
 * Register WebSocket route on the given Hono app.
 * Auth is checked before upgrade via query param `token`.
 * This module requires the Bun runtime (uses hono/bun).
 */
function registerWsRoute(apiApp: Hono): void {
	// WebSocket auth via query token
	apiApp.use("/ws", async (c, next) => {
		const token = c.req.query("token");
		const expectedKey = process.env.HYPERIDLE_API_KEY;
		if (!expectedKey || token !== expectedKey) {
			const response: ApiErrorResponse = {
				error: "Missing or invalid token",
				code: API_ERROR_CODES.UNAUTHORIZED,
			};
			return c.json(response, 401);
		}
		await next();
	});

	apiApp.get(
		"/ws",
		upgradeWebSocket(() => ({
			onOpen(_evt, ws) {
				ws.send(JSON.stringify({ type: "connected" }));
			},
			onMessage(evt, ws) {
				ws.send(typeof evt.data === "string" ? evt.data : "binary");
			},
		})),
	);
}

export { registerWsRoute, wsHandler };
