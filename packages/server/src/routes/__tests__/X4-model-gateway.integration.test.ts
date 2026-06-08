/**
 * X4 RED — Model Gateway tests (red phase)
 *
 * AC coverage:
 *  - resolveModelTier returns correct ResolvedModel for "anthropic" provider
 *  - resolveModelTier returns correct ResolvedModel for "openrouter" provider
 *  - resolveModelTier returns correct ResolvedModel for "openai-compatible" provider
 *  - resolveModelTier throws MissingCredentialError when API key is missing
 *  - resolveModelTier throws when openai-compatible has no baseUrl (A-ERR-2)
 *  - resolveModelTier throws when openai-compatible has no apiKey (A-ERR-1)
 *  - DEFAULT_GATEWAY_CONFIG matches current MODEL_TIER_MAP values (A-TEST-2)
 *  - GET /api/model-gateway returns config with apiKey stripped (hasApiKey boolean — A-SEC-2)
 *  - GET /api/model-gateway returns defaults when no config exists
 *  - PATCH /api/model-gateway validates and persists config
 *  - PATCH /api/model-gateway returns 400 for invalid provider
 *  - PATCH /api/model-gateway rejects apiKey when provider is not openai-compatible
 *  - ServerConfig extension: modelGateway field parses and defaults correctly
 *
 * @lore X4: These tests drive the gateway service + API. They fail until
 * packages/server/src/services/model-gateway.ts and
 * packages/server/src/routes/model-gateway.ts are created and wired.
 */

import { MissingCredentialError } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import type { CredentialResolver } from "../../services/credential-resolver.js";
import {
	BUILT_IN_GATEWAY_CONFIG as DEFAULT_GATEWAY_CONFIG,
	resolveModelTier,
} from "../../services/model-gateway.js";
import { test } from "../../test-fixtures.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_API_KEY = "test-key-x4-gateway";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

function makeResolver(entries: Record<string, string | null>): CredentialResolver {
	return {
		resolve: vi.fn(async (name: string) => entries[name] ?? null),
	};
}

// ---------------------------------------------------------------------------
// resolveModelTier — unit tests
// ---------------------------------------------------------------------------

describe("X4: resolveModelTier — anthropic provider", () => {
	test("returns correct ResolvedModel with Anthropic base URL", async (_ctx) => {
		const config = DEFAULT_GATEWAY_CONFIG;
		const resolver = makeResolver({ anthropic_api_key: "ant-key-abc" });

		const result = await resolveModelTier("workhorse", config, resolver);

		expect(result.provider).toBe("anthropic");
		expect(result.model).toBe("claude-sonnet-4-20250514");
		expect(result.apiKey).toBe("ant-key-abc");
		expect(result.baseUrl).toBe("https://api.anthropic.com");
	});

	test("resolves reasoning tier with claude-opus model", async (_ctx) => {
		const resolver = makeResolver({ anthropic_api_key: "ant-key-reasoning" });
		const result = await resolveModelTier("reasoning", DEFAULT_GATEWAY_CONFIG, resolver);

		expect(result.provider).toBe("anthropic");
		expect(result.model).toBe("claude-opus-4-20250514");
		expect(result.apiKey).toBe("ant-key-reasoning");
		expect(result.baseUrl).toBe("https://api.anthropic.com");
	});

	test("resolves fast tier with claude-haiku model", async (_ctx) => {
		const resolver = makeResolver({ anthropic_api_key: "ant-key-fast" });
		const result = await resolveModelTier("fast", DEFAULT_GATEWAY_CONFIG, resolver);

		expect(result.provider).toBe("anthropic");
		expect(result.model).toBe("claude-haiku-3-5-20241022");
		expect(result.apiKey).toBe("ant-key-fast");
		expect(result.baseUrl).toBe("https://api.anthropic.com");
	});

	test("throws MissingCredentialError when anthropic_api_key is missing", async (_ctx) => {
		const resolver = makeResolver({ anthropic_api_key: null });

		await expect(resolveModelTier("workhorse", DEFAULT_GATEWAY_CONFIG, resolver)).rejects.toThrow(
			MissingCredentialError,
		);
	});

	test("MissingCredentialError message identifies provider and tier", async (_ctx) => {
		const resolver = makeResolver({ anthropic_api_key: null });

		try {
			await resolveModelTier("reasoning", DEFAULT_GATEWAY_CONFIG, resolver);
			expect.fail("Should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(MissingCredentialError);
			// Message should identify context — provider "anthropic" and tier "reasoning"
			if (err instanceof MissingCredentialError) {
				expect(err.credential).toMatch(/anthropic/i);
			}
		}
	});
});

describe("X4: resolveModelTier — openrouter provider", () => {
	test("returns correct ResolvedModel with OpenRouter base URL", async (_ctx) => {
		const config = {
			...DEFAULT_GATEWAY_CONFIG,
			workhorse: {
				provider: "openrouter" as const,
				model: "anthropic/claude-sonnet-4",
			},
		};
		const resolver = makeResolver({ openrouter_api_key: "or-key-xyz" });

		const result = await resolveModelTier("workhorse", config, resolver);

		expect(result.provider).toBe("openrouter");
		expect(result.model).toBe("anthropic/claude-sonnet-4");
		expect(result.apiKey).toBe("or-key-xyz");
		expect(result.baseUrl).toBe("https://openrouter.ai/api");
	});

	test("throws MissingCredentialError when openrouter_api_key is missing", async (_ctx) => {
		const config = {
			...DEFAULT_GATEWAY_CONFIG,
			workhorse: {
				provider: "openrouter" as const,
				model: "anthropic/claude-sonnet-4",
			},
		};
		const resolver = makeResolver({ openrouter_api_key: null });

		await expect(resolveModelTier("workhorse", config, resolver)).rejects.toThrow(
			MissingCredentialError,
		);
	});
});

describe("X4: resolveModelTier — openai-compatible provider", () => {
	test("returns correct ResolvedModel with custom base URL and apiKey", async (_ctx) => {
		const config = {
			...DEFAULT_GATEWAY_CONFIG,
			fast: {
				provider: "openai-compatible" as const,
				model: "gemma-3",
				baseUrl: "https://api.together.xyz/v1",
				apiKey: "together-key-abc",
			},
		};
		const resolver = makeResolver({});

		const result = await resolveModelTier("fast", config, resolver);

		expect(result.provider).toBe("openai-compatible");
		expect(result.model).toBe("gemma-3");
		expect(result.apiKey).toBe("together-key-abc");
		expect(result.baseUrl).toBe("https://api.together.xyz/v1");
	});

	test("throws when openai-compatible has no apiKey (A-ERR-1)", async (_ctx) => {
		const config = {
			...DEFAULT_GATEWAY_CONFIG,
			fast: {
				provider: "openai-compatible" as const,
				model: "gemma-3",
				baseUrl: "https://api.together.xyz/v1",
				// no apiKey
			},
		};
		const resolver = makeResolver({});

		await expect(resolveModelTier("fast", config, resolver)).rejects.toThrow(
			MissingCredentialError,
		);
	});

	test("throws when openai-compatible has no baseUrl (A-ERR-2)", async (_ctx) => {
		const config = {
			...DEFAULT_GATEWAY_CONFIG,
			fast: {
				provider: "openai-compatible" as const,
				model: "gemma-3",
				apiKey: "some-key",
				// no baseUrl
			},
		};
		const resolver = makeResolver({});

		await expect(resolveModelTier("fast", config, resolver)).rejects.toThrow(/baseUrl/i);
	});
});

// ---------------------------------------------------------------------------
// DEFAULT_GATEWAY_CONFIG matches MODEL_TIER_MAP (A-TEST-2)
// ---------------------------------------------------------------------------

describe("X4: DEFAULT_GATEWAY_CONFIG matches current MODEL_TIER_MAP values", () => {
	// @lore X4 A-TEST-2: This test is a regression guard. If anyone changes
	// DEFAULT_GATEWAY_CONFIG, the behavior will change for users who have no
	// gateway config stored (they fall back to defaults). The test asserts the
	// exact model IDs that were in MODEL_TIER_MAP before X4 replaced it.
	test("reasoning tier defaults to claude-opus-4-20250514 via anthropic", (_ctx) => {
		expect(DEFAULT_GATEWAY_CONFIG.reasoning.provider).toBe("anthropic");
		expect(DEFAULT_GATEWAY_CONFIG.reasoning.model).toBe("claude-opus-4-20250514");
	});

	test("workhorse tier defaults to claude-sonnet-4-20250514 via anthropic", (_ctx) => {
		expect(DEFAULT_GATEWAY_CONFIG.workhorse.provider).toBe("anthropic");
		expect(DEFAULT_GATEWAY_CONFIG.workhorse.model).toBe("claude-sonnet-4-20250514");
	});

	test("fast tier defaults to claude-haiku-3-5-20241022 via anthropic", (_ctx) => {
		expect(DEFAULT_GATEWAY_CONFIG.fast.provider).toBe("anthropic");
		expect(DEFAULT_GATEWAY_CONFIG.fast.model).toBe("claude-haiku-3-5-20241022");
	});
});

// ---------------------------------------------------------------------------
// API endpoint tests
// ---------------------------------------------------------------------------

describe("X4: GET /api/model-gateway", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns defaults when no config exists", async ({ app }) => {
		const res = await app.request("/api/model-gateway", {
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, { provider: string; model: string }>;
		expect(body.reasoning.provider).toBe("anthropic");
		expect(body.reasoning.model).toBe("claude-opus-4-20250514");
		expect(body.workhorse.provider).toBe("anthropic");
		expect(body.workhorse.model).toBe("claude-sonnet-4-20250514");
		expect(body.fast.provider).toBe("anthropic");
		expect(body.fast.model).toBe("claude-haiku-3-5-20241022");
	});

	test("strips apiKey from openai-compatible provider — returns hasApiKey: true instead (A-SEC-2)", async ({
		app,
	}) => {
		// First patch to set openai-compatible config with an apiKey
		await app.request("/api/model-gateway", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				reasoning: { provider: "anthropic", model: "claude-opus-4-20250514" },
				workhorse: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
				fast: {
					provider: "openai-compatible",
					model: "gemma-3",
					baseUrl: "https://api.together.xyz/v1",
					apiKey: "secret-key-should-not-return",
				},
			}),
		});

		const res = await app.request("/api/model-gateway", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, Record<string, unknown>>;
		// apiKey must NOT be returned
		expect(body.fast.apiKey).toBeUndefined();
		// hasApiKey must be true (key is present)
		expect(body.fast.hasApiKey).toBe(true);
	});

	test("returns hasApiKey: false when openai-compatible has no apiKey", async ({ app }) => {
		await app.request("/api/model-gateway", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				reasoning: { provider: "anthropic", model: "claude-opus-4-20250514" },
				workhorse: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
				fast: {
					provider: "openai-compatible",
					model: "gemma-3",
					baseUrl: "https://api.together.xyz/v1",
					// no apiKey
				},
			}),
		});

		const res = await app.request("/api/model-gateway", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, Record<string, unknown>>;
		expect(body.fast.hasApiKey).toBe(false);
		expect(body.fast.apiKey).toBeUndefined();
	});

	test("returns hasApiKey: false for anthropic provider (no apiKey field at all)", async ({
		app,
	}) => {
		const res = await app.request("/api/model-gateway", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, Record<string, unknown>>;
		// Anthropic never stores apiKey in config — hasApiKey should be false
		expect(body.reasoning.hasApiKey).toBe(false);
		expect(body.reasoning.apiKey).toBeUndefined();
	});
});

describe("X4: PATCH /api/model-gateway", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("validates and persists a valid config", async ({ app }) => {
		const patchBody = {
			reasoning: { provider: "anthropic", model: "claude-opus-4-20250514" },
			workhorse: {
				provider: "openrouter",
				model: "anthropic/claude-sonnet-4",
			},
			fast: { provider: "anthropic", model: "claude-haiku-3-5-20241022" },
		};

		const patchRes = await app.request("/api/model-gateway", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify(patchBody),
		});
		expect(patchRes.status).toBe(200);

		// Verify persisted via GET
		const getRes = await app.request("/api/model-gateway", {
			headers: authHeaders(),
		});
		const body = (await getRes.json()) as Record<string, { provider: string; model: string }>;
		expect(body.workhorse.provider).toBe("openrouter");
		expect(body.workhorse.model).toBe("anthropic/claude-sonnet-4");
	});

	test("returns 400 for invalid provider value", async ({ app }) => {
		const res = await app.request("/api/model-gateway", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				reasoning: { provider: "invalid-provider", model: "some-model" },
				workhorse: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
				fast: { provider: "anthropic", model: "claude-haiku-3-5-20241022" },
			}),
		});

		expect(res.status).toBe(400);
	});

	test("returns 400 for missing tier (incomplete config)", async ({ app }) => {
		const res = await app.request("/api/model-gateway", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				// missing 'fast' tier
				reasoning: { provider: "anthropic", model: "claude-opus-4-20250514" },
				workhorse: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
			}),
		});

		expect(res.status).toBe(400);
	});

	test("returns 400 when apiKey provided for non-openai-compatible provider", async ({ app }) => {
		const res = await app.request("/api/model-gateway", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				reasoning: {
					provider: "anthropic",
					model: "claude-opus-4-20250514",
					apiKey: "should-not-be-allowed",
				},
				workhorse: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
				fast: { provider: "anthropic", model: "claude-haiku-3-5-20241022" },
			}),
		});

		expect(res.status).toBe(400);
	});

	test("PATCH response strips apiKey and returns saved config (A-SEC-2)", async ({ app }) => {
		const res = await app.request("/api/model-gateway", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				reasoning: { provider: "anthropic", model: "claude-opus-4-20250514" },
				workhorse: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
				fast: {
					provider: "openai-compatible",
					model: "gemma-3",
					baseUrl: "https://api.together.xyz/v1",
					apiKey: "sensitive-key",
				},
			}),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, Record<string, unknown>>;
		expect(body.fast.apiKey).toBeUndefined();
		expect(body.fast.hasApiKey).toBe(true);
	});

	test("accepts openai-compatible with apiKey and baseUrl", async ({ app }) => {
		const res = await app.request("/api/model-gateway", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				reasoning: { provider: "anthropic", model: "claude-opus-4-20250514" },
				workhorse: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
				fast: {
					provider: "openai-compatible",
					model: "gemma-3",
					baseUrl: "https://api.together.xyz/v1",
					apiKey: "together-key-123",
				},
			}),
		});

		expect(res.status).toBe(200);
	});
});

// ---------------------------------------------------------------------------
// ServerConfig extension: modelGateway field (A-TYPE-1 related)
// ---------------------------------------------------------------------------

describe("X4: ServerConfig modelGateway field defaults", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("modelGateway in server config defaults to DEFAULT_GATEWAY_CONFIG when no row exists", async ({
		app,
	}) => {
		// GET /api/model-gateway relies on readServerConfig → modelGateway field
		const res = await app.request("/api/model-gateway", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, { provider: string; model: string }>;
		// All three tiers should be anthropic direct (default)
		for (const tier of ["reasoning", "workhorse", "fast"] as const) {
			expect(body[tier].provider).toBe("anthropic");
		}
	});

	test("persisted modelGateway config survives a second GET call", async ({ app }) => {
		const patchBody = {
			reasoning: { provider: "openrouter", model: "anthropic/claude-opus" },
			workhorse: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
			fast: { provider: "anthropic", model: "claude-haiku-3-5-20241022" },
		};

		await app.request("/api/model-gateway", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify(patchBody),
		});

		// Second GET
		const res = await app.request("/api/model-gateway", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, { provider: string; model: string }>;
		expect(body.reasoning.provider).toBe("openrouter");
		expect(body.reasoning.model).toBe("anthropic/claude-opus");
	});
});
