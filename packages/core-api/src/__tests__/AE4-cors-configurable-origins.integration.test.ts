/**
 * AE4 AC-1: Configurable CORS origins via HYPERIDLE_CORS_ORIGINS env var.
 *
 * Tests that the CORS middleware dynamically respects HYPERIDLE_CORS_ORIGINS.
 *
 * @lore AE4: CONFIGURED_ORIGINS must be read lazily (per-request) rather
 * than at module load time. If parsed at module load, vi.stubEnv() has no
 * effect because the module is already initialized before the test runs.
 * The fix: read process.env.HYPERIDLE_CORS_ORIGINS inside resolveOrigin()
 * on each call, not at module initialization.
 */

import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../test-fixtures.js";

const TEST_API_KEY = "test-key-ae4-cors";

describe("AE4 AC-1 — CORS configurable origins (HYPERIDLE_CORS_ORIGINS)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("allows a single configured origin", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_CORS_ORIGINS", "https://hyperidle.local:3001");

		const res = await app.request("/api/health", {
			headers: { origin: "https://hyperidle.local:3001" },
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://hyperidle.local:3001");
	});

	test("allows multiple configured origins — first origin", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_CORS_ORIGINS", "https://hyperidle.local:3001,https://10.0.1.5:3001");

		const res = await app.request("/api/health", {
			headers: { origin: "https://hyperidle.local:3001" },
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://hyperidle.local:3001");
	});

	test("allows multiple configured origins — second origin", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_CORS_ORIGINS", "https://hyperidle.local:3001,https://10.0.1.5:3001");

		const res = await app.request("/api/health", {
			headers: { origin: "https://10.0.1.5:3001" },
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://10.0.1.5:3001");
	});

	test("denies an origin not in HYPERIDLE_CORS_ORIGINS", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_CORS_ORIGINS", "https://hyperidle.local:3001");

		const res = await app.request("/api/health", {
			headers: { origin: "https://evil.example.com" },
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
	});

	test("denies origin with HYPERIDLE_CORS_ORIGINS unset (empty env var = no extra origins)", async ({
		app,
	}) => {
		// Ensure env var is not set
		vi.stubEnv("HYPERIDLE_CORS_ORIGINS", "");

		const res = await app.request("/api/health", {
			headers: { origin: "https://hyperidle.local:3001" },
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
	});

	test("trims whitespace around origins in the env var", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_CORS_ORIGINS", " https://hyperidle.local:3001 , https://10.0.1.5:3001 ");

		const res = await app.request("/api/health", {
			headers: { origin: "https://hyperidle.local:3001" },
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://hyperidle.local:3001");
	});

	test("still allows existing localhost:5173 origin when HYPERIDLE_CORS_ORIGINS is set", async ({
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_CORS_ORIGINS", "https://hyperidle.local:3001");

		const res = await app.request("/api/health", {
			headers: { origin: "http://localhost:5173" },
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
	});

	test("OPTIONS preflight works for configured origin", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_CORS_ORIGINS", "https://hyperidle.local:3001");

		const res = await app.request("/api/health", {
			method: "OPTIONS",
			headers: {
				origin: "https://hyperidle.local:3001",
				"Access-Control-Request-Method": "POST",
				"Access-Control-Request-Headers": "X-API-Key, Content-Type",
			},
		});
		expect(res.status).toBeLessThanOrEqual(204);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://hyperidle.local:3001");
	});
});
