/**
 * AH2 — validate the (harnessType, modelProvider, modelId) triple an agent's
 * run config carries, against the adapter pool + the model catalog.
 *
 * @lore AU31 §2.8: moved here from `@hyperidle/run-orchestration` (which itself
 * had it via AU26 G1, "moved with the columns it validates"). That rationale
 * held only while a same-layer import was free; under AU31's boundary rule a
 * `layer → service (other layer) [import]` crossing costs something and buys
 * nothing here, so the function returns to the layer that owns its only
 * callers. It is pure computation over `@hyperidle/domain-model`/
 * `@hyperidle/harness-protocol` types (no database, no service call, no
 * `await`) — reach `everyone`, so core-api hosting it costs no new dependency
 * either call site did not already carry (`routes/agents.ts`,
 * `routes/assistant.ts` both already import `HarnessCapabilityReader` and
 * already hold the pool instance). It is NOT a seam op: both call sites need
 * the verdict before doing something else (a 422 with no side effect), so
 * routing it through `AgentOrchestrationPort` would either delay validation
 * past the point it must gate, or spend a round trip to learn a request was
 * malformed — see architecture.md §2.8 for the full per-call-site accounting.
 * Deliberately NOT exported from this layer's package export map — a
 * core-api-internal request-admission check, not a face op.
 *
 * Validation order (per plan + reviewer NEW-1):
 *  1. UNSUPPORTED_PROVIDER — openai-compatible cannot be used for per-agent model
 *  2. UNKNOWN_HARNESS — harnessType must be registered in the pool (when non-null)
 *  3. UNKNOWN_MODEL — modelId must be one the chosen harness offers (when it states any)
 *  4. INCOMPATIBLE_HARNESS_MODEL — provider must be in harness's modelProviders list
 */

import {
	type HarnessCapabilityReader,
	harnessRegistrationMeta,
} from "../services/harness-capability-reader.js";

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

	// 3. UNKNOWN_MODEL — the model must be one the chosen harness offers.
	//
	// The list comes from the harness itself, so it is stated in that harness's
	// own vocabulary: `haiku` and `sonnet[1m]` for claude, `gpt-5.6-sol` for
	// codex, `composer-2.5` for cursor, `openrouter/z-ai/glm-4.7-flash` for
	// opencode. No cross-harness namespace exists, and none is imposed.
	//
	// A harness that published NO models accepts anything. An empty list means
	// either "this harness manages its own models" or "the probe failed", and
	// those are indistinguishable from here — rejecting on it would let a network
	// hiccup block someone's save. Same rule `model-options.ts` follows for
	// option values, for the same reason.
	//
	// @lore The predecessor checked an anthropic-provider model against
	// `MODEL_CATALOG`, a static list of four gateway ids. Once discovery started
	// reading each harness's own model list, the editor offered `haiku` while
	// this rule answered UNKNOWN_MODEL — the dropdown and the save path disagreed
	// about what a model is.
	//
	// @lore A second clause used to sit under this one, judging the id against the
	// model gateway's per-provider catalog whenever the harness stated nothing. It
	// existed for the built-in harness alone — the only one that called a model API
	// itself and got a run-time 404 for a retired id — and it went with that
	// harness. Every harness left reports its own models or accepts anything.
	if (modelId && effectiveHarnessType && pool) {
		const descriptor = pool.describe({ type: effectiveHarnessType, includeKnownMissing: false })[0];
		const stated = descriptor?.models ?? [];
		if (stated.length > 0 && !stated.some((m) => m.id === modelId)) {
			return {
				error: `Model '${modelId}' is not one '${effectiveHarnessType}' offers. Pick one from its list in Settings → Agents.`,
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
