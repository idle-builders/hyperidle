/**
 * `cost` Service — the bound-ops factory.
 *
 * @lore AU19 Increment 3g: `checkCostCap`/`recordCostAndCheck`/
 * `getFactoryCostActual`/`resetCosts`/`runCostSentinelCheck`/
 * `startCostSentinel` all now take an explicit `CostDeps` parameter
 * (Mechanism C DI). But this Service's real downstream consumers expect the
 * ORIGINAL, deps-free call signatures, unchanged:
 *
 *  - `work`'s `CostCapChecker` port (`packages/core-api/work/src/ports.ts`,
 *    a §10.3 against-grain edge — RULED PERMANENT this migration, see
 *    `ports.ts`'s top `@lore` and `work`'s own `ports.ts`: `checkCostCap`
 *    is a synchronous pre-flight read whose return value gates
 *    `bet-decomposition.ts`'s control flow in the SAME code path — an
 *    EventBus emit cannot serve a synchronous request/response need,
 *    matching the `policy ⚠ session-requests` read-then-branch precedent
 *    §10.3's amendment already established) — `checkCostCap(db, eventBus, params)`.
 *  - `packages/server`'s many direct call sites (`session-provisioning.ts`,
 *    `routine-scheduler.ts`, `routes/artifacts.ts`, `server-factory.ts`,
 *    integration tests) — every original signature.
 *
 * Same idiom as `agent-selection`'s `createAgentSelectionOps`: `createCostOps`
 * closes over the `users`/`org`/`work`/`settings` ports ONCE, at the
 * composition root (`packages/server`), and returns bound functions whose
 * signatures exactly match what every downstream caller already expects — a
 * mechanical wiring swap, zero behavior change.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import {
	type CheckCostCapParams,
	type CostCapResult,
	checkCostCap,
	getFactoryCostActual,
	type RecordCostAndCheckParams,
	type ResetCostsParams,
	recordCostAndCheck,
	resetCosts,
} from "./cost-cap.js";
import { runCostSentinelCheck, startCostSentinel } from "./cost-sentinel.js";
import type { CostDeps } from "./ports.js";

/** The deps-free surface this Service's downstream callers (`work`, `packages/server`) expect. */
export interface CostOps {
	checkCostCap(
		db: HyperIdleDb,
		eventBus: EventBus,
		params: CheckCostCapParams,
	): Promise<CostCapResult>;
	recordCostAndCheck(
		db: HyperIdleDb,
		eventBus: EventBus,
		params: RecordCostAndCheckParams,
	): Promise<void>;
	getFactoryCostActual(db: HyperIdleDb): Promise<number>;
	resetCosts(db: HyperIdleDb, params: ResetCostsParams | string): Promise<void>;
	runCostSentinelCheck(
		db: HyperIdleDb,
		eventBus: EventBus,
	): Promise<{ fired: true; emitted: readonly string[] }>;
	startCostSentinel(db: HyperIdleDb, eventBus: EventBus): () => void;
}

/** Bind this Service's DB-touching functions to a single `CostDeps` instance. */
export function createCostOps(deps: CostDeps): CostOps {
	return {
		checkCostCap: (db, eventBus, params) => checkCostCap(deps, db, eventBus, params),
		recordCostAndCheck: (db, eventBus, params) => recordCostAndCheck(deps, db, eventBus, params),
		getFactoryCostActual: (db) => getFactoryCostActual(deps, db),
		resetCosts: (db, params) => resetCosts(deps, db, params),
		runCostSentinelCheck: (db, eventBus) => runCostSentinelCheck(deps, db, eventBus),
		startCostSentinel: (db, eventBus) => startCostSentinel(deps, db, eventBus),
	};
}
