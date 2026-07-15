/**
 * @lore AU19 Increment 3g: `@hyperidle/cost`'s `createCostOps` needs injected
 * `users`/`org`/`work`/`settings` ports (Mechanism C — `cost` never imports
 * another Service). This module builds the bound singleton ONCE, at the
 * composition root, so every real call site (`server-factory.ts`,
 * `session-provisioning.ts`, `routine-scheduler.ts`, `routes/artifacts.ts`,
 * `session-lifecycle.ts`, and the many `__tests__` integration tests)
 * imports the already-wired functions unchanged — same factory-curry idiom
 * as `agent-selection`'s `AgentSelectionOps` wiring in `server-factory.ts`.
 *
 * `work`'s `CostCapChecker` port (`packages/core-api/work/src/ports.ts`) is
 * RULED PERMANENT — its concrete wiring repoints to `checkCostCap` here
 * (see that port's top `@lore`). `policy`'s former `PolicyCostDedupReleaser`
 * port is REMOVED — `handoff-protocol.ts` now emits
 * `session_handoff_completed` instead, which `registerCostCapDedupReleaser`
 * (re-exported below, deps-free) subscribes to directly.
 */

import type {
	CheckCostCapParams,
	CostCapResult,
	CostDeps,
	RecordCostAndCheckParams,
	ResetCostsParams,
} from "@hyperidle/cost";
import { createCostOps } from "@hyperidle/cost";
import type { HyperIdleDb } from "@hyperidle/db";
import {
	getTeamMembersById,
	incrementTeamMembersCost,
	resetAllTeamMembersCost,
	resetTeamMembersCost,
} from "@hyperidle/org";
import { readServerConfig, updateServerConfig } from "@hyperidle/settings";
import type { EventBus } from "@hyperidle/shared";
import {
	getUserById,
	incrementUserCost,
	resetAllUserCost,
	sumAllUserCost,
	updateUser,
} from "@hyperidle/users";
import { createItem, getTaskById, incrementBetCost } from "@hyperidle/work";

export {
	clearCostSentinelCache,
	clearDeduplicationCache,
	getDedupCacheSize,
	registerCostCapDedupReleaser,
	releaseSessionDedup,
} from "@hyperidle/cost";

const costDeps: CostDeps = {
	users: { getUserById, incrementUserCost, resetAllUserCost, sumAllUserCost, updateUser },
	org: {
		getTeamMembersById,
		incrementTeamMembersCost,
		resetTeamMembersCost,
		resetAllTeamMembersCost,
	},
	work: { getTaskById, incrementBetCost, createItem },
	settings: {
		readServerConfig,
		// `updateServerConfig` returns the merged `ServerConfig` (unused by
		// `cost-sentinel.ts`); the port's narrower `Promise<void>` signature
		// discards it explicitly rather than relying on TS's `void`-return
		// special-case, which does not thread through a `Promise<T>` wrapper.
		async updateServerConfig(db, patch) {
			await updateServerConfig(db, patch);
		},
	},
};

const costOps = createCostOps(costDeps);

/** Production-wired `checkCostCap` — every real call site imports this, not `@hyperidle/cost` directly. */
export function checkCostCap(
	db: HyperIdleDb,
	eventBus: EventBus,
	params: CheckCostCapParams,
): Promise<CostCapResult> {
	return costOps.checkCostCap(db, eventBus, params);
}

/** Production-wired `recordCostAndCheck` — every real call site imports this. */
export function recordCostAndCheck(
	db: HyperIdleDb,
	eventBus: EventBus,
	params: RecordCostAndCheckParams,
): Promise<void> {
	return costOps.recordCostAndCheck(db, eventBus, params);
}

/** Production-wired `getFactoryCostActual` — every real call site imports this. */
export function getFactoryCostActual(db: HyperIdleDb): Promise<number> {
	return costOps.getFactoryCostActual(db);
}

/** Production-wired `resetCosts` — every real call site imports this. */
export function resetCosts(db: HyperIdleDb, params: ResetCostsParams | string): Promise<void> {
	return costOps.resetCosts(db, params);
}

/** Production-wired `startCostSentinel` — every real call site imports this. */
export function startCostSentinel(db: HyperIdleDb, eventBus: EventBus): () => void {
	return costOps.startCostSentinel(db, eventBus);
}

/** Production-wired `runCostSentinelCheck` — every real call site imports this. */
export function runCostSentinelCheck(
	db: HyperIdleDb,
	eventBus: EventBus,
): Promise<{ fired: true; emitted: readonly string[] }> {
	return costOps.runCostSentinelCheck(db, eventBus);
}
