import { AdapterPool } from "@hyperidle/harness-registry";
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
		// A model the harness reported for itself — `opencode models` output.
		models: [
			{
				id: "openrouter/z-ai/glm-4.7-flash",
				label: "GLM 4.7 Flash",
				provider: "openrouter",
				selectable: true,
				options: [],
			},
		],
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
		// @lore The subject used to be the built-in gateway — the one descriptor
		// guaranteed to be in every response, whose auth action was an API key and
		// whose models came off the model-gateway catalog. It is gone; opencode
		// carries the same shape, with an auth action and a model list that are
		// its own.
		const opencode = body.find((entry) => entry.type === "opencode");

		expect(opencode).toBeDefined();
		expect(typeof opencode?.name).toBe("string");
		expect(Array.isArray(opencode?.modelProviders)).toBe(true);
		expect(opencode?.authAction).toMatchObject({ kind: "native_cli_login" });
		expect(opencode?.discovery).toMatchObject({ state: "ready" });
		expect(Array.isArray(opencode?.models)).toBe(true);
		expect((opencode?.models as unknown[] | undefined)?.length ?? 0).toBeGreaterThan(0);
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
