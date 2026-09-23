/**
 * AH2 — validate the (harnessType, modelProvider, modelId) triple an agent's
 * run config carries, against the adapter pool + the model catalog.
 *
 * @lore architecture.md §6: moved verbatim from `layers/core-api/src/
 * routes/validate-agent-config.ts` into this package — `edit_user`'s create
 * and edit paths are now this function's only callers, replacing
 * `routes/agents.ts`/`routes/assistant.ts`'s direct calls (those routes
 * import it from `@hyperidle/user` now). Pure computation over a hand-typed,
 * structural subset of `HarnessCapabilityDescriptor` (no database, no
 * service call, no `await`) — this Service may import neither
 * `@hyperidle/harness-capability` (governance: reachable only by core-ui,
 * core-api, harness-registry, connections, run-orchestration, agent-execution
 * — a nested Service is none of those) nor `core-api/src`'s own
 * `HarnessCapabilityReader`; the real pool satisfies this narrower shape by
 * structural subtyping either way.
 *
 * Validation order (per plan + reviewer NEW-1):
 *  1. UNSUPPORTED_PROVIDER — openai-compatible cannot be used for per-agent model
 *  2. UNKNOWN_HARNESS — harnessType must be registered in the pool (when non-null)
 *  3. UNKNOWN_MODEL — modelId must be one the chosen harness offers (when it states any)
 *  4. INCOMPATIBLE_HARNESS_MODEL — provider must be in harness's modelProviders list
 */

/** Structural subset of `HarnessCapabilityDescriptor` — only the fields this
 * validation pass reads. */
export interface HarnessCapabilityDescriptorProbe {
	readonly models: readonly { readonly id: string }[];
	readonly modelProviders: readonly string[];
}

/**
 * The narrow read a validation pass needs off the adapter pool — a
 * structural subset of `core-api/src`'s own `HarnessCapabilityReader`
 * (which this Service may not import).
 */
export interface HarnessCapabilityProbe {
	describe(options?: {
		readonly type?: string;
		readonly includeKnownMissing?: boolean;
	}): HarnessCapabilityDescriptorProbe[];
}

/** A rejected run-config triple: the user-facing message plus its stable error code. */
export interface AgentConfigValidationError {
	readonly error: string;
	readonly code: string;
}

function registeredDescriptor(
	pool: HarnessCapabilityProbe,
	harnessType: string,
): HarnessCapabilityDescriptorProbe | null {
	return pool.describe({ type: harnessType, includeKnownMissing: false })[0] ?? null;
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
	pool: HarnessCapabilityProbe | null,
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
	let descriptor: HarnessCapabilityDescriptorProbe | null = null;
	if (effectiveHarnessType && pool) {
		descriptor = registeredDescriptor(pool, effectiveHarnessType);
		if (!descriptor) {
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
	if (modelId && effectiveHarnessType && descriptor) {
		const stated = descriptor.models ?? [];
		if (stated.length > 0 && !stated.some((m) => m.id === modelId)) {
			return {
				error: `Model '${modelId}' is not one '${effectiveHarnessType}' offers. Pick one from its list in Settings → Agents.`,
				code: "UNKNOWN_MODEL",
			};
		}
	}

	// 4. INCOMPATIBLE_HARNESS_MODEL — provider must be in the harness's own
	// declared modelProviders list. An empty list means provider-agnostic
	// (CLI/inherited-login harness that brings its own provider) — skip the
	// check. Only reject when the harness declares a non-empty explicit
	// provider list that excludes the requested provider.
	if (effectiveHarnessType && effectiveProvider && descriptor) {
		if (
			descriptor.modelProviders.length > 0 &&
			!descriptor.modelProviders.includes(effectiveProvider)
		) {
			return {
				error: `Harness '${effectiveHarnessType}' does not support provider '${effectiveProvider}'. Supported: ${descriptor.modelProviders.join(", ")}.`,
				code: "INCOMPATIBLE_HARNESS_MODEL",
			};
		}
	}

	return null;
}
