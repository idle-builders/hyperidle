/**
 * H3 — HTTP surface tests.
 *
 * GET  /api/observability/config   -> redacted keys
 * PATCH /api/observability/config  -> sanitizers + admin audit
 * GET  /api/observability/status   -> dispatcher snapshot
 * POST /api/observability/flush    -> triggers drain
 *
 * AU20 Ab3: migrated from `ObservabilityDispatcher` + `createObservabilityDispatcher`
 * to `ObservabilityRuntime` per the collapsed surface.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import {
	type ObservabilityRuntime,
	type ObservabilityStatus,
	updateObservabilityConfig,
} from "@hyperidle/observability";
import { readServerConfig, updateServerConfig } from "@hyperidle/settings";
import type { Logger } from "@hyperidle/shared";
import { createObservabilityRoutes } from "../../routes/observability-routes.js";
import { describe, expect, test } from "../../test-fixtures.js";

/** Same port-wiring idiom as `observability-routes.ts`'s `observabilityServerConfigPort`. */
const observabilityServerConfigPort = { read: readServerConfig, update: updateServerConfig };

// @lore AU18: seeds via updateObservabilityConfig (server_config-backed) instead
// of raw factorySettings KV rows — same observable outcome, new storage.
async function seedKeys(
	db: HyperIdleDb,
	patch: { enabled?: boolean; adapter?: "console" | "noop" },
): Promise<void> {
	await updateObservabilityConfig(db, patch, { serverConfig: observabilityServerConfigPort });
}

function captureLogger(): { logger: Logger; calls: Array<{ msg: string; extra: unknown }> } {
	const calls: Array<{ msg: string; extra: unknown }> = [];
	const logger: Logger = {
		debug: (): void => undefined,
		info: (msg, extra): void => {
			calls.push({ msg, extra });
		},
		warn: (): void => undefined,
		error: (): void => undefined,
	};
	return { logger, calls };
}

/**
 * Create a stub ObservabilityRuntime with configurable status.
 */
function makeStubRuntime(status: ObservabilityStatus): ObservabilityRuntime {
	return {
		status: () => status,
		flush: async () => ({ flushed: status.delivered, dropped: 0, errors: 0 }),
		reconfigure: () => {},
		dispose: async () => {},
	};
}

function appWithRoutes(
	db: HyperIdleDb,
	runtime: ObservabilityRuntime,
): {
	request: (path: string, init?: RequestInit) => Promise<Response>;
	auditCalls: Array<{ msg: string; extra: unknown }>;
} {
	const { logger, calls } = captureLogger();
	const router = createObservabilityRoutes(db, {
		getRuntime: () => runtime,
		logger,
	});
	const request = (path: string, init?: RequestInit): Promise<Response> => {
		const url = new URL(path, "http://test.local");
		return Promise.resolve(router.fetch(new Request(url, init)));
	};
	return { request, auditCalls: calls };
}

/** Disabled-state runtime for tests that want /status to reflect disabled. */
function disabledRuntime(adapter: "console" | "noop" = "console"): ObservabilityRuntime {
	return makeStubRuntime({
		enabled: false,
		adapter,
		bufferDepth: 0,
		lastFlushAt: null,
		lastErrorAt: null,
		lastError: null,
		dropped: 0,
		delivered: 0,
	});
}

describe("H3 observability routes — GET /config", () => {
	test("returns expected config shape", async ({ db }) => {
		await seedKeys(db, { enabled: true, adapter: "console" });
		const { request } = appWithRoutes(db, disabledRuntime());
		const res = await request("/config");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		// Shape must include all surviving fields
		expect(body).toHaveProperty("enabled", true);
		expect(body).toHaveProperty("adapter", "console");
		expect(body).toHaveProperty("batchSize");
		expect(body).toHaveProperty("flushIntervalMs");
		expect(body).toHaveProperty("bufferCap");
	});

	// @lore AF16 T14: default flipped from false to true (default-on).
	// No factory_settings row → enabled=true (was false before AF16 T14).
	test("returns enabled=true and adapter=console by default (default-on, AF16 T14)", async ({
		db,
	}) => {
		const { request } = appWithRoutes(db, disabledRuntime());
		const body = (await (await request("/config")).json()) as Record<string, unknown>;
		expect(body.enabled).toBe(true);
		expect(body.adapter).toBe("console");
	});
});

describe("H3 observability routes — PATCH /config", () => {
	test("persists valid patch + emits admin audit", async ({ db }) => {
		const { request, auditCalls } = appWithRoutes(db, disabledRuntime());
		const res = await request("/config", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				enabled: true,
				adapter: "console",
				batchSize: 50,
			}),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.enabled).toBe(true);
		expect(body.adapter).toBe("console");
		expect(body.batchSize).toBe(50);
		expect(auditCalls).toHaveLength(1);
		expect(auditCalls[0]!.msg).toBe("config_changed");
	});

	test("rejects invalid adapter with 400", async ({ db }) => {
		const { request } = appWithRoutes(db, disabledRuntime());
		const res = await request("/config", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ adapter: "invalid" }),
		});
		expect(res.status).toBe(400);
	});

	test("rejects unknown fields (strict schema)", async ({ db }) => {
		const { request } = appWithRoutes(db, disabledRuntime());
		const res = await request("/config", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ unknownField: "https://example.com" }),
		});
		expect(res.status).toBe(400);
	});

	test("accepts enabled=false without other fields (disable path)", async ({ db }) => {
		await seedKeys(db, { enabled: true });
		const { request } = appWithRoutes(db, disabledRuntime());
		const res = await request("/config", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ enabled: false }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.enabled).toBe(false);
	});
});

describe("H3 observability routes — /status + /flush", () => {
	// @lore AF16 T14: must explicitly seed enabled=false; default is now true (default-on).
	test("status reports enabled=false when runtime reports disabled", async ({ db }) => {
		await seedKeys(db, { enabled: false });
		const { request } = appWithRoutes(db, disabledRuntime());
		const body = (await (await request("/status")).json()) as Record<string, unknown>;
		expect(body.enabled).toBe(false);
		expect(body.bufferDepth).toBe(0);
	});

	test("status reports enabled=true + adapter=noop when runtime returns noop status", async ({
		db,
	}) => {
		await seedKeys(db, { enabled: true, adapter: "noop" });
		// Runtime with noop adapter still marks itself enabled but has no dispatcher depth.
		const runtime = makeStubRuntime({
			enabled: true,
			adapter: "noop",
			bufferDepth: 0,
			lastFlushAt: null,
			lastErrorAt: null,
			lastError: null,
			dropped: 0,
			delivered: 0,
		});
		const { request } = appWithRoutes(db, runtime);
		const body = (await (await request("/status")).json()) as Record<string, unknown>;
		expect(body.enabled).toBe(true);
		expect(body.adapter).toBe("noop");
		expect(body.bufferDepth).toBe(0);
	});

	test("status snapshot includes buffer depth + adapter", async ({ db }) => {
		// Stub a runtime that reports a non-zero buffer depth.
		const runtime = makeStubRuntime({
			enabled: true,
			adapter: "console",
			bufferDepth: 1,
			lastFlushAt: null,
			lastErrorAt: null,
			lastError: null,
			dropped: 0,
			delivered: 0,
		});
		const { request } = appWithRoutes(db, runtime);
		const body = (await (await request("/status")).json()) as Record<string, unknown>;
		expect(body.enabled).toBe(true);
		expect(body.bufferDepth).toBe(1);
		expect(body.adapter).toBe("console");
	});

	test("flush drains buffer", async ({ db }) => {
		const runtime = makeStubRuntime({
			enabled: true,
			adapter: "console",
			bufferDepth: 3,
			lastFlushAt: null,
			lastErrorAt: null,
			lastError: null,
			dropped: 0,
			delivered: 3,
		});
		const { request } = appWithRoutes(db, runtime);
		const res = await request("/flush", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{}",
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.delivered).toBe(3);
	});

	test("flush with disabled runtime returns disabled", async ({ db }) => {
		const { request } = appWithRoutes(db, disabledRuntime());
		const res = await request("/flush", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{}",
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.reason).toBe("disabled");
	});
});
