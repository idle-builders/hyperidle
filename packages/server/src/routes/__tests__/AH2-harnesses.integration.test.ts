/**
 * AH2 RED — GET /api/harnesses integration tests
 *
 * AC2: Harness chosen from registry; constrained selector feeds from registered types
 * - GET /api/harnesses returns the deduped list of registered harness types
 * - Response includes type, name, modelProviders
 * - Does NOT include any secrets (apiKey, baseUrl)
 * - Requires founder auth (public-data boundary)
 *
 * These tests FAIL until:
 *  - packages/server/src/routes/harnesses.ts is created
 *  - GET /api/harnesses is mounted in app.ts
 */

import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { AdapterPool } from "../../harness/adapter-pool.js";
import { BuiltinHarnessAdapter } from "../../harness/builtin-harness-adapter.js";
import { ClaudeAgentSdkAdapter } from "../../harness/claude-agent-sdk-adapter.js";
import { test } from "../../test-fixtures.js";
import { createTestApp } from "../../test-utils.js";

const TEST_API_KEY = "test-key-ah2-harnesses";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY };
}

/** Minimal adapter pool for AH2 harness tests (builtin + claude-code only). */
function makeAH2Pool(): AdapterPool {
	const pool = new AdapterPool();
	pool.register("local-builtin", new BuiltinHarnessAdapter(), {
		name: "Built-in Harness",
		kind: "local",
		type: "builtin",
		modelProviders: ["anthropic", "openrouter", "openai-compatible"],
		maxConcurrent: 4,
	});
	pool.register("local-claude-code", new ClaudeAgentSdkAdapter(), {
		name: "Claude Code",
		kind: "local",
		type: "claude-code",
		modelProviders: ["anthropic"],
		maxConcurrent: 4,
	});
	return pool;
}

describe("AH2 AC2: GET /api/harnesses — returns registered harness types", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns 200 with an array", async ({ db, eventBus }) => {
		const app = await createTestApp({ db, eventBus, adapterPool: makeAH2Pool() });
		const res = await app.request("/api/harnesses", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as unknown[];
		expect(Array.isArray(body)).toBe(true);
	});

	test("returns 401 without auth", async ({ db, eventBus }) => {
		const app = await createTestApp({ db, eventBus, adapterPool: makeAH2Pool() });
		const res = await app.request("/api/harnesses");
		expect(res.status).toBe(401);
	});

	test("each entry has type, name, modelProviders fields", async ({ db, eventBus }) => {
		const app = await createTestApp({ db, eventBus, adapterPool: makeAH2Pool() });
		const res = await app.request("/api/harnesses", { headers: authHeaders() });
		const body = (await res.json()) as Array<Record<string, unknown>>;

		// The local pool always registers 'builtin' and 'claude-code'
		expect(body.length).toBeGreaterThanOrEqual(1);

		for (const entry of body) {
			expect(typeof entry.type).toBe("string");
			expect(typeof entry.name).toBe("string");
			expect(Array.isArray(entry.modelProviders)).toBe(true);
		}
	});

	test("response does NOT include apiKey or baseUrl (no secret leak)", async ({ db, eventBus }) => {
		const app = await createTestApp({ db, eventBus, adapterPool: makeAH2Pool() });
		const res = await app.request("/api/harnesses", { headers: authHeaders() });
		const body = (await res.json()) as Array<Record<string, unknown>>;

		for (const entry of body) {
			expect(entry.apiKey).toBeUndefined();
			expect(entry.baseUrl).toBeUndefined();
		}
	});

	test("includes 'builtin' harness type (always registered)", async ({ db, eventBus }) => {
		const app = await createTestApp({ db, eventBus, adapterPool: makeAH2Pool() });
		const res = await app.request("/api/harnesses", { headers: authHeaders() });
		const body = (await res.json()) as Array<Record<string, unknown>>;

		const builtin = body.find((h) => h.type === "builtin");
		expect(builtin).toBeDefined();
	});

	test("includes 'claude-code' harness type (always registered)", async ({ db, eventBus }) => {
		const app = await createTestApp({ db, eventBus, adapterPool: makeAH2Pool() });
		const res = await app.request("/api/harnesses", { headers: authHeaders() });
		const body = (await res.json()) as Array<Record<string, unknown>>;

		const claudeCode = body.find((h) => h.type === "claude-code");
		expect(claudeCode).toBeDefined();
	});

	test("builtin modelProviders includes anthropic", async ({ db, eventBus }) => {
		const app = await createTestApp({ db, eventBus, adapterPool: makeAH2Pool() });
		const res = await app.request("/api/harnesses", { headers: authHeaders() });
		const body = (await res.json()) as Array<Record<string, unknown>>;

		const builtin = body.find((h) => h.type === "builtin") as
			| { modelProviders: string[] }
			| undefined;
		expect(builtin?.modelProviders).toContain("anthropic");
	});

	test("deduplicates by type (no duplicate type values)", async ({ db, eventBus }) => {
		const app = await createTestApp({ db, eventBus, adapterPool: makeAH2Pool() });
		const res = await app.request("/api/harnesses", { headers: authHeaders() });
		const body = (await res.json()) as Array<Record<string, unknown>>;

		const types = body.map((h) => h.type);
		const uniqueTypes = [...new Set(types)];
		expect(types.length).toBe(uniqueTypes.length);
	});
});
