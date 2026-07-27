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
 */

export { dispatchOps } from "./services/dispatch-bindings.js";
