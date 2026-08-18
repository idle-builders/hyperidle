/**
 * Barrel for @hyperidle/policy (core-api Layer, non-SQL orchestration Service).
 *
 * @lore AU20 Am1: collapsed from 32 → 9 exports. The ~20 DI-port
 * interfaces + 3 separate deps bundles (`PolicyEngineDeps`,
 * `ApprovalRateDeps`, `HandoffDeps`, `LifecyclePropagationDeps`) are
 * bundled into ONE `PolicyDeps` injection type wired at the composition
 * root; the internal sub-types remain in `ports.ts` but are not re-exported.
 * The two `register*` functions are unified under `registerPolicy` (one boot
 * call, one disposer). `retryFailedPropagations` is INTERNAL — integration
 * tests that need it import it directly from `lifecycle-propagation.ts` via
 * a relative path. `InvalidTransitionError`/`VALID_TRANSITIONS` (local
 * task-state-machine mirror used only by `handoff-protocol.ts` and
 * `lifecycle-propagation.ts`) are internal; `PolicySessionContext` stays
 * public because it appears as a field type on the exported `HandoffParams`.
 *
 * @lore AU19 Increment 2a: the four policy seed files moved here from
 * `packages/server/src/services/` (behavior-preserving move; every raw
 * cross-Service table/function access became an injected DI port, `ports.ts`).
 */

// -- approval rate (AD4) --
export type { ApprovalRateResult } from "./approval-rate.js";
export { computeApprovalRate } from "./approval-rate.js";
// -- handoff protocol --
export type { HandoffMetadata, HandoffParams, HandoffResult } from "./handoff-protocol.js";
export { buildHandoff } from "./handoff-protocol.js";
// -- aggregate injection contract + cross-boundary types --
export type { PolicyDeps, PolicySessionContext } from "./ports.js";
// -- unified policy registration --
export { registerPolicy } from "./register-policy.js";
