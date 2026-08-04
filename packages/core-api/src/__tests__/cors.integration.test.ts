import { describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-cors";

describe("CORS middleware", () => {
	test("sets Access-Control-Allow-Origin for allowed origin (localhost:5173)", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/health", {
			headers: { origin: "http://localhost:5173" },
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
		vi.unstubAllEnvs();
	});

	test("does not set Access-Control-Allow-Origin for disallowed origin", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/health", {
			headers: { origin: "http://evil.com" },
		});
		expect(res.status).toBe(200);
		const allowOrigin = res.headers.get("Access-Control-Allow-Origin");
		expect(allowOrigin).toBeNull();
		vi.unstubAllEnvs();
	});

	test("responds to OPTIONS preflight with correct headers", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/health", {
			method: "OPTIONS",
			headers: {
				origin: "http://localhost:5173",
				"Access-Control-Request-Method": "POST",
				"Access-Control-Request-Headers": "X-API-Key, Content-Type",
			},
		});
		expect(res.status).toBeLessThanOrEqual(204);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
		expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
		vi.unstubAllEnvs();
	});

	// ── N2: Electron origin support (127.0.0.1:*) ────────────────────────────────

	test("allows http://127.0.0.1 on a random high port (Electron renderer origin)", async ({
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/health", {
			headers: { origin: "http://127.0.0.1:49321" },
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://127.0.0.1:49321");
		vi.unstubAllEnvs();
	});

	test("allows http://127.0.0.1:3001 (Electron accessing same port as server)", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/health", {
			headers: { origin: "http://127.0.0.1:3001" },
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://127.0.0.1:3001");
		vi.unstubAllEnvs();
	});

	test("denies http://127.0.0.1.evil.com (prefix bypass attempt)", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/health", {
			headers: { origin: "http://127.0.0.1.evil.com" },
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
		vi.unstubAllEnvs();
	});

	test("denies http://127.0.0.2:3001 (not loopback — only exact 127.0.0.1 is allowed)", async ({
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/health", {
			headers: { origin: "http://127.0.0.2:3001" },
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
		vi.unstubAllEnvs();
	});

	test("OPTIONS preflight succeeds for http://127.0.0.1 Electron origins", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/health", {
			method: "OPTIONS",
			headers: {
				origin: "http://127.0.0.1:49321",
				"Access-Control-Request-Method": "GET",
				"Access-Control-Request-Headers": "X-API-Key",
			},
		});
		expect(res.status).toBeLessThanOrEqual(204);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://127.0.0.1:49321");
		expect(res.headers.get("Access-Control-Allow-Headers")).toContain("X-API-Key");
		vi.unstubAllEnvs();
	});
});
