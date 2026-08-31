/**
 * apiFetch — Fetch wrapper that injects X-API-Key on /api/* requests.
 *
 * Resolution order:
 * 1. window.__HYPERIDLE_API_KEY__ (Electron preload, set by N3)
 * 2. import.meta.env.VITE_HYPERIDLE_API_KEY (Vite dev, set by .env)
 *
 * Non-/api/* requests pass through unmodified. No global mutation.
 *
 * @lore N2: In dev, HYPERIDLE_API_KEY (server) and VITE_HYPERIDLE_API_KEY
 * (web SPA) must hold the SAME value. If they differ, every API call returns
 * 401 with NO diagnostic hint — the server validates the key but does not log
 * the mismatch in a way visible to the SPA developer. If you see unexplained
 * 401s in dev, verify both env vars in root .env are identical.
 */

function getApiKey(): string | undefined {
	// Electron preload — contextBridge exposes window.__HYPERIDLE__.apiKey
	if (typeof window !== "undefined" && window.__HYPERIDLE__?.apiKey) {
		return window.__HYPERIDLE__.apiKey;
	}
	// DEV-ONLY convenience: VITE_HYPERIDLE_API_KEY is set in .env for `npm run dev` runs.
	// No user should ever need to set this env var — it is purely a developer tool.
	// In production (Electron), the API key comes from window.__HYPERIDLE__.apiKey (path 1).
	// @lore P3 AC-14: This env var path is intentionally preserved for developer workflow
	// (npm run dev) but is NOT a user requirement. Never document it in user-facing guides.
	// Vite requires the VITE_ prefix to expose env vars to client-side code.
	if (import.meta.env.VITE_HYPERIDLE_API_KEY) {
		return import.meta.env.VITE_HYPERIDLE_API_KEY as string;
	}
	if (import.meta.env.DEV) {
		return "hyperidle-dev-local";
	}
	return undefined;
}

function isApiUrl(input: string | URL | Request): boolean {
	if (typeof input === "string") {
		// @lore N2 (M-1 fix): bare "/api" (no trailing slash, no query) must also
		// be treated as an API URL. The architecture critique noted the original
		// spec only handled "/api/" and "/api?" for strings.
		return input === "/api" || input.startsWith("/api/") || input.startsWith("/api?");
	}
	if (input instanceof URL) {
		return input.pathname === "/api" || input.pathname.startsWith("/api/");
	}
	if (input instanceof Request) {
		const url = new URL(input.url);
		return url.pathname === "/api" || url.pathname.startsWith("/api/");
	}
	return false;
}

/**
 * Drop-in replacement for `fetch()` that injects `X-API-Key` on every
 * `/api/*` request. Non-API requests pass through unchanged.
 *
 * Does NOT throw when no key is available — falls through to bare fetch,
 * letting the server's 401 response serve as the diagnostic signal.
 * Does NOT override a caller-supplied `X-API-Key` header.
 */
export function apiFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
	if (!isApiUrl(input)) {
		return fetch(input, init);
	}

	const key = getApiKey();
	if (!key) {
		return fetch(input, init);
	}

	const headers = new Headers(init?.headers);
	if (!headers.has("X-API-Key")) {
		headers.set("X-API-Key", key);
	}

	return fetch(input, { ...init, headers });
}
