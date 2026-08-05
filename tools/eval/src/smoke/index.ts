/**
 * AH5: Smoke lane — public re-exports.
 *
 * Imported by layers/core-ui/__scripts__/ah5-test-server.ts and ah5-resolve-model.ts.
 * Workspace hoisting makes @hyperidle/eval available to scripts/ in layers/core-ui.
 */

export type { ModelEndpoints, OpenRouterEndpoint, OpenRouterModel } from "./openrouter-catalog.js";
export {
	fetchModelEndpoints,
	fetchSmokeCatalog,
	narrowModelEndpoints,
	narrowModels,
} from "./openrouter-catalog.js";
export type { SmokeModelPolicy } from "./policy.js";
export { DEFAULT_SMOKE_POLICY } from "./policy.js";
export type { SelectionInput, SelectionResult, SmokeCandidate } from "./select-smoke-model.js";
export { preFilterModels, selectSmokeModel } from "./select-smoke-model.js";
