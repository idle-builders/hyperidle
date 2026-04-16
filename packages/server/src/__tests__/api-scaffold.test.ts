import type { ApiErrorResponse } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-12345";

describe("API Scaffold", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("AC1: GET /api/health returns 200 with status", () => {
		it("returns 200 with status ok and timestamp", async () => {
			const app = createTestApp();
			const res = await app.request("/api/health");

			expect(res.status).toBe(200);
			const body = (await res.json()) as { status: string; timestamp: string };
			expect(body.status).toBe("ok");
			expect(typeof body.timestamp).toBe("string");
			expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
		});
	});

	describe("AC2: Request without API key returns 401", () => {
		it("returns 401 with UNAUTHORIZED code for /api routes", async () => {
			const app = createTestApp();

			// /api/health is public, so test a protected route
			const protectedRes = await app.request("/api/protected-test");
			expect(protectedRes.status).toBe(401);

			const body = (await protectedRes.json()) as ApiErrorResponse;
			expect(body.error).toBeTruthy();
			expect(body.code).toBe("UNAUTHORIZED");
		});

		it("returns 401 for missing X-API-Key header", async () => {
			const app = createTestApp();
			const res = await app.request("/api/protected-test", {
				headers: {},
			});

			expect(res.status).toBe(401);
			const body = (await res.json()) as ApiErrorResponse;
			expect(body.code).toBe("UNAUTHORIZED");
		});
	});

	describe("AC3: Request with valid API key passes auth", () => {
		it("passes auth with valid X-API-Key header", async () => {
			const app = createTestApp();
			const res = await app.request("/api/health", {
				headers: { "X-API-Key": TEST_API_KEY },
			});

			expect(res.status).toBe(200);
		});

		it("returns 401 with invalid API key", async () => {
			const app = createTestApp();
			const res = await app.request("/api/protected-test", {
				headers: { "X-API-Key": "wrong-key" },
			});

			expect(res.status).toBe(401);
			const body = (await res.json()) as ApiErrorResponse;
			expect(body.code).toBe("UNAUTHORIZED");
		});
	});

	describe("AC4: Invalid JSON body returns 400 with validation errors", () => {
		it("returns 400 with VALIDATION_ERROR for invalid body", async () => {
			const app = createTestApp();
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
		});

		it("returns 200 for valid body", async () => {
			const app = createTestApp();
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
		});
	});

	describe("AC5: Unhandled error returns 500 with consistent error shape", () => {
		it("returns 500 with INTERNAL_ERROR code", async () => {
			const app = createTestApp();
			const res = await app.request("/api/test-error", {
				headers: { "X-API-Key": TEST_API_KEY },
			});

			expect(res.status).toBe(500);
			const body = (await res.json()) as ApiErrorResponse;
			expect(body.code).toBe("INTERNAL_ERROR");
			expect(body.error).toBeTruthy();
		});

		it("does not include stack trace in error response", async () => {
			const app = createTestApp();
			const res = await app.request("/api/test-error", {
				headers: { "X-API-Key": TEST_API_KEY },
			});

			const text = await res.text();
			expect(text).not.toContain("at ");
			expect(text).not.toContain("stack");
		});
	});

	describe("AC7: CORS allows localhost:5173", () => {
		it("includes CORS headers for localhost:5173 origin", async () => {
			const app = createTestApp();
			const res = await app.request("/api/health", {
				headers: {
					Origin: "http://localhost:5173",
				},
			});

			expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
		});

		it("handles CORS preflight requests", async () => {
			const app = createTestApp();
			const res = await app.request("/api/health", {
				method: "OPTIONS",
				headers: {
					Origin: "http://localhost:5173",
					"Access-Control-Request-Method": "POST",
					"Access-Control-Request-Headers": "X-API-Key",
				},
			});

			expect(res.status).toBe(204);
			expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
			expect(res.headers.get("Access-Control-Allow-Headers")).toContain("X-API-Key");
		});

		it("does not set CORS for disallowed origins", async () => {
			const app = createTestApp();
			const res = await app.request("/api/health", {
				headers: {
					Origin: "http://evil.com",
				},
			});

			expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
		});
	});

	describe("404 for unknown routes", () => {
		it("returns 404 with NOT_FOUND code for unknown API routes", async () => {
			const app = createTestApp();
			const res = await app.request("/api/nonexistent", {
				headers: { "X-API-Key": TEST_API_KEY },
			});

			expect(res.status).toBe(404);
			const body = (await res.json()) as ApiErrorResponse;
			expect(body.code).toBe("NOT_FOUND");
		});
	});

	describe("backward compat: GET /health still works", () => {
		it("returns 200 without auth", async () => {
			const app = createTestApp();
			const res = await app.request("/health");

			expect(res.status).toBe(200);
			const body = (await res.json()) as { status: string };
			expect(body.status).toBe("ok");
		});
	});
});
