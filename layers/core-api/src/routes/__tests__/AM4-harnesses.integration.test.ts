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
 *   - response does NOT contain apiKey|baseUrl|sk-|subscriptionToken (secret-leak)
 *
 * FAILS until:
 *  - createHarnessRoutes(pool, db) signature change (Seam 3)
 *  - GET handler reads readServerConfig(db) and stamps discovery.disabled
 *  - POST /redetect endpoint with dedicated rate-limiter
 *  - POST /:type/disabled endpoint with :type validation
 */

import { AdapterPool, CliHarnessAdapter } from "@hyperidle/harness-registry";
import { updateServerConfig } from "@hyperidle/settings";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";
import { createTestApp } from "../../__testing__/test-utils.js";

type SnapshotValue<T> = T extends Readonly<Record<string, infer V>> ? V : never;
type HarnessDiscoveryInput = SnapshotValue<
	NonNullable<ConstructorParameters<typeof AdapterPool>[0]>
>;

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
	pool.register(
		"local-claude-code",
		new CliHarnessAdapter({
			binary: "claude",
			args: [],
			envMap: {},
			eventFormat: "text",
			envAllowlist: [],
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

	// @lore This asserted the built-in harness was never stamped disabled, even
	// when a hand-edited config named it — it was the always-present fallback, so
	// disabling it would have left a session with nothing to run on. That
	// exemption is gone with the harness. Every harness in the disabled set is now
	// stamped, with no carve-out, which is what this asserts instead.
	test("every harness named in harnessDisabled is stamped — no exemptions", async ({
		db,
		eventBus,
	}) => {
		await updateServerConfig(db, {
			harnessDisabled: ["claude-code", "codex", "opencode", "cursor-agent"],
		} as AM4ServerConfigPatch);

		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });
		const res = await app.request("/api/harnesses", { headers: authHeaders() });

		expect(res.status).toBe(200);
		const body = (await res.json()) as Array<Record<string, unknown>>;
		for (const type of ["claude-code", "codex", "opencode", "cursor-agent"]) {
			const entry = body.find((e) => e.type === type);
			expect(entry, `${type} should be in the response`).toBeDefined();
			const discovery = entry?.discovery as { disabled?: boolean } | undefined;
			expect(discovery?.disabled, `${type} should be stamped disabled`).toBe(true);
		}
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
		const claudeCode = body.find((e) => e.type === "claude-code");
		expect(claudeCode).toBeDefined();
		expect(typeof (claudeCode?.discovery as Record<string, unknown>)?.state).toBe("string");
		expect(typeof (claudeCode?.authAction as Record<string, unknown>)?.kind).toBe("string");
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

	// 429 rate-limiter test removed — the dedicated rate-limiter was removed deliberately; no throttle on redetect is the accepted posture until a real learning earns a narrow guard back.

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
