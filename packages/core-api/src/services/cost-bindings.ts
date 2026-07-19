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
 * @lore AU20 Am3: API collapse (25 → 8 barrel exports). The five test-hook
 * helpers (`clearDeduplicationCache`, `getDedupCacheSize`, `releaseSessionDedup`,
 * `registerCostCapDedupReleaser`, `clearCostSentinelCache`) are no longer
 * in the `@hyperidle/cost` barrel — they're bridged here via
 * `costOps._testHooks` so integration tests that import from
 * `../services/cost-bindings.js` continue to work unchanged.
 *
 * The production function names (`checkCostCap`, `recordCostAndCheck`,
 * `resetCosts`, `getFactoryCostActual`, `startCostSentinel`,
 * `runCostSentinelCheck`) keep their old signatures for backward compatibility
 * — they delegate to the renamed new methods (`check`, `record`, `reset`,
 * `spend({level:"factory"})`, `startSentinel`, `runCostSentinelCheck`).
 */

import type {
	CostCheckParams,
	CostDeps,
	CostRecordParams,
	CostScope,
	CostVerdict,
} from "@hyperidle/cost";
import { createCostOps } from "@hyperidle/cost";
import type { HyperIdleDb, WriteExecutor } from "@hyperidle/db";
import { applyTeamCost, getTeamMembers } from "@hyperidle/org";
import { readServerConfig, updateServerConfig } from "@hyperidle/settings";
import type { EventBus } from "@hyperidle/shared";
import {
	findUser,
	incrementUserCost,
	resetAllUserCost,
	sumAllUserCost,
	updateUser,
} from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { createItem, incrementBetCost } from "@hyperidle/work";

const costDeps: CostDeps = {
	users: {
		getUserById: (db, id) => findUser(db, { id }),
		incrementUserCost,
		resetAllUserCost,
		sumAllUserCost,
		updateUser,
	},
	// @lore AU20 Am7: per-verb cost functions replaced by applyTeamCost + getTeamMembers;
	// adapters satisfy CostTeamAccessor without changing cost package internals.
	org: {
		getTeamMembersById: (db, id) => getTeamMembers(db, { id }),
		incrementTeamMembersCost: (db, id, deltaMinor) => applyTeamCost(db, { id }, { deltaMinor }),
		resetTeamMembersCost: (db, id) => applyTeamCost(db, { id }, "reset"),
		resetAllTeamMembersCost: (db) => applyTeamCost(db, "all", "reset"),
	},
	work: {
		getTaskById: (exec: WriteExecutor, id: string) => work.get(exec, "task", id),
		incrementBetCost,
		createItem,
	},
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

// @lore AU20 Am3: `createCostOps` returns `CostOps & { _testHooks: CostTestHooks }`.
// Capture as `const` (not `CostOps`) so TypeScript sees the wider return type
// and `._ testHooks` is accessible without a cast.
const costOps = createCostOps(costDeps);

// ---------------------------------------------------------------------------
// Test-hook bridges (backward compat — same names integration tests import)
// NOT in the @hyperidle/cost barrel; only available from this bindings file.
// ---------------------------------------------------------------------------

/** Clear all dedup state. Integration tests call this in `beforeEach`. */
export function clearDeduplicationCache(): void {
	costOps._testHooks.clearDedup();
}

/** Count of sessions tracked in the dedup map. Integration tests use this to assert. */
export function getDedupCacheSize(): number {
	return costOps._testHooks.getDedupSize();
}

/** Drop a single session's dedup entry. Integration tests use this for manual cleanup. */
export function releaseSessionDedup(sessionId: string): void {
	costOps._testHooks.releaseDedup(sessionId);
}

/**
 * Subscribe the dedup releaser to the EventBus.
 * Integration tests call this to replicate the production boot wiring without
 * invoking `startCostSentinel` (which would also start a 15-min interval).
 */
export function registerCostCapDedupReleaser(eventBus: EventBus): () => void {
	return costOps._testHooks.installDedupReleaser(eventBus);
}

/** Force the sentinel state reset. Integration tests call this in `beforeEach`. */
export function clearCostSentinelCache(): void {
	costOps._testHooks.resetSentinelState();
}

// ---------------------------------------------------------------------------
// Production-wired functions (backward-compat names, new underlying methods)
// ---------------------------------------------------------------------------

/**
 * Production-wired gate check.
 * Returns `CostVerdict` (structurally identical to old `CostCapResult`).
 */
export function checkCostCap(
	db: HyperIdleDb,
	eventBus: EventBus,
	params: CostCheckParams,
): Promise<CostVerdict> {
	return costOps.check(db, eventBus, params);
}

/** Production-wired cost ledger write + cap check. */
export function recordCostAndCheck(
	db: HyperIdleDb,
	eventBus: EventBus,
	params: CostRecordParams,
): Promise<void> {
	return costOps.record(db, eventBus, params);
}

/** Production-wired factory cost read (delegates to `spend({level:"factory"})`). */
export function getFactoryCostActual(db: HyperIdleDb): Promise<number> {
	return costOps.spend(db, { level: "factory" });
}

/**
 * Production-wired cost reset.
 * Accepts `CostScope | string` (string = old team-reset shorthand: `{ level: "team", id }`)
 * for backward compatibility with existing callers that pass a bare teamId string.
 */
export function resetCosts(db: HyperIdleDb, params: CostScope | string): Promise<void> {
	const scope: CostScope = typeof params === "string" ? { level: "team", id: params } : params;
	return costOps.reset(db, scope);
}

/**
 * Production-wired sentinel start.
 *
 * @lore AU20 Am3: now also installs the dedup-releaser EventBus subscription
 * (folded into `startSentinel`). Server-factory no longer calls
 * `registerCostCapDedupReleaser(eventBus)` separately — this call covers both.
 */
export function startCostSentinel(db: HyperIdleDb, eventBus: EventBus): () => void {
	return costOps.startSentinel(db, eventBus);
}

/** Production-wired deterministic single-tick sentinel check. */
export function runCostSentinelCheck(
	db: HyperIdleDb,
	eventBus: EventBus,
): Promise<{ fired: true; emitted: readonly string[] }> {
	return costOps.runCostSentinelCheck(db, eventBus);
}
