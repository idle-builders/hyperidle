/**
 * N2 — Unit tests for apiFetch fetch wrapper.
 *
 * AC coverage:
 *  AC-2: Single fetch wrapper injects X-API-Key on every /api/* request
 *  AC-3: In dev, reads from VITE_HYPERIDLE_API_KEY via Vite env var
 *  AC-4: Prefers window.__HYPERIDLE__.apiKey over VITE_HYPERIDLE_API_KEY
 *  AC-6: Vitest covers the fetch wrapper
 *
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api-fetch.js";

const TEST_KEY = "test-api-key-abc123";
const ELECTRON_KEY = "electron-api-key-xyz789";

function makeMockResponse(status = 200): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		headers: new Headers(),
		json: () => Promise.resolve({}),
		text: () => Promise.resolve(""),
	} as unknown as Response;
}

describe("apiFetch (N2)", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn().mockResolvedValue(makeMockResponse(200));
		vi.stubGlobal("fetch", fetchSpy);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
		// Clean up window.__HYPERIDLE__ if set
		if (typeof window !== "undefined") {
			delete window.__HYPERIDLE__;
		}
	});

	// ── AC-2 + AC-3: Vite env var path ───────────────────────────────────────────

	it("adds X-API-Key header with the configured value when VITE_HYPERIDLE_API_KEY is set", async () => {
		vi.stubEnv("VITE_HYPERIDLE_API_KEY", TEST_KEY);

		await apiFetch("/api/teams");

		expect(fetchSpy).toHaveBeenCalledOnce();
		const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		const headers = new Headers(init?.headers);
		expect(headers.get("X-API-Key")).toBe(TEST_KEY);
	});

	it("does NOT add X-API-Key header to non-/api/* URLs", async () => {
		vi.stubEnv("VITE_HYPERIDLE_API_KEY", TEST_KEY);

		await apiFetch("/static/main.js");

		expect(fetchSpy).toHaveBeenCalledOnce();
		// fetch is called with the original input, either without init or with
		// init that does NOT have X-API-Key
		const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
		if (init?.headers) {
			const headers = new Headers(init.headers);
			// eslint-disable-next-line vitest/no-conditional-expect -- either outcome (no init, or init without the header) proves the header was never added
			expect(headers.has("X-API-Key")).toBe(false);
		}
		// If init is undefined, the header was never added — which is correct
	});

	it("does NOT override an existing X-API-Key header", async () => {
		vi.stubEnv("VITE_HYPERIDLE_API_KEY", TEST_KEY);
		const callerKey = "caller-supplied-key";

		await apiFetch("/api/teams", {
			headers: { "X-API-Key": callerKey },
		});

		const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		const headers = new Headers(init?.headers);
		expect(headers.get("X-API-Key")).toBe(callerKey);
	});

	it("falls back to dev default key when no explicit key is configured", async () => {
		// no env var, no window key (cleared in afterEach)
		await apiFetch("/api/teams");

		expect(fetchSpy).toHaveBeenCalledOnce();
		const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit | undefined];
		const headers = new Headers(init?.headers);
		expect(headers.get("X-API-Key")).toBe("hyperidle-dev-local");
	});

	it("preserves method, body, and signal from init", async () => {
		vi.stubEnv("VITE_HYPERIDLE_API_KEY", TEST_KEY);
		const controller = new AbortController();
		const body = JSON.stringify({ name: "test" });

		await apiFetch("/api/teams", {
			method: "POST",
			body,
			signal: controller.signal,
		});

		const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(init.method).toBe("POST");
		expect(init.body).toBe(body);
		expect(init.signal).toBe(controller.signal);
	});

	// ── Robustness: URL and Request object inputs ─────────────────────────────────

	it("handles URL object input for /api/* path", async () => {
		vi.stubEnv("VITE_HYPERIDLE_API_KEY", TEST_KEY);
		const url = new URL("http://localhost:3001/api/teams");

		await apiFetch(url);

		expect(fetchSpy).toHaveBeenCalledOnce();
		const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
		const headers = new Headers(init?.headers);
		expect(headers.get("X-API-Key")).toBe(TEST_KEY);
	});

	it("handles Request object input for /api/* path", async () => {
		vi.stubEnv("VITE_HYPERIDLE_API_KEY", TEST_KEY);
		const request = new Request("http://localhost:3001/api/teams", {
			method: "GET",
		});

		await apiFetch(request);

		expect(fetchSpy).toHaveBeenCalledOnce();
		const [, init] = fetchSpy.mock.calls[0] as [Request, RequestInit];
		const headers = new Headers(init?.headers);
		expect(headers.get("X-API-Key")).toBe(TEST_KEY);
	});

	// ── AC-4: Electron preload window.__HYPERIDLE__.apiKey priority ──────────────

	it("prefers window.__HYPERIDLE__.apiKey over VITE_HYPERIDLE_API_KEY", async () => {
		// both keys set — window key must win
		vi.stubEnv("VITE_HYPERIDLE_API_KEY", TEST_KEY);
		window.__HYPERIDLE__ = { apiKey: ELECTRON_KEY } as HyperIdleElectronBridge;

		await apiFetch("/api/teams");

		const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		const headers = new Headers(init?.headers);
		expect(headers.get("X-API-Key")).toBe(ELECTRON_KEY);
	});

	// ── Architecture critique condition M-1: bare /api path ──────────────────────

	it("handles bare /api path (no trailing slash) as an API URL", async () => {
		vi.stubEnv("VITE_HYPERIDLE_API_KEY", TEST_KEY);

		await apiFetch("/api");

		expect(fetchSpy).toHaveBeenCalledOnce();
		const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		const headers = new Headers(init?.headers);
		expect(headers.get("X-API-Key")).toBe(TEST_KEY);
	});
});
