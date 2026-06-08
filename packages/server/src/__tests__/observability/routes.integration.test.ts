/**
 * H3 — HTTP surface tests.
 *
 * GET  /api/observability/config   -> redacted keys
 * PATCH /api/observability/config  -> sanitizers + admin audit
 * GET  /api/observability/status   -> dispatcher snapshot
 * POST /api/observability/flush    -> triggers drain
 */

import { factorySettings, type HyperIdleDb } from "@hyperidle/db";
import type { Logger } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "../../test-fixtures.js";
import { createObservabilityRoutes } from "../../routes/observability-routes.js";
import { createObservabilityDispatcher } from "../../services/observability/dispatcher.js";
import type {
	ObservabilityAdapter,
	ObservabilityDispatcher,
} from "../../services/observability/types.js";

function quietAdapter(): ObservabilityAdapter {
	return {
		name: "console",
		record: () => Promise.resolve(),
		flush: () => Promise.resolve(),
	};
}

async function seedKeys(db: HyperIdleDb, keys: Record<string, string>): Promise<void> {
	const now = new Date().toISOString();
	for (const [k, v] of Object.entries(keys)) {
		await db
			.insert(factorySettings)
			.values({ key: k, value: v, updatedAt: now })
			.onConflictDoUpdate({ target: factorySettings.key, set: { value: v, updatedAt: now } });
	}
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

function appWithRoutes(
	db: HyperIdleDb,
	dispatcher: ObservabilityDispatcher | null,
): {
	request: (path: string, init?: RequestInit) => Promise<Response>;
	auditCalls: Array<{ msg: string; extra: unknown }>;
} {
	const { logger, calls } = captureLogger();
	const router = createObservabilityRoutes(db, {
		getDispatcher: () => dispatcher,
		logger,
	});
	const request = (path: string, init?: RequestInit): Promise<Response> => {
		const url = new URL(path, "http://test.local");
		return router.fetch(new Request(url, init));
	};
	return { request, auditCalls: calls };
}

describe("H3 observability routes — GET /config", () => {
	test("returns expected config shape", async ({ db }) => {
		await seedKeys(db, {
			"observability.enabled": "true",
			"observability.adapter": "console",
		});
		const { request } = appWithRoutes(db, null);
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

	test("returns enabled=false and adapter=console by default", async ({ db }) => {
		const { request } = appWithRoutes(db, null);
		const body = (await (await request("/config")).json()) as Record<string, unknown>;
		expect(body.enabled).toBe(false);
		expect(body.adapter).toBe("console");
	});
});

describe("H3 observability routes — PATCH /config", () => {
	test("persists valid patch + emits admin audit", async ({ db }) => {
		const { request, auditCalls } = appWithRoutes(db, null);
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
		expect(auditCalls[0].msg).toBe("config_changed");
	});

	test("rejects invalid adapter with 400", async ({ db }) => {
		const { request } = appWithRoutes(db, null);
		const res = await request("/config", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ adapter: "invalid" }),
		});
		expect(res.status).toBe(400);
	});

	test("rejects unknown fields (strict schema)", async ({ db }) => {
		const { request } = appWithRoutes(db, null);
		const res = await request("/config", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ unknownField: "https://example.com" }),
		});
		expect(res.status).toBe(400);
	});

	test("accepts enabled=false without other fields (disable path)", async ({ db }) => {
		await seedKeys(db, { "observability.enabled": "true" });
		const { request } = appWithRoutes(db, null);
		const res = await request("/config", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ enabled: false }),
		});
		expect(res.status).toBe(200);
		const [row] = await db
			.select()
			.from(factorySettings)
			.where(eq(factorySettings.key, "observability.enabled"));
		expect(row?.value).toBe("false");
	});
});

describe("H3 observability routes — /status + /flush", () => {
	test("status reports enabled=false when no dispatcher and disabled in config", async ({ db }) => {
		const { request } = appWithRoutes(db, null);
		const body = (await (await request("/status")).json()) as Record<string, unknown>;
		expect(body.enabled).toBe(false);
		expect(body.bufferDepth).toBe(0);
	});

	test("status reports enabled=true + adapter=noop when config is {adapter:noop, enabled:true}", async ({ db }) => {
		await seedKeys(db, {
			"observability.enabled": "true",
			"observability.adapter": "noop",
		});
		// noop adapter => no dispatcher wired; /status must still reflect
		// the persisted config instead of silently reporting "disabled".
		const { request } = appWithRoutes(db, null);
		const body = (await (await request("/status")).json()) as Record<string, unknown>;
		expect(body.enabled).toBe(true);
		expect(body.adapter).toBe("noop");
		expect(body.bufferDepth).toBe(0);
	});

	test("status snapshot includes buffer depth + adapter", async ({ db }) => {
		const dispatcher = createObservabilityDispatcher({
			adapter: quietAdapter(),
			config: { batchSize: 10, flushIntervalMs: 60_000, bufferCap: 100 },
		});
		dispatcher.enqueue({
			kind: "session_started",
			traceId: "t",
			sessionId: "s",
			ts: new Date().toISOString(),
			agentId: "a",
			taskId: "k",
		});
		const { request } = appWithRoutes(db, dispatcher);
		const body = (await (await request("/status")).json()) as Record<string, unknown>;
		expect(body.enabled).toBe(true);
		expect(body.bufferDepth).toBe(1);
		expect(body.adapter).toBe("console");
		await dispatcher.dispose();
	});

	test("flush drains buffer", async ({ db }) => {
		const dispatcher = createObservabilityDispatcher({
			adapter: quietAdapter(),
			config: { batchSize: 10, flushIntervalMs: 60_000, bufferCap: 100 },
		});
		for (let i = 0; i < 3; i += 1) {
			dispatcher.enqueue({
				kind: "tool_call",
				traceId: "t",
				sessionId: "s",
				ts: new Date().toISOString(),
				toolName: `T-${i}`,
				argsSummary: "{}",
			});
		}
		const { request } = appWithRoutes(db, dispatcher);
		const res = await request("/flush", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{}",
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.delivered).toBe(3);
		expect(body.bufferDepthAfter).toBe(0);
		await dispatcher.dispose();
	});

	test("flush with no dispatcher returns disabled", async ({ db }) => {
		const { request } = appWithRoutes(db, null);
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
