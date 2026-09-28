import type { Context } from "hono";
import { cors } from "hono/cors";

const ALLOWED_DEV_ORIGIN = "http://localhost:5173";
// @lore: cors — Electron renderer loads the SPA from a random 127.0.0.1 port; require ':' after "127.0.0.1" to prevent prefix-bypass attacks
const ELECTRON_ORIGIN_PREFIX = "http://127.0.0.1";

function parseConfiguredOrigins(): ReadonlyArray<string> {
	const raw = process.env.HYPERIDLE_CORS_ORIGINS;
	if (!raw) return [];
	return raw
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

export function resolveOrigin(origin: string, _c: Context): string | undefined {
	if (origin === ALLOWED_DEV_ORIGIN) {
		return origin;
	}
	if (origin === ELECTRON_ORIGIN_PREFIX || origin.startsWith("http://127.0.0.1:")) {
		return origin;
	}
	if (parseConfiguredOrigins().includes(origin)) {
		return origin;
	}
	return undefined;
}

export const corsMiddleware = cors({
	origin: resolveOrigin,
	allowHeaders: ["Content-Type", "X-API-Key"],
	allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
	maxAge: 86400,
});
