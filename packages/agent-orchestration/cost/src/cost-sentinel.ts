import * as crypto from "node:crypto";
import type { HyperIdleDb } from "@hyperidle/db";
import type { CostCapBreachedEvent, CostCapWarningEvent, EventBus } from "@hyperidle/shared";
import { getFactoryCostActual } from "./cost-cap.js";
import type { CostDeps } from "./ports.js";

/**
 * @lore AU19 Increment 3g: moved here from
 * `packages/server/src/services/cost-sentinel.ts` (behavior-preserving
 * move). `settings` (`readServerConfig`/`updateServerConfig`) became an
 * injected DI port (Mechanism C, `ports.ts`).
 *
 * @lore AU20 Am3: `testResetRequested` flag moved from module-level into a
 * `CostSentinelState` parameter — eliminates the module-level singleton,
 * making `createCostOps` instances fully independent. `CostSentinelLevel`,
 * `COST_SENTINEL_INTERVAL_MS`, `COST_WARNING_RATIO`, and `clearCostSentinelCache`
 * are removed from the barrel; they are package-internal constants or
 * accessed via `_testHooks.resetSentinelState`.
 *
 * Cost sentinel level states. Persisted as `server_config.internal.costSentinelLastLevel`
 * and checked on every tick to dedupe warning/breach emissions.
 *
 * @lore G4 cost sentinel level-based dedupe: we track the current cost
 * level as persistent state (ok | warning | breach) and only emit when
 * the level CHANGES. Earlier implementations deduped by (cap, actual)
 * pairs in an in-memory Set, but that leaked unbounded strings.
 *
 * @lore AD8c: extracted from builtin-routines.ts. Cost sentinel is now
 * application code registered in bootstrapAppRuntime, not a routine row.
 *
 * @lore AU18: re-backed off `factorySettings` — sole reader/writer of both
 * the cap (`server_config.cost.capMinor`, via `readServerConfig`) and the
 * total (`getFactoryCostActual`, a live function call — never a table read).
 * The dedup level itself moved to `server_config.internal.costSentinelLastLevel`.
 */

/** Package-internal constants (not exported from barrel). */
const COST_SENTINEL_INTERVAL_MS = 900_000; // 15 minutes
// @lore AD8c: interval is in milliseconds for setInterval.
const COST_WARNING_RATIO = 0.8;

/**
 * Mutable sentinel state, closure-local per `createCostOps` instance.
 * `testResetRequested` forces the next sentinel tick to treat persisted level
 * as missing, ensuring deterministic test ordering.
 *
 * @lore AU20 Am3: was module-level `let testResetRequested = false`.
 */
export interface CostSentinelState {
	testResetRequested: boolean;
}

/** Create a fresh sentinel state. Call once per `createCostOps` closure. */
export function createSentinelState(): CostSentinelState {
	return { testResetRequested: false };
}

async function readStoredLevel(
	deps: CostDeps,
	db: HyperIdleDb,
	state: CostSentinelState,
): Promise<"ok" | "warning" | "breach" | null> {
	if (state.testResetRequested) return null;
	const { internal } = await deps.settings.readServerConfig(db);
	return internal.costSentinelLastLevel;
}

async function writeStoredLevel(
	deps: CostDeps,
	db: HyperIdleDb,
	level: "ok" | "warning" | "breach",
	state: CostSentinelState,
): Promise<void> {
	await deps.settings.updateServerConfig(db, { internal: { costSentinelLastLevel: level } });
	// After any real write, the test-reset flag is consumed.
	state.testResetRequested = false;
}

function classifyLevel(ratio: number): "ok" | "warning" | "breach" {
	if (ratio >= 1) return "breach";
	if (ratio >= COST_WARNING_RATIO) return "warning";
	return "ok";
}

/**
 * Single tick of the cost sentinel check. Reads cap from
 * `server_config.cost.capMinor` and the live total via `getFactoryCostActual`,
 * classifies the spend ratio, and emits `cost_cap_warning` or
 * `cost_cap_breached` only on level transitions.
 *
 * Returns `{ fired: true, emitted: [] }` when the cap is non-positive
 * (graceful no-op — defensive; the schema default is 20000, always positive).
 */
export async function runCostSentinelCheck(
	deps: CostDeps,
	db: HyperIdleDb,
	eventBus: EventBus,
	state: CostSentinelState,
): Promise<{ fired: true; emitted: readonly string[] }> {
	const { cost } = await deps.settings.readServerConfig(db);
	const cap = cost.capMinor;
	const actual = await getFactoryCostActual(deps, db);
	if (!Number.isFinite(cap) || cap <= 0) {
		return { fired: true, emitted: [] };
	}

	const ratio = actual / cap;
	const currentLevel = classifyLevel(ratio);
	const previousLevel = (await readStoredLevel(deps, db, state)) ?? "ok";
	const emitted: string[] = [];
	const timestamp = Date.now();

	// Only emit when the level transitions.
	if (currentLevel !== previousLevel) {
		if (currentLevel === "breach") {
			const evt: CostCapBreachedEvent = {
				type: "cost_cap_breached",
				streamId: crypto.randomUUID(),
				level: "hard",
				capLevel: "factory",
				entityId: "factory",
				spend: actual,
				cap,
				timestamp,
			};
			eventBus.emit(evt);
			emitted.push("cost_cap_breached");
		} else if (currentLevel === "warning") {
			const evt: CostCapWarningEvent = {
				type: "cost_cap_warning",
				streamId: crypto.randomUUID(),
				level: "warning",
				capLevel: "factory",
				entityId: "factory",
				spend: actual,
				cap,
				timestamp,
			};
			eventBus.emit(evt);
			emitted.push("cost_cap_warning");
		}
		// Transitioning back to "ok" resets state silently — no event
		// type currently exists for "cost recovered".
	}

	// Always persist the latest level so a reset back to ok is observable
	// on the next transition.
	if (currentLevel !== previousLevel || state.testResetRequested) {
		await writeStoredLevel(deps, db, currentLevel, state);
	}

	return { fired: true, emitted };
}

/**
 * Start the cost sentinel on a 15-minute interval.
 * Returns a cleanup function that clears the interval.
 *
 * @lore AD8c: the interval resets on every server restart — worst case is a
 * 15-minute gap in monitoring, which equals the existing check interval.
 *
 * @lore AU20 Am3: `startSentinel` in service.ts wraps this AND installs the
 * dedup releaser (`installDedupReleaser`) in a single call, folding what was
 * previously two separate boot-time disposer registrations into one.
 */
export function startCostSentinel(
	deps: CostDeps,
	db: HyperIdleDb,
	eventBus: EventBus,
	state: CostSentinelState,
): () => void {
	const handle = setInterval(() => {
		void runCostSentinelCheck(deps, db, eventBus, state);
	}, COST_SENTINEL_INTERVAL_MS);

	return (): void => {
		clearInterval(handle);
	};
}
