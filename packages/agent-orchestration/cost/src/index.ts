/**
 * Barrel for @hyperidle/cost (agent-orchestration Layer Service).
 *
 * Typed functions only — this Service owns zero tables (§4 roster confirms
 * the original "—"/"—" entry), so there is no raw table object to guard
 * against re-exporting.
 *
 * @lore AU19 Increment 3g: this is the real cut-over — `cost-cap.ts`/
 * `cost-sentinel.ts` moved here from `packages/server/src/services/`
 * (behavior-preserving move). Every raw cross-Service call became an
 * injected DI port (Mechanism C, `ports.ts`): `users`/`org`/`work`/`settings`,
 * all ordinary downward edges (agent-orchestration reaching down into
 * core-api). `createCostOps` (`service.ts`) binds a single `CostDeps`
 * instance once, at the composition root (`packages/server`'s new
 * `cost-bindings.ts`), and every real call site imports the bound singleton
 * — same idiom as `agent-selection`.
 *
 * `work`'s against-grain `CostCapChecker` port (`packages/core-api/work/src/ports.ts`,
 * interim since Increment 1b) is RULED PERMANENT this migration — see
 * `ports.ts`'s top `@lore`. `policy`'s against-grain `PolicyCostDedupReleaser`
 * port is INVERTED to an EventBus subscription this migration — see
 * `cost-cap.ts`'s `registerCostCapDedupReleaser` top `@lore`.
 */

// -- cost cap (I3/L17/R5/AU18 — agent/team/factory cap check + accumulation) --
export type {
	CheckCostCapParams,
	CostCapResult,
	RecordCostAndCheckParams,
	ResetCostsParams,
} from "./cost-cap.js";
export {
	clearDeduplicationCache,
	getDedupCacheSize,
	registerCostCapDedupReleaser,
	releaseSessionDedup,
} from "./cost-cap.js";
// -- cost sentinel (G4/AD8c/AU18 — periodic factory-cap dedup-by-level sentinel) --
export type { CostSentinelLevel } from "./cost-sentinel.js";
export {
	COST_SENTINEL_INTERVAL_MS,
	COST_WARNING_RATIO,
	clearCostSentinelCache,
} from "./cost-sentinel.js";
// -- ports (Mechanism C — DI-injected outbound edges) --
export type {
	CostDeps,
	CostReviewItemInput,
	CostSettingsAccessor,
	CostSettingsPatch,
	CostSettingsSnapshot,
	CostTaskRef,
	CostTeamAccessor,
	CostTeamRow,
	CostUserAccessor,
	CostUserRow,
	CostWorkAccessor,
} from "./ports.js";

// -- service (the bound-ops factory, same idiom as `agent-selection`) --
export type { CostOps } from "./service.js";
export { createCostOps } from "./service.js";
