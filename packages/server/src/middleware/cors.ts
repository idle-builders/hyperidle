import type { Context } from "hono";
import { cors } from "hono/cors";

const ALLOWED_DEV_ORIGIN = "http://localhost:5173";
// Electron renderer loads the SPA from a random port on 127.0.0.1.
// Allow any port on the canonical loopback address only.
const ELECTRON_ORIGIN_PREFIX = "http://127.0.0.1";

/**
 * Resolves CORS origin for each request.
 *
 * - Dev (Vite): allows http://localhost:5173 exactly.
 * - Electron: allows any http://127.0.0.1:{port} (random OS-assigned port).
 * - Same-origin production: no Origin header → function not called → no CORS
 *   headers added (correct; same-origin requests do not require CORS).
 * - All other origins: denied (return undefined).
 *
 * @lore N2: Hono cors() calls this function only when an Origin header is
 * present. Same-origin requests (HYPERIDLE_STATIC_DIR mode) never reach here.
 * See architecture section 2.4 for the full CORS strategy.
 */
function resolveOrigin(origin: string, _c: Context): string | undefined {
	if (origin === ALLOWED_DEV_ORIGIN) {
		return origin;
	}
	if (origin.startsWith(ELECTRON_ORIGIN_PREFIX)) {
		return origin;
	}
	return undefined;
}

/**
 * CORS middleware — origin-aware for dev, Electron, and same-origin production.
 */
export const corsMiddleware = cors({
	origin: resolveOrigin,
	allowHeaders: ["Content-Type", "X-API-Key"],
	allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
	maxAge: 86400,
});
