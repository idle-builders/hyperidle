import type { ApiErrorResponse } from "@hyperidle/domain-model";
import { describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-12345";

describe("API Scaffold", () => {
	describe("AC1: GET /api/health returns 200 with status", () => {
		test("returns 200 with status ok and timestamp", async ({ app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const res = await app.request("/api/health");

			expect(res.status).toBe(200);
			const body = (await res.json()) as { status: string; timestamp: string };
			expect(body.status).toBe("ok");
			expect(typeof body.timestamp).toBe("string");
			expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
			vi.unstubAllEnvs();
		});
	});

	describe("AC2: Request without API key returns 401", () => {
		test("returns 401 with UNAUTHORIZED code for /api routes", async ({ requestWithoutAuth }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);

			// /api/health is public, so test a protected route
			const protectedRes = await requestWithoutAuth("/api/protected-test");
			expect(protectedRes.status).toBe(401);

			const body = (await protectedRes.json()) as ApiErrorResponse;
			expect(body.error).toBeTruthy();
			expect(body.code).toBe("UNAUTHORIZED");
			vi.unstubAllEnvs();
		});

		test("returns 401 for missing X-API-Key header", async ({ requestWithoutAuth }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const res = await requestWithoutAuth("/api/protected-test", {
				headers: {},
			});

			expect(res.status).toBe(401);
			const body = (await res.json()) as ApiErrorResponse;
			expect(body.code).toBe("UNAUTHORIZED");
			vi.unstubAllEnvs();
		});
	});

	describe("AC3: Request with valid API key passes auth", () => {
		test("passes auth with valid X-API-Key header", async ({ app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const res = await app.request("/api/health", {
				headers: { "X-API-Key": TEST_API_KEY },
			});

			expect(res.status).toBe(200);
			vi.unstubAllEnvs();
		});

		test("returns 401 with invalid API key", async ({ requestWithoutAuth }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const res = await requestWithoutAuth("/api/protected-test", {
				headers: { "X-API-Key": "wrong-key" },
			});

			expect(res.status).toBe(401);
			const body = (await res.json()) as ApiErrorResponse;
			expect(body.code).toBe("UNAUTHORIZED");
			vi.unstubAllEnvs();
		});
	});

	describe("AC4: Invalid JSON body returns 400 with validation errors", () => {
		test("returns 400 with VALIDATION_ERROR for invalid body", async ({ app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const res = await app.request("/api/test-validate", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-API-Key": TEST_API_KEY,
				},
				body: JSON.stringify({ name: 123 }),
			});

			expect(res.status).toBe(400);
			const body = (await res.json()) as ApiErrorResponse;
			expect(body.code).toBe("VALIDATION_ERROR");
			expect(body.error).toBeTruthy();
			expect(body.details).toBeDefined();
			vi.unstubAllEnvs();
		});

		test("returns 200 for valid body", async ({ app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const res = await app.request("/api/test-validate", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-API-Key": TEST_API_KEY,
				},
				body: JSON.stringify({ name: "hello" }),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as { name: string };
			expect(body.name).toBe("hello");
			vi.unstubAllEnvs();
		});
	});

	describe("AC5: Unhandled error returns 500 with consistent error shape", () => {
		test("returns 500 with INTERNAL_ERROR code", async ({ app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const res = await app.request("/api/test-error", {
				headers: { "X-API-Key": TEST_API_KEY },
			});

			expect(res.status).toBe(500);
			const body = (await res.json()) as ApiErrorResponse;
			expect(body.code).toBe("INTERNAL_ERROR");
			expect(body.error).toBeTruthy();
			vi.unstubAllEnvs();
		});

		test("does not include stack trace in error response", async ({ app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const res = await app.request("/api/test-error", {
				headers: { "X-API-Key": TEST_API_KEY },
			});

			const text = await res.text();
			expect(text).not.toContain("at ");
			expect(text).not.toContain("stack");
			vi.unstubAllEnvs();
		});
	});

	describe("AC7: CORS allows localhost:5173", () => {
		test("includes CORS headers for localhost:5173 origin", async ({ app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const res = await app.request("/api/health", {
				headers: {
					// biome-ignore lint/style/useNamingConvention: HTTP header name
					Origin: "http://localhost:5173",
				},
			});

			expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
			vi.unstubAllEnvs();
		});

		test("handles CORS preflight requests", async ({ app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const res = await app.request("/api/health", {
				method: "OPTIONS",
				headers: {
					// biome-ignore lint/style/useNamingConvention: HTTP header name
					Origin: "http://localhost:5173",
					"Access-Control-Request-Method": "POST",
					"Access-Control-Request-Headers": "X-API-Key",
				},
			});

			expect(res.status).toBe(204);
			expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
			expect(res.headers.get("Access-Control-Allow-Headers")).toContain("X-API-Key");
			vi.unstubAllEnvs();
		});

		test("does not set CORS for disallowed origins", async ({ app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const res = await app.request("/api/health", {
				headers: {
					// biome-ignore lint/style/useNamingConvention: HTTP header name
					Origin: "http://evil.com",
				},
			});

			expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
			vi.unstubAllEnvs();
		});
	});

	describe("404 for unknown routes", () => {
		test("returns 404 with NOT_FOUND code for unknown API routes", async ({ app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const res = await app.request("/api/nonexistent", {
				headers: { "X-API-Key": TEST_API_KEY },
			});

			expect(res.status).toBe(404);
			const body = (await res.json()) as ApiErrorResponse;
			expect(body.code).toBe("NOT_FOUND");
			vi.unstubAllEnvs();
		});
	});

	describe("backward compat: GET /health still works", () => {
		test("returns 200 without auth", async ({ app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const res = await app.request("/health");

			expect(res.status).toBe(200);
			const body = (await res.json()) as { status: string };
			expect(body.status).toBe("ok");
			vi.unstubAllEnvs();
		});
	});
});
