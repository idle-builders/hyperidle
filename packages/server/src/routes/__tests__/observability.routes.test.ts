/**
 * V1 — Route integration tests for observability endpoints.
 *
 * GET   /api/observability           — resource descriptor
 * GET   /api/observability/config    — get config
 * PATCH /api/observability/config    — update config
 * GET   /api/observability/status    — dispatcher status
 * POST  /api/observability/flush     — flush dispatcher
 */

import { createTestDb, type HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createObservabilityRoutes } from "../../routes/observability-routes.js";
import type {
	FlushOutcome,
	ObservabilityDispatcher,
	ObservabilityDispatcherStatus,
} from "../../services/observability/types.js";
import { createTestApp } from "../../test-utils.js";

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
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("observability auth", () => {
		it("returns 401 without auth header on GET /api/observability", async () => {
			const res = await app.request("/api/observability", { method: "GET" });
			expect(res.status).toBe(401);
		});
	});

	describe("GET /api/observability", () => {
		it("returns 200 with resource descriptor", async () => {
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
		it("returns 200 with redacted config", async () => {
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
		it("returns 200 with updated config", async () => {
			const res = await app.request("/api/observability/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ adapter: "noop" }),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { adapter: string };
			expect(body.adapter).toBe("noop");
		});

		it("returns 400 on invalid field values", async () => {
			const res = await app.request("/api/observability/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ adapter: "invalid_adapter" }),
			});
			expect(res.status).toBe(400);
		});

		it("returns 400 with extra/unknown fields (strict schema)", async () => {
			const res = await app.request("/api/observability/config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ unknownField: "value" }),
			});
			expect(res.status).toBe(400);
		});
	});

	describe("GET /api/observability/status", () => {
		it("returns 200 with disabled status when no dispatcher", async () => {
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

		it("returns 200 with active status when dispatcher exists (direct route)", async () => {
			const handle = await createTestDb();
			const stubDb = handle.db;
			const dispatcher = makeStubDispatcher();

			const router = createObservabilityRoutes(stubDb, {
				getDispatcher: () => dispatcher,
			});

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
		});
	});

	describe("POST /api/observability/flush", () => {
		it("returns 200 with flushed:0 reason:disabled when no dispatcher", async () => {
			const res = await app.request("/api/observability/flush", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({}),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { flushed: number; reason?: string };
			expect(body.flushed).toBe(0);
			expect(body.reason).toBe("disabled");
		});

		it("returns 200 with flush result when dispatcher exists (direct route)", async () => {
			const handle = await createTestDb();
			const stubDb = handle.db;
			const dispatcher = makeStubDispatcher();

			const router = createObservabilityRoutes(stubDb, {
				getDispatcher: () => dispatcher,
			});

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
		});

		it("returns 413 when content-length exceeds MAX_BODY_BYTES", async () => {
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
