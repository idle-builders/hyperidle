/**
 * AH5: Smoke lane — public re-exports.
 *
 * Imported by packages/web/scripts/ah5-test-server.ts and ah5-resolve-model.ts.
 * Workspace hoisting makes @hyperidle/eval available to scripts/ in packages/web.
 */

export type { OpenRouterModel, OpenRouterEndpoint, ModelEndpoints } from "./openrouter-catalog.js";
export { fetchSmokeCatalog, fetchModelEndpoints, narrowModels, narrowModelEndpoints } from "./openrouter-catalog.js";
export type { SmokeModelPolicy } from "./policy.js";
export { DEFAULT_SMOKE_POLICY } from "./policy.js";
export type { SmokeCandidate, SelectionInput, SelectionResult } from "./select-smoke-model.js";
export { selectSmokeModel, isWithinCostCap } from "./select-smoke-model.js";
