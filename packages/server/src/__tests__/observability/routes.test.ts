/**
 * H3 — HTTP surface tests.
 *
 * GET  /api/observability/config   -> redacted keys
 * PATCH /api/observability/config  -> sanitizers + admin audit
 * GET  /api/observability/status   -> dispatcher snapshot
 * POST /api/observability/flush    -> triggers drain
 */

import { createTestDb, factorySettings, type HyperIdleDb, type TestDbHandle } from "@hyperidle/db";
import type { Logger } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
	let handle: TestDbHandle;
	let db: HyperIdleDb;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
	});

	afterEach(async () => {
		await handle?.close();
	});

	it("returns config shape with no langfuse property", async () => {
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
		// No langfuse property after purge
		expect(body).not.toHaveProperty("langfuse");
		expect(JSON.stringify(body)).not.toContain("langfuse");
	});

	it("returns enabled=false and adapter=console by default", async () => {
		const { request } = appWithRoutes(db, null);
		const body = (await (await request("/config")).json()) as Record<string, unknown>;
		expect(body.enabled).toBe(false);
		expect(body.adapter).toBe("console");
		expect(body).not.toHaveProperty("langfuse");
	});
});

describe("H3 observability routes — PATCH /config", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
	});

	afterEach(async () => {
		await handle?.close();
	});

	it("persists valid patch + emits admin audit", async () => {
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
		expect(body).not.toHaveProperty("langfuse");
		expect(auditCalls).toHaveLength(1);
		expect(auditCalls[0].msg).toBe("config_changed");
	});

	it('rejects adapter: "langfuse" with 400 (AC3)', async () => {
		const { request } = appWithRoutes(db, null);
		const res = await request("/config", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ adapter: "langfuse" }),
		});
		expect(res.status).toBe(400);
	});

	it("rejects unknown fields (strict schema)", async () => {
		const { request } = appWithRoutes(db, null);
		const res = await request("/config", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ langfuseUrl: "https://cloud.langfuse.com" }),
		});
		expect(res.status).toBe(400);
	});

	it("accepts enabled=false without other fields (disable path)", async () => {
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
	let handle: TestDbHandle;
	let db: HyperIdleDb;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
	});

	afterEach(async () => {
		await handle?.close();
	});

	it("status reports enabled=false when no dispatcher and disabled in config", async () => {
		const { request } = appWithRoutes(db, null);
		const body = (await (await request("/status")).json()) as Record<string, unknown>;
		expect(body.enabled).toBe(false);
		expect(body.bufferDepth).toBe(0);
	});

	it("status reports enabled=true + adapter=noop when config is {adapter:noop, enabled:true}", async () => {
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

	it("status snapshot includes buffer depth + adapter", async () => {
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

	it("flush drains buffer", async () => {
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

	it("flush with no dispatcher returns disabled", async () => {
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
