import { cors } from "hono/cors";

/**
 * CORS middleware configured to allow the frontend dev server.
 */
export const corsMiddleware = cors({
	origin: "http://localhost:5173",
	allowHeaders: ["Content-Type", "X-API-Key"],
	allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
	maxAge: 86400,
});
