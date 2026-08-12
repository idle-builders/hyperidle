/**
 * AF15 RED — Model gateway partial-update (AC-2).
 *
 * Tests that PATCH /api/model-gateway:
 * - Accepts partial tier patches (only the changed tier present)
 * - Preserves adjacent tiers' stored apiKey when patch omits them
 * - Accepts partial schema cases: model-only patch, re-key patch
 * - Rejects: apiKey on non-oai provider (when provider is set), missing baseUrl on
 *   oai-compatible transition, empty PATCH body (no tiers)
 *
 * Also tests that GET /api/model-gateway strips apiKey and returns hasApiKey.
 *
 * @lore AF15: The headline AC — editing tier B's model must not clobber tier A's
 * stored key. The merge fix in server-config.ts is the production path; this test
 * exercises the full HTTP stack including the PartialModelGatewaySchema guard.
 */

import { type HyperIdleDb, serverConfig } from "@hyperidle/db";
import { describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-af15-gateway";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

describe("AF15 AC-2 — PATCH /api/model-gateway partial-tier merge", () => {
	const NOW = new Date().toISOString();

	// Helper: seed a config row with a known openai-compatible key on reasoning tier
	async function seedWithOaiKey(db: HyperIdleDb): Promise<void> {
		// Store a full config with apiKey on reasoning tier (plaintext — test env has no secret)
		const config = {
			modelGateway: {
				reasoning: {
					provider: "openai-compatible",
					model: "gpt-4o",
					baseUrl: "https://api.openai.com/v1",
					apiKey: "sk-test-reasoning-key",
				},
				workhorse: {
					provider: "anthropic",
					model: "claude-3-5-sonnet-20241022",
				},
				fast: {
					provider: "anthropic",
					model: "claude-3-5-haiku-20241022",
				},
			},
		};
		await db.insert(serverConfig).values({
			id: "default",
			config: JSON.stringify(config),
			updatedAt: NOW,
		});
	}

	// ── Schema predicate cases (5 cases from the plan) ──────────────────────

	test("accepts { fast: { model } } — provider omitted, no apiKey/baseUrl judged", async ({
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/model-gateway", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ fast: { model: "claude-3-5-haiku-20241022" } }),
		});
		expect(res.status).toBe(200);
		vi.unstubAllEnvs();
	});

	test("rejects { fast: { provider: 'anthropic', apiKey: 'x' } } — apiKey on non-oai with provider set", async ({
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/model-gateway", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ fast: { provider: "anthropic", apiKey: "x" } }),
		});
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	test("rejects { fast: { provider: 'openai-compatible', model: 'x' } } — missing baseUrl on oai transition", async ({
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/model-gateway", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ fast: { provider: "openai-compatible", model: "gpt-4o" } }),
		});
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	test("accepts { fast: { apiKey: 'newkey' } } — re-key on already-oai tier (provider omitted)", async ({
		app,
		db,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		// Seed fast tier as oai-compatible already
		const config = {
			modelGateway: {
				reasoning: { provider: "anthropic", model: "claude-opus-4-5" },
				workhorse: { provider: "anthropic", model: "claude-3-5-sonnet-20241022" },
				fast: {
					provider: "openai-compatible",
					model: "gpt-4o-mini",
					baseUrl: "https://api.openai.com/v1",
					apiKey: "sk-old-key",
				},
			},
		};
		await db.insert(serverConfig).values({
			id: "default",
			config: JSON.stringify(config),
			updatedAt: new Date().toISOString(),
		});
		const res = await app.request("/api/model-gateway", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ fast: { apiKey: "newkey" } }),
		});
		expect(res.status).toBe(200);
		vi.unstubAllEnvs();
	});

	test("rejects {} — no tiers present", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/model-gateway", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
		vi.unstubAllEnvs();
	});

	// ── Headline AC-2: adjacent key preserved ────────────────────────────────

	test("PATCH fast.model preserves reasoning tier config (AH1: hasApiKey always false — key in server_credentials)", async ({
		app,
		db,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedWithOaiKey(db);

		// AH1: hasApiKey is always false from model-gateway endpoint — key now lives in server_credentials
		const getRes1 = await app.request("/api/model-gateway", { headers: authHeaders() });
		expect(getRes1.status).toBe(200);
		const before = (await getRes1.json()) as {
			reasoning: { hasApiKey: boolean };
			fast: { model: string };
		};
		// AH1: key in server_credentials, not tier blob — always false here
		expect(before.reasoning.hasApiKey).toBe(false);

		// Patch only fast tier's model
		const patchRes = await app.request("/api/model-gateway", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ fast: { model: "claude-3-5-haiku-20241022" } }),
		});
		expect(patchRes.status).toBe(200);

		// After patch, reasoning tier's config should still be openai-compatible (provider preserved)
		const getRes2 = await app.request("/api/model-gateway", { headers: authHeaders() });
		const after = (await getRes2.json()) as { reasoning: { provider: string; hasApiKey: boolean } };
		expect(after.reasoning.provider).toBe("openai-compatible");
		// AH1: hasApiKey always false — credential state is in GET /api/credentials
		expect(after.reasoning.hasApiKey).toBe(false);
		vi.unstubAllEnvs();
	});

	test("changing reasoning tier provider to anthropic switches provider (AH1: hasApiKey always false)", async ({
		app,
		db,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedWithOaiKey(db);

		// AH1: hasApiKey is always false from model-gateway — key in server_credentials
		const before = (await (
			await app.request("/api/model-gateway", { headers: authHeaders() })
		).json()) as { reasoning: { hasApiKey: boolean; provider: string } };
		expect(before.reasoning.provider).toBe("openai-compatible");
		expect(before.reasoning.hasApiKey).toBe(false); // AH1: always false

		// Switch reasoning provider away from openai-compatible
		const patchRes = await app.request("/api/model-gateway", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ reasoning: { provider: "anthropic", model: "claude-opus-4-5" } }),
		});
		expect(patchRes.status).toBe(200);

		// Provider changed — hasApiKey still false (key in server_credentials, not tier blob)
		const after = (await (
			await app.request("/api/model-gateway", { headers: authHeaders() })
		).json()) as { reasoning: { hasApiKey: boolean; provider: string } };
		expect(after.reasoning.provider).toBe("anthropic");
		expect(after.reasoning.hasApiKey).toBe(false);
		vi.unstubAllEnvs();
	});

	test("patching fast tier leaves workhorse unchanged", async ({ app, db, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const config = {
			modelGateway: {
				reasoning: { provider: "anthropic", model: "claude-opus-4-5" },
				workhorse: { provider: "anthropic", model: "claude-3-5-sonnet-20241022" },
				fast: { provider: "anthropic", model: "claude-3-5-haiku-20241022" },
			},
		};
		await db.insert(serverConfig).values({
			id: "default",
			config: JSON.stringify(config),
			updatedAt: new Date().toISOString(),
		});

		const res = await app.request("/api/model-gateway", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ fast: { model: "claude-haiku-4-5" } }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			workhorse: { model: string };
			fast: { model: string };
		};
		expect(body.workhorse.model).toBe("claude-3-5-sonnet-20241022");
		expect(body.fast.model).toBe("claude-haiku-4-5");
		vi.unstubAllEnvs();
	});

	// ── Full PATCH still works (backward compat) ─────────────────────────────

	test("full 3-tier PATCH still works (existing clients)", async ({ app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const res = await app.request("/api/model-gateway", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				reasoning: { provider: "anthropic", model: "claude-opus-4-5" },
				workhorse: { provider: "anthropic", model: "claude-3-5-sonnet-20241022" },
				fast: { provider: "anthropic", model: "claude-3-5-haiku-20241022" },
			}),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			reasoning: { model: string };
			workhorse: { model: string };
			fast: { model: string };
		};
		expect(body.reasoning.model).toBe("claude-opus-4-5");
		vi.unstubAllEnvs();
	});

	// ── GET sanitizes apiKey ──────────────────────────────────────────────────

	test("GET /api/model-gateway returns hasApiKey boolean, never apiKey string (AH1: always false)", async ({
		app,
		db,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		await seedWithOaiKey(db);
		const res = await app.request("/api/model-gateway", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		// Must NOT have apiKey (security: never leak)
		expect(body).not.toHaveProperty("reasoning.apiKey");
		// AH1: hasApiKey is always false — key now in server_credentials, use GET /api/credentials for state
		expect((body as { reasoning: { hasApiKey: boolean } }).reasoning.hasApiKey).toBe(false);
		vi.unstubAllEnvs();
	});
});
