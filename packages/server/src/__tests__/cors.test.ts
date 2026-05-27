import { createTestDb ,
	type TestDbHandle
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-cors";

describe("CORS middleware", () => {
	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
	});

	it("sets Access-Control-Allow-Origin for allowed origin (localhost:5173)", async () => {
		const db = createTestDb();
		const app = await createTestApp({ db, eventBus: new EventBus() });

		const res = await app.request("/api/health", {
			headers: { origin: "http://localhost:5173" },
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
	});

	it("does not set Access-Control-Allow-Origin for disallowed origin", async () => {
		const db = createTestDb();
		const app = await createTestApp({ db, eventBus: new EventBus() });

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
		const app = await createTestApp({ db, eventBus: new EventBus() });

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

	// ── N2: Electron origin support (127.0.0.1:*) ────────────────────────────────

	it("allows http://127.0.0.1 on a random high port (Electron renderer origin)", async () => {
		// Arrange: Electron loads the SPA from a random port assigned by the OS
		const db = createTestDb();
		const app = await createTestApp({ db, eventBus: new EventBus() });

		// Act
		const res = await app.request("/api/health", {
			headers: { origin: "http://127.0.0.1:49321" },
		});

		// Assert: origin is echoed back, allowing the Electron request
		expect(res.status).toBe(200);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://127.0.0.1:49321");
	});

	it("allows http://127.0.0.1:3001 (Electron accessing same port as server)", async () => {
		// Arrange
		const db = createTestDb();
		const app = await createTestApp({ db, eventBus: new EventBus() });

		// Act
		const res = await app.request("/api/health", {
			headers: { origin: "http://127.0.0.1:3001" },
		});

		// Assert
		expect(res.status).toBe(200);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://127.0.0.1:3001");
	});

	it("denies http://127.0.0.1.evil.com (prefix bypass attempt)", async () => {
		const db = createTestDb();
		const app = await createTestApp({ db, eventBus: new EventBus() });
		const res = await app.request("/api/health", {
			headers: { origin: "http://127.0.0.1.evil.com" },
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
	});

	it("denies http://127.0.0.2:3001 (not loopback — only exact 127.0.0.1 is allowed)", async () => {
		// Arrange: 127.0.0.2 is not the canonical loopback address
		const db = createTestDb();
		const app = await createTestApp({ db, eventBus: new EventBus() });

		// Act
		const res = await app.request("/api/health", {
			headers: { origin: "http://127.0.0.2:3001" },
		});

		// Assert: CORS header must not be set for a non-loopback address
		expect(res.status).toBe(200);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
	});

	it("OPTIONS preflight succeeds for http://127.0.0.1 Electron origins", async () => {
		// Arrange
		const db = createTestDb();
		const app = await createTestApp({ db, eventBus: new EventBus() });

		// Act
		const res = await app.request("/api/health", {
			method: "OPTIONS",
			headers: {
				origin: "http://127.0.0.1:49321",
				"Access-Control-Request-Method": "GET",
				"Access-Control-Request-Headers": "X-API-Key",
			},
		});

		// Assert: preflight must succeed and echo the Electron origin
		expect(res.status).toBeLessThanOrEqual(204);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://127.0.0.1:49321");
		expect(res.headers.get("Access-Control-Allow-Headers")).toContain("X-API-Key");
	});
});
