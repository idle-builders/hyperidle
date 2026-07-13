import * as crypto from "node:crypto";
import { readServerConfig, updateServerConfig } from "@hyperidle/core-app";
import type { HyperIdleDb } from "@hyperidle/db";
import type { CostCapBreachedEvent, CostCapWarningEvent, EventBus } from "@hyperidle/shared";
import { getFactoryCostActual } from "./cost-cap.js";

/**
 * Cost sentinel level states. Persisted as `server_config.internal.costSentinelLastLevel`
 * and checked on every tick to dedupe warning/breach emissions.
 *
 * @lore G4 cost sentinel level-based dedupe: we track the current cost
 * level as persistent state (ok | warning | breach) and only emit when
 * the level CHANGES. Earlier implementations deduped by (cap, actual)
 * pairs in an in-memory Set, but that leaked unbounded strings (every
 * distinct actual value lived forever) and conflated "cap raised" with
 * "we already warned about this spend". Level transitions map cleanly
 * to what operators care about: a single event per change of state. The
 * cache-clear helper remains in-memory only (clears the module-level
 * test sentinel flag); real state lives in `server_config`.
 *
 * @lore AD8c: extracted from builtin-routines.ts. Cost sentinel is now
 * application code registered in bootstrapAppRuntime, not a routine row.
 * This prevents operators from disabling cost monitoring by flipping the
 * `active` flag on a routine row.
 *
 * @lore AU18: re-backed off `factorySettings` — sole reader/writer of both
 * the cap (`server_config.cost.capMinor`, via `readServerConfig`) and the
 * total (`getFactoryCostActual`, a live function call — never a table read).
 * The dedup level itself moved to `server_config.internal.costSentinelLastLevel`,
 * sole reader/writer here.
 */
export type CostSentinelLevel = "ok" | "warning" | "breach";

export const COST_SENTINEL_INTERVAL_MS = 900_000; // 15 minutes
// @lore AD8c: interval is in milliseconds for setInterval (was COST_SENTINEL_INTERVAL_SECONDS=900
// in builtin-routines.ts where it was only used in the seed's triggerConfig JSON, not for
// actual timing). setInterval requires milliseconds.

export const COST_WARNING_RATIO = 0.8;

/**
 * In-memory flag used by tests to force a reset of the persisted level
 * state between test cases. Tests call `clearCostSentinelCache` before
 * asserting — the next sentinel tick treats the stored level as if it
 * were missing, ensuring deterministic test ordering.
 */
let testResetRequested = false;

export function clearCostSentinelCache(): void {
	testResetRequested = true;
}

async function readStoredLevel(db: HyperIdleDb): Promise<CostSentinelLevel | null> {
	if (testResetRequested) return null;
	const { internal } = await readServerConfig(db);
	return internal.costSentinelLastLevel;
}

async function writeStoredLevel(db: HyperIdleDb, level: CostSentinelLevel): Promise<void> {
	await updateServerConfig(db, { internal: { costSentinelLastLevel: level } });
	// After any real write, the test-reset flag is consumed.
	testResetRequested = false;
}

function classifyLevel(ratio: number): CostSentinelLevel {
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
	db: HyperIdleDb,
	eventBus: EventBus,
): Promise<{ fired: true; emitted: readonly string[] }> {
	const { cost } = await readServerConfig(db);
	const cap = cost.capMinor;
	const actual = await getFactoryCostActual(db);
	if (!Number.isFinite(cap) || cap <= 0) {
		return { fired: true, emitted: [] };
	}

	const ratio = actual / cap;
	const currentLevel = classifyLevel(ratio);
	const previousLevel = (await readStoredLevel(db)) ?? "ok";
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
	if (currentLevel !== previousLevel || testResetRequested) {
		await writeStoredLevel(db, currentLevel);
	}

	return { fired: true, emitted };
}

/**
 * Start the cost sentinel on a 15-minute interval.
 * Returns a cleanup function that clears the interval.
 *
 * Called by bootstrapAppRuntime so the sentinel runs unconditionally as
 * application code rather than via a routine row that operators could disable.
 *
 * @lore AD8c: the interval resets on every server restart — worst case is a
 * 15-minute gap in monitoring, which equals the existing check interval. Cost
 * monitoring is best-effort alerting, not transactional. If persistence of
 * last-run time across restarts is needed, migrate to a BullMQ repeatable job
 * (see architecture plan Phase 3, Alternative B). Do not add that complexity
 * until the requirement is concrete.
 */
export function startCostSentinel(db: HyperIdleDb, eventBus: EventBus): () => void {
	const handle = setInterval(() => {
		void runCostSentinelCheck(db, eventBus);
	}, COST_SENTINEL_INTERVAL_MS);

	return (): void => {
		clearInterval(handle);
	};
}
