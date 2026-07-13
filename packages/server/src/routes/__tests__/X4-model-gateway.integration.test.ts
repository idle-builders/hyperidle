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
import type { CredentialResolver } from "@hyperidle/core-app";
import {
	BUILT_IN_GATEWAY_CONFIG as DEFAULT_GATEWAY_CONFIG,
	resolveModelTier,
} from "@hyperidle/core-app";
import { test } from "../../test-fixtures.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_API_KEY = "test-key-x4-gateway";

/** The model-gateway GET response body shape (per-tier config, apiKey stripped). */
interface GatewayTier {
	provider: string;
	model: string;
	apiKey?: string;
	hasApiKey?: boolean;
}
type GatewayBody = Record<string, GatewayTier> & {
	reasoning: GatewayTier;
	workhorse: GatewayTier;
	fast: GatewayTier;
};

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
	test("returns correct ResolvedModel with Anthropic base URL", async ({}) => {
		const config = DEFAULT_GATEWAY_CONFIG;
		const resolver = makeResolver({ anthropic_api_key: "ant-key-abc" });

		const result = await resolveModelTier("workhorse", config, resolver);

		expect(result.provider).toBe("anthropic");
		expect(result.model).toBe("claude-sonnet-4-6"); // AH2: updated from claude-sonnet-4-20250514 (drift-catch)
		expect(result.apiKey).toBe("ant-key-abc");
		expect(result.baseUrl).toBe("https://api.anthropic.com");
	});

	test("resolves reasoning tier with claude-opus model", async ({}) => {
		const resolver = makeResolver({ anthropic_api_key: "ant-key-reasoning" });
		const result = await resolveModelTier("reasoning", DEFAULT_GATEWAY_CONFIG, resolver);

		expect(result.provider).toBe("anthropic");
		expect(result.model).toBe("claude-opus-4-8"); // AH2: updated from claude-opus-4-20250514 (drift-catch)
		expect(result.apiKey).toBe("ant-key-reasoning");
		expect(result.baseUrl).toBe("https://api.anthropic.com");
	});

	test("resolves fast tier with claude-haiku model", async ({}) => {
		const resolver = makeResolver({ anthropic_api_key: "ant-key-fast" });
		const result = await resolveModelTier("fast", DEFAULT_GATEWAY_CONFIG, resolver);

		expect(result.provider).toBe("anthropic");
		expect(result.model).toBe("claude-haiku-4-5"); // AH2: updated from claude-haiku-3-5-20241022 (drift-catch)
		expect(result.apiKey).toBe("ant-key-fast");
		expect(result.baseUrl).toBe("https://api.anthropic.com");
	});

	test("throws MissingCredentialError when anthropic_api_key is missing", async ({}) => {
		const resolver = makeResolver({ anthropic_api_key: null });

		await expect(resolveModelTier("workhorse", DEFAULT_GATEWAY_CONFIG, resolver)).rejects.toThrow(
			MissingCredentialError,
		);
	});

	test("MissingCredentialError message identifies provider and tier", async ({}) => {
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
	test("returns correct ResolvedModel with OpenRouter base URL", async ({}) => {
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

	test("throws MissingCredentialError when openrouter_api_key is missing", async ({}) => {
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
	test("AH1: returns correct ResolvedModel with custom base URL — key comes from resolver", async ({}) => {
		// AH1 §2: apiKey no longer in tier config. It's resolved from server_credentials
		// via the credential resolver. Pass it via the resolver.
		const config = {
			...DEFAULT_GATEWAY_CONFIG,
			fast: {
				provider: "openai-compatible" as const,
				model: "gemma-3",
				baseUrl: "https://api.together.xyz/v1",
			},
		};
		const resolver = makeResolver({ openai_compatible_api_key: "together-key-abc" });

		const result = await resolveModelTier("fast", config, resolver);

		expect(result.provider).toBe("openai-compatible");
		expect(result.model).toBe("gemma-3");
		expect(result.apiKey).toBe("together-key-abc");
		expect(result.baseUrl).toBe("https://api.together.xyz/v1");
	});

	test("AH1: throws MissingCredentialError when openai_compatible_api_key not in resolver (A-ERR-1)", async ({}) => {
		// AH1 §2: key comes from resolver, not tier config. No key in resolver = MissingCredentialError.
		const config = {
			...DEFAULT_GATEWAY_CONFIG,
			fast: {
				provider: "openai-compatible" as const,
				model: "gemma-3",
				baseUrl: "https://api.together.xyz/v1",
			},
		};
		const resolver = makeResolver({}); // no openai_compatible_api_key

		await expect(resolveModelTier("fast", config, resolver)).rejects.toThrow(
			MissingCredentialError,
		);
	});

	test("throws when openai-compatible has no baseUrl (A-ERR-2)", async ({}) => {
		const config = {
			...DEFAULT_GATEWAY_CONFIG,
			fast: {
				provider: "openai-compatible" as const,
				model: "gemma-3",
				// no baseUrl
			},
		};
		const resolver = makeResolver({ openai_compatible_api_key: "some-key" });

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
	// AH2: drift-catch — updated to current catalog ids (was *-20250514 / haiku-3-5-20241022)
	test("reasoning tier defaults to claude-opus-4-8 via anthropic", ({}) => {
		expect(DEFAULT_GATEWAY_CONFIG.reasoning.provider).toBe("anthropic");
		expect(DEFAULT_GATEWAY_CONFIG.reasoning.model).toBe("claude-opus-4-8");
	});

	test("workhorse tier defaults to claude-sonnet-4-6 via anthropic", ({}) => {
		expect(DEFAULT_GATEWAY_CONFIG.workhorse.provider).toBe("anthropic");
		expect(DEFAULT_GATEWAY_CONFIG.workhorse.model).toBe("claude-sonnet-4-6");
	});

	test("fast tier defaults to claude-haiku-4-5 via anthropic", ({}) => {
		expect(DEFAULT_GATEWAY_CONFIG.fast.provider).toBe("anthropic");
		expect(DEFAULT_GATEWAY_CONFIG.fast.model).toBe("claude-haiku-4-5");
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

		const body = (await res.json()) as GatewayBody;
		expect(body.reasoning.provider).toBe("anthropic");
		expect(body.reasoning.model).toBe("claude-opus-4-8"); // AH2: drift-catch
		expect(body.workhorse.provider).toBe("anthropic");
		expect(body.workhorse.model).toBe("claude-sonnet-4-6"); // AH2: drift-catch
		expect(body.fast.provider).toBe("anthropic");
		expect(body.fast.model).toBe("claude-haiku-4-5"); // AH2: drift-catch
	});

	test("AH1: apiKey never in GET response — hasApiKey always false (key now in server_credentials)", async ({
		app,
	}) => {
		// AH1 §2: apiKey is no longer stored in the tier config blob.
		// hasApiKey is always false in the model-gateway GET response.
		// The real state is in GET /api/credentials (credential store).
		await app.request("/api/model-gateway", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				reasoning: { provider: "anthropic", model: "claude-opus-4-8" }, // AH2: drift-catch
				workhorse: { provider: "anthropic", model: "claude-sonnet-4-6" }, // AH2: drift-catch
				fast: {
					provider: "openai-compatible",
					model: "gemma-3",
					baseUrl: "https://api.together.xyz/v1",
					// apiKey is ignored (schema strips it); key goes to PUT /api/credentials/openai_compatible_api_key
				},
			}),
		});

		const res = await app.request("/api/model-gateway", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as GatewayBody;
		// apiKey must NOT be returned (never was, never will be)
		expect(body.fast.apiKey).toBeUndefined();
		// AH1: hasApiKey is always false — key presence is in GET /api/credentials
		expect(body.fast.hasApiKey).toBe(false);
	});

	test("returns hasApiKey: false when openai-compatible has no apiKey", async ({ app }) => {
		await app.request("/api/model-gateway", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				reasoning: { provider: "anthropic", model: "claude-opus-4-8" }, // AH2: drift-catch
				workhorse: { provider: "anthropic", model: "claude-sonnet-4-6" }, // AH2: drift-catch
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

		const body = (await res.json()) as GatewayBody;
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

		const body = (await res.json()) as GatewayBody;
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
			reasoning: { provider: "anthropic", model: "claude-opus-4-8" }, // AH2: drift-catch
			workhorse: {
				provider: "openrouter",
				model: "anthropic/claude-sonnet-4",
			},
			fast: { provider: "anthropic", model: "claude-haiku-4-5" }, // AH2: drift-catch
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
		const body = (await getRes.json()) as GatewayBody;
		expect(body.workhorse.provider).toBe("openrouter");
		expect(body.workhorse.model).toBe("anthropic/claude-sonnet-4");
	});

	test("returns 400 for invalid provider value", async ({ app }) => {
		const res = await app.request("/api/model-gateway", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				reasoning: { provider: "invalid-provider", model: "some-model" },
				workhorse: { provider: "anthropic", model: "claude-sonnet-4-6" }, // AH2: drift-catch
				fast: { provider: "anthropic", model: "claude-haiku-4-5" }, // AH2: drift-catch
			}),
		});

		expect(res.status).toBe(400);
	});

	test("returns 400 for empty body (no tiers present)", async ({ app }) => {
		// AF15: Schema is now partial — any subset of tiers is valid. But an
		// empty PATCH (no tiers at all) is rejected with "at least one tier".
		// Previously this test asserted missing-'fast' was a 400 — that is no
		// longer the case since partial patches are intentionally supported.
		const res = await app.request("/api/model-gateway", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({}),
		});

		expect(res.status).toBe(400);
	});

	test("accepts 2-tier PATCH (missing fast tier) — partial schema (AF15)", async ({ app }) => {
		// AF15: A 2-tier PATCH is valid with the new partial schema.
		const res = await app.request("/api/model-gateway", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				reasoning: { provider: "anthropic", model: "claude-opus-4-8" }, // AH2: drift-catch
				workhorse: { provider: "anthropic", model: "claude-sonnet-4-6" }, // AH2: drift-catch
			}),
		});

		expect(res.status).toBe(200);
	});

	test("returns 400 when apiKey provided for non-openai-compatible provider", async ({ app }) => {
		const res = await app.request("/api/model-gateway", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				reasoning: {
					provider: "anthropic",
					model: "claude-opus-4-8", // AH2: drift-catch
					apiKey: "should-not-be-allowed",
				},
				workhorse: { provider: "anthropic", model: "claude-sonnet-4-6" }, // AH2: drift-catch
				fast: { provider: "anthropic", model: "claude-haiku-4-5" }, // AH2: drift-catch
			}),
		});

		expect(res.status).toBe(400);
	});

	test("AH1: PATCH response never includes apiKey — hasApiKey always false (key in server_credentials)", async ({
		app,
	}) => {
		// AH1 §2: apiKey removed from ModelTierConfig. The PATCH body's apiKey field
		// is accepted by the validation schema (for backward compat) but ignored — the
		// schema strips unknown fields and the tier config has no apiKey member.
		const res = await app.request("/api/model-gateway", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				reasoning: { provider: "anthropic", model: "claude-opus-4-8" }, // AH2: drift-catch
				workhorse: { provider: "anthropic", model: "claude-sonnet-4-6" }, // AH2: drift-catch
				fast: {
					provider: "openai-compatible",
					model: "gemma-3",
					baseUrl: "https://api.together.xyz/v1",
					// apiKey is accepted but ignored by AH1 (no longer stored in tier config)
				},
			}),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as GatewayBody;
		expect(body.fast.apiKey).toBeUndefined();
		// AH1: key is in server_credentials, not tier config — hasApiKey is always false here
		expect(body.fast.hasApiKey).toBe(false);
	});

	test("accepts openai-compatible with apiKey and baseUrl", async ({ app }) => {
		const res = await app.request("/api/model-gateway", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				reasoning: { provider: "anthropic", model: "claude-opus-4-8" }, // AH2: drift-catch
				workhorse: { provider: "anthropic", model: "claude-sonnet-4-6" }, // AH2: drift-catch
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

		const body = (await res.json()) as GatewayBody;
		// All three tiers should be anthropic direct (default)
		for (const tier of ["reasoning", "workhorse", "fast"] as const) {
			expect(body[tier].provider).toBe("anthropic");
		}
	});

	test("persisted modelGateway config survives a second GET call", async ({ app }) => {
		const patchBody = {
			reasoning: { provider: "openrouter", model: "anthropic/claude-opus" },
			workhorse: { provider: "anthropic", model: "claude-sonnet-4-6" }, // AH2: drift-catch
			fast: { provider: "anthropic", model: "claude-haiku-4-5" }, // AH2: drift-catch
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
		const body = (await res.json()) as GatewayBody;
		expect(body.reasoning.provider).toBe("openrouter");
		expect(body.reasoning.model).toBe("anthropic/claude-opus");
	});
});
