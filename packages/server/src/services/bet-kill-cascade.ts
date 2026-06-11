import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";

/**
 * Cascade a bet kill downward to its tasks and sessions (AF12 AC3/AC6).
 *
 * Non-terminal tasks on the bet → killed (CAS-guarded `transitionTask`); active
 * sessions on those tasks → stopped (`state='stopped'`, `outcome='stopped'`).
 * Each cascade hop writes a synchronous `propagation_log` row with
 * `sourceEvent:'bet_killed'`, `status:'applied'`, labelled to the real target.
 *
 * @lore AF12 RED STUB: this is an intentionally-empty stub so the AC3/AC6 tests
 * compile and FAIL at runtime (red phase). The green phase (`/write-code`, T4)
 * implements the cascade per plans/AF12/architecture.md §4. Do NOT treat the
 * stub's empty return as the contract.
 */
export async function cascadeBetKill(
	_db: HyperIdleDb,
	_eventBus: EventBus,
	_betId: string,
): Promise<{ tasksKilled: string[]; sessionsStopped: string[] }> {
	throw new Error("cascadeBetKill not implemented (AF12 RED phase)");
}
