import { createTestDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-cors";

describe("CORS middleware", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("sets Access-Control-Allow-Origin for allowed origin (localhost:5173)", async () => {
		const db = createTestDb();
		const app = createTestApp({ db, eventBus: new EventBus() });

		const res = await app.request("/api/health", {
			headers: { origin: "http://localhost:5173" },
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
	});

	it("does not set Access-Control-Allow-Origin for disallowed origin", async () => {
		const db = createTestDb();
		const app = createTestApp({ db, eventBus: new EventBus() });

		const res = await app.request("/api/health", {
			headers: { origin: "http://evil.com" },
		});
		expect(res.status).toBe(200);
		// Hono CORS middleware must not echo a disallowed origin. The header
		// should be absent entirely (null).
		const allowOrigin = res.headers.get("Access-Control-Allow-Origin");
		expect(allowOrigin).toBeNull();
	});

	it("responds to OPTIONS preflight with correct headers", async () => {
		const db = createTestDb();
		const app = createTestApp({ db, eventBus: new EventBus() });

		const res = await app.request("/api/health", {
			method: "OPTIONS",
			headers: {
				origin: "http://localhost:5173",
				"Access-Control-Request-Method": "POST",
				"Access-Control-Request-Headers": "X-API-Key, Content-Type",
			},
		});
		// OPTIONS preflight should succeed (200 or 204)
		expect(res.status).toBeLessThanOrEqual(204);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
		expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
	});
});
