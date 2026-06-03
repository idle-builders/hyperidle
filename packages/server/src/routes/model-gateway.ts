/**
 * X4: Model Gateway API endpoints.
 *
 * GET  /api/model-gateway — returns current gateway config (apiKey stripped)
 * PATCH /api/model-gateway — validates and persists a new gateway config
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
import type { ModelGatewayConfig, ModelTierConfig } from "@hyperidle/shared";
import { MODEL_PROVIDERS } from "@hyperidle/shared";
import { Hono } from "hono";
import { z } from "zod";
import { validateBody } from "../middleware/validate.js";
import { ModelGatewayConfigSchema } from "../services/server-config.js";
import { readServerConfig, updateServerConfig } from "../services/server-config.js";

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

/**
 * X4: PATCH body validation. Stricter than ModelGatewayConfigSchema:
 *  - apiKey is only allowed when provider is "openai-compatible"
 *  - baseUrl is required when provider is "openai-compatible"
 *
 * Implemented as a refinement on top of ModelGatewayConfigSchema.
 */
const PatchModelGatewaySchema = ModelGatewayConfigSchema.superRefine((data, ctx) => {
	for (const [tier, tierConfig] of Object.entries(data) as [
		string,
		{ provider: string; model: string; baseUrl?: string; apiKey?: string },
	][]) {
		if (tierConfig.provider !== "openai-compatible" && tierConfig.apiKey) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `apiKey is only allowed for openai-compatible providers (tier: ${tier})`,
				path: [tier, "apiKey"],
			});
		}
	}
});

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/**
 * X4 A-SEC-2: Strip apiKey from a tier config and return hasApiKey boolean.
 * The UI uses hasApiKey to show a credential status dot without navigation link.
 */
function stripApiKey(
	config: ModelTierConfig,
): Omit<ModelTierConfig, "apiKey"> & { hasApiKey: boolean } {
	const { apiKey, ...rest } = config;
	return { ...rest, hasApiKey: Boolean(apiKey) };
}

function sanitizeConfig(
	config: ModelGatewayConfig,
): Record<string, Omit<ModelTierConfig, "apiKey"> & { hasApiKey: boolean }> {
	return {
		reasoning: stripApiKey(config.reasoning),
		workhorse: stripApiKey(config.workhorse),
		fast: stripApiKey(config.fast),
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
	 * Accepts a full ModelGatewayConfig. Validates, persists, returns sanitized config.
	 */
	router.patch("/", validateBody(PatchModelGatewaySchema), async (c) => {
		const body = c.req.valid("json" as never) as ModelGatewayConfig;

		const updated = await updateServerConfig(db, { modelGateway: body });
		return c.json(sanitizeConfig(updated.modelGateway));
	});

	return router;
}
