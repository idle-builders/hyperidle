/**
 * X4: Model Gateway API endpoints.
 *
 * GET  /api/model-gateway — returns current gateway config (apiKey stripped)
 * PATCH /api/model-gateway — validates and persists a partial gateway config
 *
 * Security:
 *  - apiKey fields are NEVER returned in GET responses. Instead, hasApiKey: boolean
 *    is returned (A-SEC-2). This prevents the UI accidentally sending "***" back.
 *  - PATCH rejects apiKey on non-openai-compatible providers (A-SEC-2).
 *  - The global rate limiter (60 req/min) covers PATCH. See @lore in server-config.ts.
 *
 * @lore X4 A-SPEC-1: The AC "gateway formats requests to OpenRouter's API, passes
 * the X-Title header, and handles OpenRouter-specific response fields" is deferred
 * to X6 (Built-in Harness). The gateway resolves config; it does not format
 * requests. X6 is responsible for request normalization and response parsing.
 *
 * @lore X4 A-SPEC-2: "factory_settings" in the spec refers to serverConfig
 * (the successor to factorySettings). The modelGateway key lives in the
 * server_config table's JSON blob — same storage pattern as notifications.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import {
	MODEL_PROVIDERS,
	type ModelGatewayConfig,
	type ModelTierConfig,
} from "@hyperidle/domain-model";
import { validateBody } from "@hyperidle/http-middleware";
import { readServerConfig, updateServerConfig } from "@hyperidle/settings";
import { Hono } from "hono";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

/**
 * AF15: Partial PATCH body validation.
 *
 * Each tier is fully optional. Within a present tier, every field is optional
 * (a PATCH may touch only e.g. { model } on one tier).
 *
 * Three load-bearing guards in superRefine:
 *  (a) Skip omitted tiers — `if (!tc) continue`
 *  (b) apiKey rejection guarded by `provider !== undefined` — only reject a
 *      stray apiKey when the patch is ALSO setting the provider in the same tier.
 *  (c) baseUrl-required guarded by `provider === "openai-compatible"` IN the
 *      patch — validate the rule against what the patch SETS, not the merged
 *      result. This means a model-only patch on an existing oai tier is accepted.
 *
 * At least one tier must be present (empty PATCH is a no-op and should 400).
 *
 * @lore AF15: Replaced the strict full-replacement PatchModelGatewaySchema
 * (required all 3 tiers, provider+model required) with this deep-partial schema.
 * The old schema made single-tier patches impossible. The plan specifies exactly
 * which predicates to use — validate-patch-not-merge is the chosen approach.
 */
const PartialModelTierSchema = z.object({
	provider: z.enum(MODEL_PROVIDERS).optional(),
	model: z.string().min(1).optional(),
	baseUrl: z.string().url().optional(),
	apiKey: z.string().optional(),
});

const PartialModelGatewaySchema = z
	.object({
		reasoning: PartialModelTierSchema.optional(),
		workhorse: PartialModelTierSchema.optional(),
		fast: PartialModelTierSchema.optional(),
	})
	.refine((g) => g.reasoning ?? g.workhorse ?? g.fast, {
		message: "PATCH must include at least one tier",
	});

const PatchModelGatewaySchema = PartialModelGatewaySchema.superRefine((data, ctx) => {
	for (const [tier, tc] of Object.entries(data) as [
		string,
		{ provider?: string; model?: string; baseUrl?: string; apiKey?: string } | undefined,
	][]) {
		if (!tc) continue; // (a) skip omitted tiers entirely

		// (b) apiKey rejection — only when provider is also being set in this patch
		if (
			tc.provider !== undefined &&
			tc.provider !== "openai-compatible" &&
			tc.apiKey !== undefined
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `apiKey is only allowed for openai-compatible providers (tier: ${tier})`,
				path: [tier, "apiKey"],
			});
		}

		// (c) baseUrl required only when switching TO openai-compatible in this patch
		if (tc.provider === "openai-compatible" && !tc.baseUrl) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `baseUrl is required when setting provider to openai-compatible (tier: ${tier})`,
				path: [tier, "baseUrl"],
			});
		}
	}
});

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/**
 * AH1 §2: apiKey no longer in ModelTierConfig — it lives in server_credentials.
 * hasApiKey is now always false from the tier config perspective; the credentials
 * route is the source of truth for credential presence/state.
 *
 * @lore AH1 A-SEC-2: stripApiKey kept for API shape compatibility (hasApiKey: boolean
 * in response). hasApiKey is now always false because the tier has no apiKey field.
 * The credentials tab shows the real state via GET /api/credentials.
 */
function sanitizeConfig(
	config: ModelGatewayConfig,
): Record<string, ModelTierConfig & { hasApiKey: boolean }> {
	const sanitizeTier = (tier: ModelTierConfig): ModelTierConfig & { hasApiKey: boolean } => ({
		...tier,
		hasApiKey: false, // AH1: key now in server_credentials, not tier config
	});
	return {
		reasoning: sanitizeTier(config.reasoning),
		workhorse: sanitizeTier(config.workhorse),
		fast: sanitizeTier(config.fast),
	};
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

export function createModelGatewayRoutes(db: HyperIdleDb): Hono {
	const router = new Hono();

	/**
	 * GET /api/model-gateway
	 * Returns current gateway config. Strips apiKey, returns hasApiKey instead.
	 */
	router.get("/", async (c) => {
		const config = await readServerConfig(db);
		return c.json(sanitizeConfig(config.modelGateway));
	});

	/**
	 * PATCH /api/model-gateway
	 * Accepts a partial ModelGatewayConfig (any subset of tiers, any subset of fields).
	 * Validates, merges with stored config via per-tier merge, persists, returns sanitized config.
	 *
	 * @lore AF15: Body is a deep-partial (PartialModelGatewaySchema). The merge happens
	 * in updateServerConfig's mergeTier — stored apiKey is preserved when patch omits it.
	 */
	router.patch(
		"/",
		validateBody(PatchModelGatewaySchema),
		async (c) => {
			const body = c.req.valid("json" as never) as z.infer<typeof PartialModelGatewaySchema>;

			const updated = await updateServerConfig(db, { modelGateway: body });
			return c.json(sanitizeConfig(updated.modelGateway));
		},
	);

	return router;
}
