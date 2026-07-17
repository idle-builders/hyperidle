/**
 * `cost` Service — the bound-ops factory.
 *
 * @lore AU19 Increment 3g: `createCostOps` closes over the
 * `users`/`org`/`work`/`settings` ports ONCE, at the composition root, and
 * returns bound functions whose signatures match what every downstream caller
 * already expects — a mechanical wiring swap, zero behavior change.
 *
 * @lore AU20 Am3: API collapse — 25 barrel exports → 8. The new `CostOps`
 * has 6 general methods (`check`, `record`, `spend`, `reset`, `startSentinel`,
 * `runCostSentinelCheck`); `CostScope` drives both `spend` and `reset`; dedup
 * + sentinel state are closure-local (eliminated module-level singletons).
 *
 * `_testHooks` gives `cost-bindings.ts` access to the closure state so it can
 * bridge the old test-helper names (`clearDeduplicationCache`, `getDedupCacheSize`,
 * `releaseSessionDedup`, `registerCostCapDedupReleaser`, `clearCostSentinelCache`)
 * without re-exporting them from the `@hyperidle/cost` barrel.
 *
 * `startSentinel` folds in the dedup-releaser EventBus subscription (was
 * a separate `registerCostCapDedupReleaser(eventBus)` call at boot). Server-
 * factory disposer count: 15 → 14.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import {
	type CostDedupState,
	checkCostCap,
	clearDedupState,
	createDedupState,
	getDedupStateSize,
	installDedupReleaser,
	recordCostAndCheck,
	releaseFromDedupState,
	resetCosts,
	spend as spendFn,
} from "./cost-cap.js";
import {
	createSentinelState,
	runCostSentinelCheck as runSentinelCheckFn,
	startCostSentinel,
} from "./cost-sentinel.js";
import type {
	CostCheckParams,
	CostDeps,
	CostRecordParams,
	CostScope,
	CostVerdict,
} from "./ports.js";

/** The deps-free surface this Service's downstream callers expect. */
export interface CostOps {
	/** Gate check — returns `CostVerdict.allowed` (replaces `checkCostCap`). */
	check(db: HyperIdleDb, eventBus: EventBus, params: CostCheckParams): Promise<CostVerdict>;
	/** Record cost + emit warnings/breaches (replaces `recordCostAndCheck`). */
	record(db: HyperIdleDb, eventBus: EventBus, params: CostRecordParams): Promise<void>;
	/** Read current spend for a scope (replaces `getFactoryCostActual` for factory level). */
	spend(db: HyperIdleDb, scope: CostScope): Promise<number>;
	/** Reset spend counters for a scope (replaces `resetCosts`). */
	reset(db: HyperIdleDb, scope: CostScope): Promise<void>;
	/**
	 * Start the cost sentinel timer AND install the session-end dedup releaser.
	 * Returns a single cleanup function for both (replaces separate
	 * `startCostSentinel` + `registerCostCapDedupReleaser` calls).
	 */
	startSentinel(db: HyperIdleDb, eventBus: EventBus): () => void;
	/** Deterministic single-tick sentinel entry point (testability + routine calls). */
	runCostSentinelCheck(
		db: HyperIdleDb,
		eventBus: EventBus,
	): Promise<{ fired: true; emitted: readonly string[] }>;
}

/**
 * Test-only hooks for closure-local state.
 * NOT in the public `CostOps` interface; available via `createCostOps(deps)._testHooks`.
 * `cost-bindings.ts` bridges these under the old flat names (backward compat for tests).
 */
export interface CostTestHooks {
	getDedupSize(): number;
	releaseDedup(sessionId: string): void;
	clearDedup(): void;
	resetSentinelState(): void;
	installDedupReleaser(eventBus: EventBus): () => void;
}

/**
 * Bind this Service's DB-touching functions to a single `CostDeps` instance.
 *
 * Returns `CostOps & { readonly _testHooks: CostTestHooks }`.
 * The wider return type is intentional: callers that need test hooks can access
 * them without a cast; the `CostOps` interface stays minimal for production use.
 */
export function createCostOps(deps: CostDeps): CostOps & { readonly _testHooks: CostTestHooks } {
	const dedupState: CostDedupState = createDedupState();
	const sentinelState = createSentinelState();

	const ops: CostOps = {
		check: (db, eventBus, params) => checkCostCap(deps, db, eventBus, params, dedupState),
		record: (db, eventBus, params) => recordCostAndCheck(deps, db, eventBus, params, dedupState),
		spend: (db, scope) => spendFn(deps, db, scope),
		reset: (db, scope) => resetCosts(deps, db, scope, dedupState),
		startSentinel: (db, eventBus) => {
			// @lore AU20 Am3: folds `registerCostCapDedupReleaser` into `startSentinel`.
			// One call at boot (server-factory.ts) instead of two. Disposer count 15→14.
			const offDedup = installDedupReleaser(dedupState, eventBus);
			const offSentinel = startCostSentinel(deps, db, eventBus, sentinelState);
			return (): void => {
				offDedup();
				offSentinel();
			};
		},
		runCostSentinelCheck: (db, eventBus) => runSentinelCheckFn(deps, db, eventBus, sentinelState),
	};

	const TestHooks: CostTestHooks = {
		getDedupSize: () => getDedupStateSize(dedupState),
		releaseDedup: (sessionId) => releaseFromDedupState(dedupState, sessionId),
		clearDedup: () => clearDedupState(dedupState),
		resetSentinelState: () => {
			sentinelState.testResetRequested = true;
		},
		installDedupReleaser: (eventBus) => installDedupReleaser(dedupState, eventBus),
	};

	return { ...ops, _testHooks: TestHooks };
}
