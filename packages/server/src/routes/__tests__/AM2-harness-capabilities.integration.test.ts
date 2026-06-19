import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { AdapterPool } from "../../harness/adapter-pool.js";
import { BuiltinHarnessAdapter } from "../../harness/builtin-harness-adapter.js";
import { test } from "../../test-fixtures.js";
import { createTestApp } from "../../test-utils.js";

const TEST_API_KEY = "test-key-am2-harnesses";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY };
}

function makePool(): AdapterPool {
	const pool = new AdapterPool();
	pool.register("local-builtin", new BuiltinHarnessAdapter(), {
		name: "Built-in Harness",
		kind: "local",
		type: "builtin",
		modelProviders: ["anthropic", "openrouter", "openai-compatible"],
		maxConcurrent: 4,
	});
	return pool;
}

describe("AM2 GET /api/harnesses capability descriptors", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns enriched descriptors while retaining legacy selector fields", async ({
		db,
		eventBus,
	}) => {
		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });
		const res = await app.request("/api/harnesses", { headers: authHeaders() });

		expect(res.status).toBe(200);
		const body = (await res.json()) as Array<Record<string, unknown>>;
		const builtin = body.find((entry) => entry.type === "builtin");

		expect(builtin).toBeDefined();
		expect(typeof builtin?.name).toBe("string");
		expect(Array.isArray(builtin?.modelProviders)).toBe(true);
		expect(builtin?.accessMode).toBe("api-gateway");
		expect(builtin?.authAction).toMatchObject({ kind: "enter_api_key" });
		expect(builtin?.discovery).toMatchObject({ state: "ready" });
		expect(Array.isArray(builtin?.models)).toBe(true);
		expect((builtin?.models as unknown[]).length).toBeGreaterThan(0);
		expect(builtin?.runtime).toMatchObject({
			preCompactionTrigger: true,
			mcpSupport: false,
		});
	});

	test("includes missing/readiness entries for first-class CLI subscription harnesses", async ({
		db,
		eventBus,
	}) => {
		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });
		const res = await app.request("/api/harnesses", { headers: authHeaders() });
		const body = (await res.json()) as Array<Record<string, unknown>>;
		const types = new Set(body.map((entry) => entry.type));

		for (const type of ["codex", "claude-code", "cursor-agent", "opencode"]) {
			expect(types.has(type)).toBe(true);
			const descriptor = body.find((entry) => entry.type === type);
			expect(descriptor?.accessMode).toBe("provider-subscription-cli");
			expect(descriptor?.authAction).toMatchObject({ kind: "native_cli_login" });
			expect(descriptor?.discovery).toHaveProperty("state");
		}
	});

	test("does not expose API keys, base URLs, or provider subscription tokens", async ({
		db,
		eventBus,
	}) => {
		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });
		const res = await app.request("/api/harnesses", { headers: authHeaders() });
		const body = await res.json();
		const serialized = JSON.stringify(body);

		expect(serialized).not.toContain("apiKey");
		expect(serialized).not.toContain("baseUrl");
		expect(serialized).not.toContain("sk-");
		expect(serialized).not.toContain("subscriptionToken");
	});
});
