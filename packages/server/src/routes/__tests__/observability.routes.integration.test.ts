/**
 * V1 — Route integration tests for observability endpoints.
 *
 * GET   /api/observability           — resource descriptor
 * GET   /api/observability/config    — get config
 * PATCH /api/observability/config    — update config
 * GET   /api/observability/status    — dispatcher status
 * POST  /api/observability/flush     — flush dispatcher
 */

import { createTestDb } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { createObservabilityRoutes } from "../../routes/observability-routes.js";
import type {
	FlushOutcome,
	ObservabilityDispatcher,
	ObservabilityDispatcherStatus,
} from "@hyperidle/core-app";
import { test } from "../../test-fixtures.js";

const TEST_API_KEY = "test-key-observability";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

function makeStubDispatcher(): ObservabilityDispatcher {
	return {
		status: (): ObservabilityDispatcherStatus => ({
			bufferDepth: 5,
			lastFlushAt: null,
			lastErrorAt: null,
			lastError: null,
			dropped: 0,
			delivered: 10,
			adapter: "console",
		}),
		flush: async (): Promise<FlushOutcome> => ({ flushed: 5, dropped: 0, errors: 0 }),
		enqueue: () => {},
		dispose: async () => {},
	};
}

describe("observability routes", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("observability auth", () => {
		test("returns 401 without auth header on GET /api/observability", async ({ app }) => {
			const res = await app.request("/api/observability", { method: "GET" });
			expect(res.status).toBe(401);
		});
	});

	describe("GET /api/observability", () => {
		test("returns 200 with resource descriptor", async ({ app }) => {
			const res = await app.request("/api/observability", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { ok: boolean; resource: string };
			expect(body.ok).toBe(true);
			expect(body.resource).toBe("observability");
		});
	});

	describe("GET /api/observability/config", () => {
		test("returns 200 with redacted config", async ({ app }) => {
			const res = await app.request("/api/observability/config", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { enabled: boolean; adapter: string };
			expect(typeof body.enabled).toBe("boolean");
			expect(typeof body.adapter).toBe("string");
		});
	});

	describe("PATCH /api/observability/config", () => {
		test("returns 200 with updated config", async ({ app }) => {
			const res = await app.request("/api/observability/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ adapter: "noop" }),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { adapter: string };
			expect(body.adapter).toBe("noop");
		});

		test("returns 400 on invalid field values", async ({ app }) => {
			const res = await app.request("/api/observability/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ adapter: "invalid_adapter" }),
			});
			expect(res.status).toBe(400);
		});

		test("returns 400 with extra/unknown fields (strict schema)", async ({ app }) => {
			const res = await app.request("/api/observability/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ unknownField: "value" }),
			});
			expect(res.status).toBe(400);
		});
	});

	describe("GET /api/observability/status", () => {
		test("returns 200 with disabled status when no dispatcher", async ({ app }) => {
			const res = await app.request("/api/observability/status", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { enabled: boolean; bufferDepth: number };
			// When observability is not configured with a real adapter, dispatcher is null
			expect(typeof body.enabled).toBe("boolean");
			expect(typeof body.bufferDepth).toBe("number");
		});

		test("returns 200 with active status when dispatcher exists (direct route)", async () => {
			const handle = await createTestDb();
			const stubDb = handle.db;
			const dispatcher = makeStubDispatcher();

			const router = createObservabilityRoutes(stubDb, {
				getDispatcher: () => dispatcher,
			});

			try {
				const res = await router.request("/status", {
					method: "GET",
					headers: { "Content-Type": "application/json" },
				});
				expect(res.status).toBe(200);
				const body = (await res.json()) as {
					enabled: boolean;
					bufferDepth: number;
					delivered: number;
					adapter: string;
				};
				expect(body.enabled).toBe(true);
				expect(body.bufferDepth).toBe(5);
				expect(body.delivered).toBe(10);
				expect(body.adapter).toBe("console");
			} finally {
				await handle.close();
			}
		});
	});

	describe("POST /api/observability/flush", () => {
		// @lore AF16 T14: default-on means the fixture app now wires a real dispatcher
		// on an empty DB. Use the direct router approach (no dispatcher injected) to
		// test the reason:disabled path — same pattern as the sibling test below.
		test("returns 200 with flushed:0 reason:disabled when no dispatcher", async () => {
			const handle = await createTestDb();
			const stubDb = handle.db;
			const router = createObservabilityRoutes(stubDb, {
				getDispatcher: () => null,
			});
			try {
				const res = await router.request("/flush", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({}),
				});
				expect(res.status).toBe(200);
				const body = (await res.json()) as { flushed: number; reason?: string };
				expect(body.flushed).toBe(0);
				expect(body.reason).toBe("disabled");
			} finally {
				await handle.close();
			}
		});

		test("returns 200 with flush result when dispatcher exists (direct route)", async () => {
			const handle = await createTestDb();
			const stubDb = handle.db;
			const dispatcher = makeStubDispatcher();

			const router = createObservabilityRoutes(stubDb, {
				getDispatcher: () => dispatcher,
			});

			try {
				const res = await router.request("/flush", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({}),
				});
				expect(res.status).toBe(200);
				const body = (await res.json()) as {
					flushed: number;
					dropped: number;
					errors: number;
				};
				expect(body.flushed).toBe(5);
				expect(body.dropped).toBe(0);
				expect(body.errors).toBe(0);
			} finally {
				await handle.close();
			}
		});

		test("returns 413 when content-length exceeds MAX_BODY_BYTES", async ({ app }) => {
			// MAX_BODY_BYTES = 8 * 1024 = 8192
			const res = await app.request("/api/observability/flush", {
				method: "POST",
				headers: {
					...authHeaders(),
					"content-length": "9000",
				},
				body: JSON.stringify({}),
			});
			expect(res.status).toBe(413);
		});
	});
});
