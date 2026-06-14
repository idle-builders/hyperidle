/**
 * AH5: Pure model-selection logic for the smoke lane.
 *
 * No I/O. Fully unit-testable without a live OpenRouter key.
 * Input: model catalog + per-model endpoint data + policy.
 * Output: ranked list of qualifying candidates (best first).
 *
 * @lore AH5: The caller fetches endpoints for price/age survivors only —
 * keeps live API calls bounded. Endpoint data is keyed by bare model id.
 *
 * @lore AH5: `:nitro` suffix on routedId routes to the fastest provider
 * (equivalent to provider.sort:"throughput"). The bare id is kept separately
 * for endpoint lookups and fallback identification.
 *
 * @lore AH5: Fallback is expressed as an ordered ranked list. The caller
 * iterates ranked[] in order. If ranked[0] is delisted or unavailable at
 * provisioning time, the lane retries with ranked[1], etc. This is a
 * deterministic, unit-testable property of this pure function.
 */

import type { ModelEndpoints, OpenRouterModel } from "./openrouter-catalog.js";
import type { SmokeModelPolicy } from "./policy.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A qualifying candidate after all gates pass. */
export interface SmokeCandidate {
  readonly id: string;
  /** `${id}:nitro` — routes to the fastest provider. */
  readonly routedId: string;
  readonly completionPricePerMillion: number;
  /** Count of tool-capable providers above the uptime floor. */
  readonly toolProviderCount: number;
  /** Best throughput p50 over qualifying endpoints (tokens/s). 0 if no data. */
  readonly bestThroughputP50: number;
  /** Best (lowest) latency p50 over qualifying endpoints (s). Infinity if no data. */
  readonly bestLatencyP50: number;
}

/** Input to selectSmokeModel. */
export interface SelectionInput {
  readonly models: readonly OpenRouterModel[];
  /** Endpoints keyed by model id. Fetch only for price/age survivors. */
  readonly endpointsByModel: ReadonlyMap<string, ModelEndpoints>;
  readonly policy: SmokeModelPolicy;
}

/** Output of selectSmokeModel. */
export interface SelectionResult {
  /** Ranked survivors, best first. Empty array → no qualifying model found. */
  readonly ranked: readonly SmokeCandidate[];
}

// ---------------------------------------------------------------------------
// Algorithm
// ---------------------------------------------------------------------------

/**
 * Select qualifying smoke-lane models according to the documented gates.
 *
 * Gate pipeline:
 * 1. Drop ids ending `:free`.
 * 2. Drop models created before policy.minCreatedUnixSec (pre-2026-gen).
 * 3. Drop models where completion price > policy.maxCompletionPricePerMillion.
 * 4. For each survivor, check endpoint gates: tools support + uptime floor.
 *    Disqualify if toolProviderCount < policy.minToolProviders (redundancy gate).
 * 5. Rank survivors: bestThroughputP50 desc → bestLatencyP50 asc → price asc.
 * 6. Set routedId = `${id}:nitro`.
 */
export function selectSmokeModel(input: SelectionInput): SelectionResult {
  const { models, endpointsByModel, policy } = input;

  const candidates: SmokeCandidate[] = [];

  for (const model of models) {
    // Gate 1: exclude :free variants
    if (model.id.endsWith(":free")) continue;

    // Gate 2: generation cutoff
    if (model.created < policy.minCreatedUnixSec) continue;

    // Gate 3: price ceiling (completion price only, per-1M USD)
    const completionPricePerMillion = parseFloat(model.pricing.completion) * 1e6;
    if (isNaN(completionPricePerMillion) || completionPricePerMillion > policy.maxCompletionPricePerMillion) {
      continue;
    }

    // Gate 4: per-provider endpoint gates
    const modelEndpoints = endpointsByModel.get(model.id);
    if (!modelEndpoints) continue; // no endpoint data → skip (not enough info)

    const qualifyingEndpoints = modelEndpoints.endpoints.filter((ep) => {
      const hasTools = ep.supported_parameters.includes("tools");
      const uptimeOk =
        ep.uptime_last_30m !== null && ep.uptime_last_30m >= policy.minUptimeLast30m;
      const statusOk = ep.status !== "deprecated" && ep.status !== "disabled";
      return hasTools && uptimeOk && statusOk;
    });

    // Redundancy gate: need at least minToolProviders providers
    if (qualifyingEndpoints.length < policy.minToolProviders) continue;

    // Build candidate metrics
    const bestThroughputP50 =
      qualifyingEndpoints
        .map((ep) => ep.throughput_last_30m?.p50 ?? 0)
        .reduce((max, v) => Math.max(max, v), 0);

    const bestLatencyP50 =
      qualifyingEndpoints
        .map((ep) => ep.latency_last_30m?.p50 ?? Infinity)
        .reduce((min, v) => Math.min(min, v), Infinity);

    candidates.push({
      id: model.id,
      routedId: `${model.id}:nitro`,
      completionPricePerMillion,
      toolProviderCount: qualifyingEndpoints.length,
      bestThroughputP50,
      bestLatencyP50,
    });
  }

  // Rank: throughput desc → latency asc → price asc
  const ranked = candidates.slice().sort((a, b) => {
    if (b.bestThroughputP50 !== a.bestThroughputP50) {
      return b.bestThroughputP50 - a.bestThroughputP50;
    }
    if (a.bestLatencyP50 !== b.bestLatencyP50) {
      return a.bestLatencyP50 - b.bestLatencyP50;
    }
    return a.completionPricePerMillion - b.completionPricePerMillion;
  });

  return { ranked };
}

// ---------------------------------------------------------------------------
// Cost-cap helper (pure)
// ---------------------------------------------------------------------------

/**
 * Pure predicate: is the observed cost within the cap?
 *
 * @lore AH5: Fail closed — if totalCostCents > capCents the assertion fails.
 * Called by the probe and by the CI budget-assert step.
 */
export function isWithinCostCap(totalCostCents: number, capCents: number): boolean {
  return totalCostCents <= capCents;
}
