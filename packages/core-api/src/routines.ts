/**
 * AU11: curated public cross-package export for `packages/eval` — the only
 * legitimate consumer outside `@hyperidle/server` of routine-firing
 * functions. `packages/eval` declares `@hyperidle/server: "*"` and can only
 * consume declared package exports (no deep `src/...` imports), so deleting
 * the former `./app-runtime` grab-bag barrel would strand it.
 *
 * This is a deliberate, narrow public seam — three named functions, not a
 * grouping barrel — idiomatic to this package (cf. `./tools` → `src/tools/
 * index.ts`, `./services/session-lifecycle-bindings`). It is NOT an app-runtime
 * alias: `checkAndFireRoutine` comes from the Core-owned routine scheduler;
 * `provisionTeamRoutines` / `runBuiltinRoutine` come from the agent-owned
 * builtin-routine handlers. Do not add further exports here without a
 * genuine new cross-package consumer — this file must never regrow into a
 * barrel (the au11 guard's alias/barrel check allowlists exactly this file
 * and exactly these three re-exports).
 */

export {
	checkAndFireRoutine,
	provisionTeamRoutines,
	runBuiltinRoutine,
} from "./services/dispatch-bindings.js";
