// @lore: VITE_HYPERIDLE_API_KEY — must match server HYPERIDLE_API_KEY exactly; mismatch returns 401 with no diagnostic hint

function getApiKey(): string | undefined {
	if (typeof window !== "undefined" && window.__HYPERIDLE__?.apiKey) {
		return window.__HYPERIDLE__.apiKey;
	}
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
