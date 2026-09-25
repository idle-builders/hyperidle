import type { Context } from "hono";
import { cors } from "hono/cors";

const ALLOWED_DEV_ORIGIN = "http://localhost:5173";
// Electron renderer loads the SPA from a random port on 127.0.0.1.
// Allow any port on the canonical loopback address only.
const ELECTRON_ORIGIN_PREFIX = "http://127.0.0.1";

/**
 * Parses HYPERIDLE_CORS_ORIGINS from the environment at call time.
 *
 * Format: comma-separated list of exact origins.
 * Example: "https://hyperidle.local:3001,https://10.0.1.5:3001"
 *
 * Each origin is matched exactly (no wildcards, no regex). O(n) scan is
 * intentionally simple — expected 1-5 configured origins at runtime.
 *
 * @lore AE4: Read lazily (per-request) rather than at module load time so
 * that vi.stubEnv() in integration tests takes effect. If parsed once at
 * module load, CONFIGURED_ORIGINS is frozen before test env-stubs run.
 */
function parseConfiguredOrigins(): ReadonlyArray<string> {
	const raw = process.env.HYPERIDLE_CORS_ORIGINS;
	if (!raw) return [];
	return raw
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

/**
 * Resolves CORS origin for each request.
 *
 * - Dev (Vite): allows http://localhost:5173 exactly.
 * - Electron: allows any http://127.0.0.1:{port} (random OS-assigned port).
 * - AE4: configured origins from HYPERIDLE_CORS_ORIGINS env var (exact match).
 * - Same-origin production: no Origin header → function not called → no CORS
 *   headers added (correct; same-origin requests do not require CORS).
 * - All other origins: denied (return undefined).
 *
 * @lore N2: Hono sets the `Access-Control-Allow-Origin` response header only
 * when an `Origin` is present and matches; the origin function itself is evaluated
 * on every request. Same-origin requests (HYPERIDLE_STATIC_DIR mode) send no Origin
 * header → no CORS headers added (correct).
 * See architecture section 2.4 for the full CORS strategy.
 */
function resolveOrigin(origin: string, _c: Context): string | undefined {
	if (origin === ALLOWED_DEV_ORIGIN) {
		return origin;
	}
	// @lore N2: Use exact match or require ':' after "127.0.0.1" to prevent
	// prefix-bypass attacks like http://127.0.0.1.evil.com matching the prefix.
	if (origin === ELECTRON_ORIGIN_PREFIX || origin.startsWith("http://127.0.0.1:")) {
		return origin;
	}
	// Configurable origins from HYPERIDLE_CORS_ORIGINS (lazy-read for testability)
	if (parseConfiguredOrigins().includes(origin)) {
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
