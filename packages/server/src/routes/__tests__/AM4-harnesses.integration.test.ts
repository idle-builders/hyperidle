/**
 * AM4 RED — harness route integration tests (Tasks 5 & 6)
 *
 * AC1: GET /api/harnesses stamps discovery.disabled from persisted harnessDisabled
 * AC2: POST /api/harnesses/redetect
 *   - returns 200 + HarnessCapabilityDescriptor[] (fresh snapshot)
 *   - stamps discovery.disabled for a config-disabled type
 *   - returns 429 on back-to-back calls (dedicated rate-limiter)
 *   - response does NOT contain apiKey|baseUrl|sk-|subscriptionToken (secret-leak)
 * AC2: POST /api/harnesses/:type/disabled
 *   - persists to harnessDisabled and reflects in next GET's discovery.disabled
 *   - 400 on unknown :type
 *   - 400/409 on { disabled: true } for :type === "builtin"
 *   - { disabled: false } for builtin is allowed (no-op / safe)
 *   - response does NOT contain apiKey|baseUrl|sk-|subscriptionToken (secret-leak)
 *
 * FAILS until:
 *  - createHarnessRoutes(pool, db) signature change (Seam 3)
 *  - GET handler reads readServerConfig(db) and stamps discovery.disabled
 *  - POST /redetect endpoint with dedicated rate-limiter
 *  - POST /:type/disabled endpoint with :type validation + builtin-reject
 */

import type { HarnessDiscoveryInput } from "@hyperidle/agent-layer";
import {
	AdapterPool,
	BuiltinHarnessAdapter,
	CLAUDE_CLI_CONFIG,
	CliHarnessAdapter,
} from "@hyperidle/agent-layer";
import { updateServerConfig } from "@hyperidle/core-app";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../test-fixtures.js";
import { createTestApp } from "../../test-utils.js";

/**
 * AM4 adds `harnessDisabled?: string[]` to ServerConfigPatch (Task 1).
 * Until the green phase adds it, we extend the type here for the red-phase tests.
 */
type AM4ServerConfigPatch = Parameters<typeof updateServerConfig>[1] & {
	readonly harnessDisabled?: readonly string[];
};

const TEST_API_KEY = "test-key-am4-harnesses";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY };
}

const STATIC_DISCOVERIES: Record<string, HarnessDiscoveryInput> = {
	builtin: { state: "ready" },
	"claude-code": { state: "ready", version: "2.1.170" },
	codex: { state: "unauthenticated", version: "0.141.0" },
	opencode: { state: "installed", version: "1.17.8" },
	"cursor-agent": {
		state: "unavailable",
		reason: "No documented headless CLI surface.",
	},
};

function makePool(): AdapterPool {
	const pool = new AdapterPool(STATIC_DISCOVERIES);
	pool.register("local-builtin", new BuiltinHarnessAdapter(), {
		name: "Built-in Harness",
		kind: "local",
		type: "builtin",
		modelProviders: ["anthropic", "openrouter", "openai-compatible"],
		maxConcurrent: 4,
	});
	pool.register("local-claude-code", new CliHarnessAdapter(CLAUDE_CLI_CONFIG), {
		name: "Claude Code",
		kind: "local",
		type: "claude-code",
		modelProviders: ["anthropic"],
		maxConcurrent: 4,
	});
	return pool;
}

// ── AC1 (Task 5): GET /api/harnesses stamps discovery.disabled ───────────────

describe("AM4 AC1 — GET /api/harnesses stamps discovery.disabled from config", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("discovery.disabled is false (or absent) when nothing is disabled", async ({
		db,
		eventBus,
	}) => {
		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });
		const res = await app.request("/api/harnesses", { headers: authHeaders() });

		expect(res.status).toBe(200);
		const body = (await res.json()) as Array<Record<string, unknown>>;
		const claudeCode = body.find((e) => e.type === "claude-code");
		expect(claudeCode).toBeDefined();
		// discovery.disabled must be false or absent when not disabled
		const discovery = claudeCode?.discovery as { disabled?: boolean } | undefined;
		expect(discovery?.disabled).toBeFalsy();
	});

	test("discovery.disabled is true for a type persisted in harnessDisabled", async ({
		db,
		eventBus,
	}) => {
		// Persist claude-code as disabled
		await updateServerConfig(db, { harnessDisabled: ["claude-code"] } as AM4ServerConfigPatch);

		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });
		const res = await app.request("/api/harnesses", { headers: authHeaders() });

		expect(res.status).toBe(200);
		const body = (await res.json()) as Array<Record<string, unknown>>;
		const claudeCode = body.find((e) => e.type === "claude-code");
		expect(claudeCode).toBeDefined();
		const discovery = claudeCode?.discovery as { disabled?: boolean } | undefined;
		// Must stamp disabled=true because claude-code is in harnessDisabled
		expect(discovery?.disabled).toBe(true);
	});

	test("builtin discovery.disabled is never true even if wrongly in harnessDisabled", async ({
		db,
		eventBus,
	}) => {
		// Wrongly put builtin into the disabled set (hand-edited / stale config)
		await updateServerConfig(db, { harnessDisabled: ["builtin"] } as AM4ServerConfigPatch);

		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });
		const res = await app.request("/api/harnesses", { headers: authHeaders() });

		expect(res.status).toBe(200);
		const body = (await res.json()) as Array<Record<string, unknown>>;
		const builtin = body.find((e) => e.type === "builtin");
		expect(builtin).toBeDefined();
		// Builtin must NOT be stamped disabled — it's always exempt
		const discovery = builtin?.discovery as { disabled?: boolean } | undefined;
		expect(discovery?.disabled).not.toBe(true);
	});
});

// ── AC2 (Task 5): POST /api/harnesses/redetect ───────────────────────────────

describe("AM4 AC2 — POST /api/harnesses/redetect", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns 200 with HarnessCapabilityDescriptor[]", async ({ db, eventBus }) => {
		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });
		const res = await app.request("/api/harnesses/redetect", {
			method: "POST",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as unknown[];
		expect(Array.isArray(body)).toBe(true);
	});

	test("redetect response includes descriptor shape with discovery + authAction", async ({
		db,
		eventBus,
	}) => {
		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });
		const res = await app.request("/api/harnesses/redetect", {
			method: "POST",
			headers: authHeaders(),
		});

		const body = (await res.json()) as Array<Record<string, unknown>>;
		const builtin = body.find((e) => e.type === "builtin");
		expect(builtin).toBeDefined();
		expect(typeof (builtin?.discovery as Record<string, unknown>)?.state).toBe("string");
		expect(typeof (builtin?.authAction as Record<string, unknown>)?.kind).toBe("string");
	});

	test("redetect stamps discovery.disabled for a config-disabled type", async ({
		db,
		eventBus,
	}) => {
		// Disable claude-code in config before redetect
		await updateServerConfig(db, { harnessDisabled: ["claude-code"] } as AM4ServerConfigPatch);

		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });
		const res = await app.request("/api/harnesses/redetect", {
			method: "POST",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as Array<Record<string, unknown>>;
		const claudeCode = body.find((e) => e.type === "claude-code");
		expect(claudeCode).toBeDefined();
		const discovery = claudeCode?.discovery as { disabled?: boolean } | undefined;
		expect(discovery?.disabled).toBe(true);
	});

	test("second back-to-back redetect returns 429 (dedicated rate-limiter)", async ({
		db,
		eventBus,
	}) => {
		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });

		// Freeze Date.now() across both calls so the limiter's 5s window cannot elapse
		// between them. Under full-suite parallel load the test continuation can be
		// CPU-starved for >5s between the two awaited requests, resetting the rolling
		// bucket (resetAt = firstCall + 5_000ms) and letting the second call through —
		// a load-dependent flake unrelated to the behavior under test. Only Date.now is
		// mocked (not timers), so real async/DB work is unaffected.
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
		try {
			// First call
			const res1 = await app.request("/api/harnesses/redetect", {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res1.status).toBe(200);

			// Second call — within the (frozen) 5s window → 429
			const res2 = await app.request("/api/harnesses/redetect", {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res2.status).toBe(429);
		} finally {
			nowSpy.mockRestore();
		}
	});

	test("redetect response does NOT contain secrets (secret-leak assertion)", async ({
		db,
		eventBus,
	}) => {
		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });
		const res = await app.request("/api/harnesses/redetect", {
			method: "POST",
			headers: authHeaders(),
		});
		const body = await res.json();
		const serialized = JSON.stringify(body);

		expect(serialized).not.toContain("apiKey");
		expect(serialized).not.toContain("baseUrl");
		expect(serialized).not.toContain("sk-");
		expect(serialized).not.toContain("subscriptionToken");
	});

	test("redetect requires auth (401 without key)", async ({ db, eventBus }) => {
		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });
		const res = await app.request("/api/harnesses/redetect", { method: "POST" });
		expect(res.status).toBe(401);
	});
});

// ── AC2 (Task 6): POST /api/harnesses/:type/disabled ────────────────────────

describe("AM4 AC2 — POST /api/harnesses/:type/disabled", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("persists disable and reflects in next GET's discovery.disabled", async ({
		db,
		eventBus,
	}) => {
		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });

		// Disable claude-code
		const disableRes = await app.request("/api/harnesses/claude-code/disabled", {
			method: "POST",
			headers: { ...authHeaders(), "Content-Type": "application/json" },
			body: JSON.stringify({ disabled: true }),
		});
		expect(disableRes.status).toBe(200);

		// Next GET must reflect the disable
		const getRes = await app.request("/api/harnesses", { headers: authHeaders() });
		const body = (await getRes.json()) as Array<Record<string, unknown>>;
		const claudeCode = body.find((e) => e.type === "claude-code");
		const discovery = claudeCode?.discovery as { disabled?: boolean } | undefined;
		expect(discovery?.disabled).toBe(true);
	});

	test("enable (disabled: false) clears the disabled flag", async ({ db, eventBus }) => {
		// Pre-disable
		await updateServerConfig(db, { harnessDisabled: ["claude-code"] } as AM4ServerConfigPatch);

		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });

		// Enable it back
		const enableRes = await app.request("/api/harnesses/claude-code/disabled", {
			method: "POST",
			headers: { ...authHeaders(), "Content-Type": "application/json" },
			body: JSON.stringify({ disabled: false }),
		});
		expect(enableRes.status).toBe(200);

		// Next GET should not show disabled=true
		const getRes = await app.request("/api/harnesses", { headers: authHeaders() });
		const body = (await getRes.json()) as Array<Record<string, unknown>>;
		const claudeCode = body.find((e) => e.type === "claude-code");
		const discovery = claudeCode?.discovery as { disabled?: boolean } | undefined;
		expect(discovery?.disabled).not.toBe(true);
	});

	test("400 on unknown :type", async ({ db, eventBus }) => {
		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });
		const res = await app.request("/api/harnesses/does-not-exist/disabled", {
			method: "POST",
			headers: { ...authHeaders(), "Content-Type": "application/json" },
			body: JSON.stringify({ disabled: true }),
		});
		expect(res.status).toBe(400);
	});

	test("400 or 409 on { disabled: true } for :type === 'builtin'", async ({ db, eventBus }) => {
		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });
		const res = await app.request("/api/harnesses/builtin/disabled", {
			method: "POST",
			headers: { ...authHeaders(), "Content-Type": "application/json" },
			body: JSON.stringify({ disabled: true }),
		});
		// Must be 400 or 409 — builtin is not disableable via the API
		expect([400, 409]).toContain(res.status);
	});

	test("{ disabled: false } for builtin is allowed (safe no-op)", async ({ db, eventBus }) => {
		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });
		// Enabling builtin (it can't be disabled, but enabling it is a no-op, not an error)
		const res = await app.request("/api/harnesses/builtin/disabled", {
			method: "POST",
			headers: { ...authHeaders(), "Content-Type": "application/json" },
			body: JSON.stringify({ disabled: false }),
		});
		// Should succeed (200) — enabling the always-on fallback is harmless
		expect(res.status).toBe(200);
	});

	test("response carries fresh descriptor list with discovery.disabled re-stamped", async ({
		db,
		eventBus,
	}) => {
		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });
		const res = await app.request("/api/harnesses/claude-code/disabled", {
			method: "POST",
			headers: { ...authHeaders(), "Content-Type": "application/json" },
			body: JSON.stringify({ disabled: true }),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as unknown[];
		// Response is a fresh descriptor list
		expect(Array.isArray(body)).toBe(true);
		const claudeCode = (body as Array<Record<string, unknown>>).find(
			(e) => e.type === "claude-code",
		);
		expect(claudeCode).toBeDefined();
		const discovery = claudeCode?.discovery as { disabled?: boolean } | undefined;
		expect(discovery?.disabled).toBe(true);
	});

	test("/:type/disabled response does NOT contain secrets", async ({ db, eventBus }) => {
		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });
		const res = await app.request("/api/harnesses/claude-code/disabled", {
			method: "POST",
			headers: { ...authHeaders(), "Content-Type": "application/json" },
			body: JSON.stringify({ disabled: true }),
		});
		const body = await res.json();
		const serialized = JSON.stringify(body);

		expect(serialized).not.toContain("apiKey");
		expect(serialized).not.toContain("baseUrl");
		expect(serialized).not.toContain("sk-");
		expect(serialized).not.toContain("subscriptionToken");
	});

	test("/:type/disabled requires auth (401 without key)", async ({ db, eventBus }) => {
		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });
		const res = await app.request("/api/harnesses/claude-code/disabled", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ disabled: true }),
		});
		expect(res.status).toBe(401);
	});
});
