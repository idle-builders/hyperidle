import { AdapterPool, BuiltinHarnessAdapter } from "@hyperidle/harness-registry";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";
import { createTestApp } from "../../__testing__/test-utils.js";

const TEST_API_KEY = "test-key-am2-harnesses";
type SnapshotValue<T> = T extends Readonly<Record<string, infer V>> ? V : never;
type HarnessDiscoveryInput = SnapshotValue<
	NonNullable<ConstructorParameters<typeof AdapterPool>[0]>
>;

/** AM2: evidence-backed discovery snapshot used for the route integration test.
 *  In production `createLocalAdapterPool()` runs the real probes via
 *  `discoverLocalHarnesses()`; here we use a deterministic map so assertions are
 *  independent of the CI environment. */
const STATIC_DISCOVERIES: Record<string, HarnessDiscoveryInput> = {
	builtin: {
		state: "ready",
		authAction: {
			kind: "enter_api_key",
			label: "Enter API key",
			description: "Store a model gateway API key in HyperIdle.",
			credentialNames: ["anthropic_api_key"],
		},
	},
	codex: {
		state: "ready",
		version: "0.141.0",
		authAction: {
			kind: "native_cli_login",
			label: "Log in to Codex",
			command: ["codex", "login"],
		},
	},
	"claude-code": {
		state: "ready",
		version: "2.1.170",
		authAction: {
			kind: "native_cli_login",
			label: "Log in to Claude Code",
			command: ["claude", "auth", "login"],
		},
	},
	opencode: {
		state: "ready",
		version: "1.17.8",
		authAction: {
			kind: "native_cli_login",
			label: "Log in to OpenCode",
			command: ["opencode", "providers", "login"],
		},
	},
	"cursor-agent": {
		state: "unavailable",
		reason:
			"cursor / cursor-agent CLI is not installed or not on PATH and no documented headless local CLI surface exists.",
	},
};

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY };
}

function makePool(): AdapterPool {
	const pool = new AdapterPool(STATIC_DISCOVERIES);
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
		expect(builtin?.authAction).toMatchObject({ kind: "enter_api_key" });
		expect(builtin?.discovery).toMatchObject({ state: "ready" });
		expect(Array.isArray(builtin?.models)).toBe(true);
		expect((builtin!.models as unknown[]).length).toBeGreaterThan(0);
	});

	test("includes evidence-backed readiness entries for first-class CLI harnesses", async ({
		db,
		eventBus,
	}) => {
		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });
		const res = await app.request("/api/harnesses", { headers: authHeaders() });
		const body = (await res.json()) as Array<Record<string, unknown>>;

		for (const type of ["codex", "claude-code", "opencode"]) {
			const descriptor = body.find((entry) => entry.type === type);
			expect(descriptor).toBeDefined();
			expect(descriptor?.authAction).toMatchObject({ kind: "native_cli_login" });
			expect(descriptor?.discovery).toMatchObject({ state: "ready", version: expect.any(String) });
		}
	});

	test("marks cursor-agent as unavailable rather than inventing support", async ({
		db,
		eventBus,
	}) => {
		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });
		const res = await app.request("/api/harnesses", { headers: authHeaders() });
		const body = (await res.json()) as Array<Record<string, unknown>>;
		const cursor = body.find((entry) => entry.type === "cursor-agent");

		expect(cursor).toBeDefined();
		expect(cursor?.discovery).toMatchObject({ state: "unavailable" });
		const serialized = JSON.stringify(cursor);
		expect(serialized).not.toContain("sk-");
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
