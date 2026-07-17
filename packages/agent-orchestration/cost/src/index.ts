/**
 * Barrel for @hyperidle/cost (agent-orchestration Layer Service).
 *
 * @lore AU20 Am3: collapsed from 25 exports to 8. The only public surface
 * is the `CostOps` interface, the `createCostOps` factory, the `CostDeps`
 * DI contract, and the four discriminated-union parameter/result types
 * (`CostScope`, `CostVerdict`, `CostCheckParams`, `CostRecordParams`).
 *
 * Row types (`CostUserRow`, `CostTeamRow`, etc.) remain in `ports.ts` for
 * package-internal use but are NOT re-exported here — the composition root
 * (`cost-bindings.ts`) receives them through `CostDeps` context inference.
 *
 * Test hooks (`clearDeduplicationCache`, `getDedupCacheSize`,
 * `releaseSessionDedup`, `registerCostCapDedupReleaser`,
 * `clearCostSentinelCache`) are bridged by `cost-bindings.ts` via
 * `createCostOps(deps)._testHooks` — not in this barrel.
 *
 * Sentinel constants/types (`COST_SENTINEL_INTERVAL_MS`, `COST_WARNING_RATIO`,
 * `CostSentinelLevel`) are package-internal — not in this barrel.
 */

// -- discriminated-union parameter/result types --
// -- DI contract (ONE deps bundle, replaces 10 separate accessor re-exports) --
export type {
	CostCheckParams,
	CostDeps,
	CostRecordParams,
	CostScope,
	CostVerdict,
} from "./ports.js";

// -- service interface + factory --
export type { CostOps, CostTestHooks } from "./service.js";
export { createCostOps } from "./service.js";
