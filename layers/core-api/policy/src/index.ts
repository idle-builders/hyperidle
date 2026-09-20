/**
 * Barrel for @hyperidle/policy (core-api Layer, non-SQL orchestration Service).
 *
 * @lore AU20 Am1: collapsed from 32 → 9 exports. The ~20 DI-port
 * interfaces + 3 separate deps bundles (`PolicyEngineDeps`,
 * `ApprovalRateDeps`, `HandoffDeps`, `LifecyclePropagationDeps`) are
 * bundled into ONE `PolicyDeps` injection type wired at the composition
 * root; the internal sub-types remain in `ports.ts` but are not re-exported.
 * The two `register*` functions are unified under `registerPolicy` (one boot
 * call, one disposer). The propagation_log table and its retry machinery
 * (`retryFailedPropagations`, `recordPropagationHop`) are deleted (AU20
 * Ruling 2 / AU44 batch6). `InvalidTransitionError`/`VALID_TRANSITIONS` (local
 * task-state-machine mirror used only by `handoff-protocol.ts` and
 * `lifecycle-propagation.ts`) are internal; `PolicySessionContext` stays
 * public because it appears as a field type on the exported `HandoffParams`.
 *
 * @lore AU19 Increment 2a: the four policy seed files moved here from
 * `packages/server/src/services/` (behavior-preserving move; every raw
 * cross-Service table/function access became an injected DI port, `ports.ts`).
 *
 * @lore BC3 architecture.md §5 R2: `register-policy.ts`/`registerPolicy`
 * DELETED — it only ever collapsed `registerPolicyEngine` +
 * `registerLifecyclePropagation` into one call; with the policy engine
 * gone (R2, plan.md's "the policy engine's one unique effect" — auto-
 * approval by approval rate), one registration is noise. Lifecycle
 * propagation survives and is exported directly.
 */

// -- approval rate (AD4) --
export type { ApprovalRateResult } from "./approval-rate.js";
export { computeApprovalRate } from "./approval-rate.js";
// -- lifecycle propagation (the policy engine itself is deleted) --
export { registerLifecyclePropagation } from "./lifecycle-propagation.js";
// handoff protocol DELETED — handoff is `edit_task({ ownerAgentId })`
// now. the architecture doc §8 B4.
// -- aggregate injection contract + cross-boundary types --
export type { PolicyDeps } from "./ports.js";
