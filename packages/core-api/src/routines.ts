/**
 * AU11: curated public cross-package export for `packages/eval` — the only
 * legitimate consumer outside `@hyperidle/server` of routine-firing
 * functions. `packages/eval` declares `@hyperidle/server: "*"` and can only
 * consume declared package exports (no deep `src/...` imports), so deleting
 * the former `./app-runtime` grab-bag barrel would strand it.
 *
 * This is a deliberate, narrow public seam exposing the bound `dispatchOps`
 * object, not a grouping barrel. Do not add unrelated exports here without a
 * genuine cross-package consumer.
 *
 * @lore AU21 §9 Increment 4: `dispatchOps.fireRoutine`/`.provisionTeamRoutines`
 * split — routine-firing moved to `routine-scheduler-bindings.ts`'s
 * `fireRoutine` (dispatch itself sheds routine awareness). `provisionTeamRoutines`
 * stays on `dispatchOps` (definition-seeding, unchanged this increment).
 */

export { dispatchOps } from "./services/dispatch-bindings.js";
export { fireRoutine } from "./services/routine-scheduler-bindings.js";
