/**
 * AU11: curated public cross-package export for `tools/eval` — the only
 * legitimate consumer outside `@hyperidle/server` of routine-firing
 * functions. `tools/eval` declares `@hyperidle/server: "*"` and can only
 * consume declared package exports (no deep `src/...` imports), so deleting
 * the former `./app-runtime` grab-bag barrel would strand it.
 *
 * This is a deliberate, narrow public seam exposing routine-firing
 * functions, not a grouping barrel. Do not add unrelated exports here
 * without a genuine cross-package consumer.
 *
 * @lore AU21 §9 Increment 4: routine-firing lives in
 * `routine-scheduler-bindings.ts`'s `fireRoutine`.
 *
 * @lore AU21 §9 Increment 9 (forensic-triage wave, second pass): `provisionTeamRoutines`
 * is an intra-package call within `@hyperidle/routine`, re-exported here so
 * `tools/eval` consumes it as a plain named import.
 */

export { provisionTeamRoutines } from "@hyperidle/routine";
export { fireRoutine } from "./services/routine-scheduler-bindings.js";
