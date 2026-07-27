/**
 * Barrel for @hyperidle/model-gateway (core-api Layer, non-SQL orchestration
 * Service).
 *
 * Typed functions only. `model-gateway` owns ZERO tables — its config
 * (`server_config.modelGateway`) is owned by `settings` and passed in by the
 * caller as a plain `ModelGatewayConfig` parameter (this Service never reads
 * it itself).
 *
 * @lore AU19 Increment 2e: `model-gateway.ts`
 * (`resolveModelTier`/`resolveAgentModel`/`BUILT_IN_GATEWAY_CONFIG` re-export/
 * `UnsupportedAgentProviderError`) moved here from
 * `packages/server/src/services/model-gateway.ts`.
 *
 * @lore AU20 Increment Ab1: Surface collapsed from 6 → 4 exports.
 * - `resolveModelTier` + `resolveAgentModel` → single `resolveModel(request)`
 *   (the two were already one operation with a discriminated input).
 * - `AgentModelParams` folded into `ModelRequest`'s agent branch.
 * - `BUILT_IN_GATEWAY_CONFIG` re-export dropped — it lives in
 *   `@hyperidle/shared`; consumers import it there directly.
 * New surface: `resolveModel`, `ModelRequest`, `UnsupportedAgentProviderError`,
 * `ModelGatewayCredentialResolver`.
 */

export type { ModelRequest } from "./model-gateway.js";
export { resolveModel, UnsupportedAgentProviderError } from "./model-gateway.js";
// -- ports (Mechanism C — DI-injected outbound edges) --
export type { ModelGatewayCredentialResolver } from "./ports.js";
