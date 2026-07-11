import * as crypto from "node:crypto";
import { factorySettings, type HyperIdleDb } from "@hyperidle/db";
import type { CostCapBreachedEvent, CostCapWarningEvent, EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";

/**
 * Cost sentinel level states. Stored in `factory_settings` under
 * `cost_sentinel_last_level` and checked on every tick to dedupe
 * warning/breach emissions.
 *
 * @lore G4 cost sentinel level-based dedupe: we track the current cost
 * level as persistent state (ok | warning | breach) and only emit when
 * the level CHANGES. Earlier implementations deduped by (cap, actual)
 * pairs in an in-memory Set, but that leaked unbounded strings (every
 * distinct actual value lived forever) and conflated "cap raised" with
 * "we already warned about this spend". Level transitions map cleanly
 * to what operators care about: a single event per change of state. The
 * cache-clear helper remains in-memory only (clears the module-level
 * test sentinel flag); real state lives in `factory_settings`.
 *
 * @lore AD8c: extracted from builtin-routines.ts. Cost sentinel is now
 * application code registered in bootstrapAppRuntime, not a routine row.
 * This prevents operators from disabling cost monitoring by flipping the
 * `active` flag on a routine row.
 */
export type CostSentinelLevel = "ok" | "warning" | "breach";

export const COST_SENTINEL_INTERVAL_MS = 900_000; // 15 minutes
// @lore AD8c: interval is in milliseconds for setInterval (was COST_SENTINEL_INTERVAL_SECONDS=900
// in builtin-routines.ts where it was only used in the seed's triggerConfig JSON, not for
// actual timing). setInterval requires milliseconds.

export const COST_WARNING_RATIO = 0.8;

const COST_SENTINEL_STATE_KEY = "cost_sentinel_last_level";

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
	const [row] = await db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, COST_SENTINEL_STATE_KEY))
		.limit(1);
	const value = row?.value;
	if (value === "ok" || value === "warning" || value === "breach") return value;
	return null;
}

async function writeStoredLevel(db: HyperIdleDb, level: CostSentinelLevel): Promise<void> {
	const isoNow = new Date().toISOString();
	const [existing] = await db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, COST_SENTINEL_STATE_KEY))
		.limit(1);
	if (existing) {
		await db
			.update(factorySettings)
			.set({ value: level, updatedAt: isoNow })
			.where(eq(factorySettings.key, COST_SENTINEL_STATE_KEY));
	} else {
		await db
			.insert(factorySettings)
			.values({ key: COST_SENTINEL_STATE_KEY, value: level, updatedAt: isoNow });
	}
	// After any real write, the test-reset flag is consumed.
	testResetRequested = false;
}

function classifyLevel(ratio: number): CostSentinelLevel {
	if (ratio >= 1) return "breach";
	if (ratio >= COST_WARNING_RATIO) return "warning";
	return "ok";
}

/**
 * Single tick of the cost sentinel check. Reads cap/actual from
 * `factory_settings`, classifies the spend ratio, and emits
 * `cost_cap_warning` or `cost_cap_breached` only on level transitions.
 *
 * Returns `{ fired: true, emitted: [] }` when no cap is configured
 * (graceful no-op).
 */
export async function runCostSentinelCheck(
	db: HyperIdleDb,
	eventBus: EventBus,
): Promise<{ fired: true; emitted: readonly string[] }> {
	const [capRow] = await db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, "cost_cap"))
		.limit(1);
	const [actualRow] = await db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, "cost_actual"))
		.limit(1);

	if (!capRow) {
		return { fired: true, emitted: [] };
	}
	const cap = Number.parseInt(capRow.value, 10);
	const actual = Number.parseInt(actualRow?.value ?? "0", 10);
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
