/**
 * AH2 — validate the (harnessType, modelProvider, modelId) triple an agent's
 * run config carries, against the adapter pool + the model catalog.
 *
 * @lore AU26 G1: moved here from `packages/core-api/src/routes/agents.ts`
 * with the columns it validates (architecture §D-L cost item 4). It never had
 * a core dependency — it reads a structural `HarnessCapabilityReader` and
 * `@hyperidle/shared`'s catalog — so it moves cleanly. The write routes stay
 * core-hosted (§D-A rule 3: they gate on `users`, a core table) and call this
 * validator plus `writeAgentRunConfig` downward.
 *
 * Validation order (per plan + reviewer NEW-1):
 *  1. UNSUPPORTED_PROVIDER — openai-compatible cannot be used for per-agent model
 *  2. UNKNOWN_HARNESS — harnessType must be registered in the pool (when non-null)
 *  3. UNKNOWN_MODEL — for anthropic providers, modelId must be in the catalog
 *  4. INCOMPATIBLE_HARNESS_MODEL — provider must be in harness's modelProviders list
 */

import {
	type HarnessCapabilityReader,
	harnessRegistrationMeta,
	isCatalogModel,
} from "@hyperidle/shared";

/** A rejected run-config triple: the user-facing message plus its stable error code. */
export interface AgentConfigValidationError {
	readonly error: string;
	readonly code: string;
}

/**
 * @param effectiveHarnessType — the harness to validate (POST: data.harnessType ?? default;
 *   PATCH: data.harnessType ?? existing.harnessType).
 * @param effectiveProvider — the provider to validate (POST: data.modelProvider ?? default;
 *   PATCH: data.modelProvider ?? existing.modelProvider).
 * @param modelId — the model ID to validate (only for anthropic; null = no per-agent model)
 * @param pool — the adapter pool (null = no pool, skip registry checks)
 */
export function validateAgentConfig(
	effectiveHarnessType: string | null,
	effectiveProvider: string | null,
	modelId: string | null | undefined,
	pool: HarnessCapabilityReader | null,
): AgentConfigValidationError | null {
	// 1. UNSUPPORTED_PROVIDER — openai-compatible is not valid for per-agent model
	if (effectiveProvider === "openai-compatible") {
		return {
			error:
				"Per-agent model provider 'openai-compatible' is not supported. Only 'anthropic' and 'openrouter' models are available for per-agent selection.",
			code: "UNSUPPORTED_PROVIDER",
		};
	}

	// 2. UNKNOWN_HARNESS — harnessType must match a registered adapter type
	if (effectiveHarnessType && pool) {
		const meta = harnessRegistrationMeta(pool, effectiveHarnessType);
		if (!meta) {
			return {
				error: `Harness type '${effectiveHarnessType}' is not registered. Check Settings → Agents.`,
				code: "UNKNOWN_HARNESS",
			};
		}
	}

	// 3. UNKNOWN_MODEL — for anthropic, modelId must be in the catalog
	if (modelId && effectiveProvider === "anthropic") {
		if (!isCatalogModel(modelId)) {
			return {
				error: `Model '${modelId}' is not in the catalog. Use a current model ID from the catalog.`,
				code: "UNKNOWN_MODEL",
			};
		}
	}

	// 4. INCOMPATIBLE_HARNESS_MODEL — provider must be in harness's registration metadata
	// modelProviders list. An empty list means provider-agnostic (CLI/inherited-login harness
	// that brings its own provider) — skip the check. Only reject when the harness declares
	// a non-empty explicit provider list that excludes the requested provider.
	//
	// @lore POLISH-060 B1: Use registration metadata (meta.modelProviders) not
	// adapter.getCapabilities().modelProviders. The two diverge: CLI adapters set
	// meta.modelProviders = ["anthropic"] (so select() can route them) but
	// getCapabilities() returns [] (CLI is provider-agnostic at runtime). Reading
	// capabilities caused "Supported: ." (empty list) errors for valid claude-code combos.
	if (effectiveHarnessType && effectiveProvider && pool) {
		const meta = harnessRegistrationMeta(pool, effectiveHarnessType);
		if (
			meta &&
			meta.modelProviders.length > 0 &&
			!meta.modelProviders.includes(effectiveProvider)
		) {
			return {
				error: `Harness '${effectiveHarnessType}' does not support provider '${effectiveProvider}'. Supported: ${meta.modelProviders.join(", ")}.`,
				code: "INCOMPATIBLE_HARNESS_MODEL",
			};
		}
	}

	return null;
}
