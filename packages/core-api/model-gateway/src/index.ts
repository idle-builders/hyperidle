/**
 * Barrel for @hyperidle/model-gateway (core-api Layer, non-SQL orchestration
 * Service).
 *
 * Typed functions only. `model-gateway` owns ZERO tables — its config
 * (`server_config.modelGateway`) is owned by `settings` and passed in by the
 * caller as a plain `ModelGatewayConfig` parameter (this Service never reads
 * it itself), same shape as `policy`'s Increment 2a / `git-export`'s
 * Increment 2c / `observability`'s Increment 2d zero-table findings. No
 * `TABLE_OWNER` row is added.
 *
 * @lore AU19 Increment 2e: this is the real cut-over — `model-gateway.ts`
 * (`resolveModelTier`/`resolveAgentModel`/`BUILT_IN_GATEWAY_CONFIG` re-export/
 * `UnsupportedAgentProviderError`) moved here from
 * `packages/server/src/services/model-gateway.ts` (behavior-preserving move
 * — the one real outbound edge, `model-gateway → connections`, became the
 * locally-declared `ModelGatewayCredentialResolver` DI port, `ports.ts`).
 * `settings → model-gateway` (§10.2 line 397) was ALREADY dissolved back in
 * Increment 1f (`@hyperidle/settings`'s `ports.ts` — `settings` only ever
 * needed the pure `BUILT_IN_GATEWAY_CONFIG` data constant, reclassified to
 * `@hyperidle/shared`), so no settings-side wiring changes here. Every real
 * consumer of the domain functions (`server-factory.ts`,
 * `services/agent-work-assistant.ts` — `dispatch → model-gateway`, §10.2
 * line 428 — and `packages/eval/src/runner.ts`) now imports from
 * `@hyperidle/model-gateway` instead of the deleted
 * `packages/server/src/services/model-gateway.ts` — same closing idiom as
 * `observability`'s Increment 2d. `routes/model-gateway.ts` (the HTTP CRUD
 * surface for `server_config.modelGateway`) never imported this Service's
 * domain functions — it only calls `@hyperidle/settings`' `readServerConfig`/
 * `updateServerConfig` — so it needed no change.
 */

export type { AgentModelParams } from "./model-gateway.js";
export {
	BUILT_IN_GATEWAY_CONFIG,
	resolveAgentModel,
	resolveModelTier,
	UnsupportedAgentProviderError,
} from "./model-gateway.js";
// -- ports (Mechanism C — DI-injected outbound edges) --
export type { ModelGatewayCredentialResolver } from "./ports.js";
