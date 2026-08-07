/**
 * AH2 RED — GET /api/harnesses integration tests
 *
 * AC2: Harness chosen from registry; constrained selector feeds from registered types
 * - GET /api/harnesses returns the deduped list of registered harness types
 * - Response includes type, name, modelProviders
 * - Does NOT include any secrets (apiKey, baseUrl)
 * - Requires founder auth (public-data boundary)
 * - Accepts BOTH X-API-Key (local mode) AND Bearer token (shared mode) — H-1 fix
 *
 * These tests FAIL until:
 *  - packages/server/src/routes/harnesses.ts is created
 *  - GET /api/harnesses is mounted in app.ts
 */

import { users } from "@hyperidle/db";
import { AdapterPool, createHarnessAdapter } from "@hyperidle/harness-registry";
import { createLoginSession } from "@hyperidle/users";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";
import { createTestApp } from "../../__testing__/test-utils.js";

const TEST_API_KEY = "test-key-ah2-harnesses";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY };
}

/**
 * Minimal adapter pool for AH2 harness tests (builtin + claude-code).
 *
 * @lore claude-cli-adapter: Uses CliHarnessAdapter(CLAUDE_CLI_CONFIG) instead of
 * ClaudeAgentSdkAdapter (deleted). The pool construction explicitly registers
 * claude-code to preserve test coverage regardless of whether the `claude`
 * binary is installed — the test validates the HTTP API behavior, not binary
 * availability. This mirrors the production pool which conditionally registers
 * only when `claude` is on PATH; here we register unconditionally for API coverage.
 */
function makeAH2Pool(): AdapterPool {
	const pool = new AdapterPool();
	pool.register("local-builtin", createHarnessAdapter({ kind: "builtin" }), {
		name: "Built-in Harness",
		kind: "local",
		type: "builtin",
		modelProviders: ["anthropic", "openrouter", "openai-compatible"],
		maxConcurrent: 4,
	});
	pool.register(
		"local-claude-code",
		createHarnessAdapter({
			kind: "cli",
			config: { binary: "claude", args: [], envMap: {}, eventFormat: "text", envAllowlist: [] },
		}),
		{
			name: "Claude Code",
			kind: "local",
			type: "claude-code",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		},
	);
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

		// The test pool always registers 'builtin' and 'claude-code' (unconditional for API coverage)
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

	test("includes 'claude-code' harness type (registered in test pool)", async ({
		db,
		eventBus,
	}) => {
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

// ---------------------------------------------------------------------------
// H-1 regression: shared-mode Bearer auth must succeed (no in-route X-API-Key check)
// ---------------------------------------------------------------------------

describe("AH2 H-1 regression: GET /api/harnesses accepts Bearer token (shared mode)", () => {
	const NOW = new Date().toISOString();

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("200 with valid Bearer token (no X-API-Key sent)", async ({ db, eventBus }) => {
		// Arrange: seed a human user and create a login session token
		await db
			.insert(users)
			.values({
				id: "u-harness-bearer",
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				createdAt: NOW,
			})
			.onConflictDoNothing();

		const { token } = await createLoginSession(db, "u-harness-bearer");

		// sharedMode=true activates Bearer token path in the auth middleware.
		// This simulates shared mode (e.g. cloud/VPS install) where the Settings
		// UI sends Authorization: Bearer rather than X-API-Key.
		const app = await createTestApp({ db, eventBus, adapterPool: makeAH2Pool(), sharedMode: true });

		// Act: send ONLY a Bearer token — no X-API-Key header
		const res = await app.request("/api/harnesses", {
			headers: { Authorization: `Bearer ${token}` },
		});

		// Assert: must succeed (not 401) — proves the in-route X-API-Key check is gone.
		// If harnesses.ts had an in-route X-API-Key check, this would return 401.
		expect(res.status).toBe(200);
		const body = (await res.json()) as unknown[];
		expect(Array.isArray(body)).toBe(true);
	});

	test("401 with invalid Bearer token", async ({ db, eventBus }) => {
		const app = await createTestApp({ db, eventBus, adapterPool: makeAH2Pool() });
		const res = await app.request("/api/harnesses", {
			headers: { Authorization: "Bearer invalid-garbage-token" },
		});
		expect(res.status).toBe(401);
	});
});
