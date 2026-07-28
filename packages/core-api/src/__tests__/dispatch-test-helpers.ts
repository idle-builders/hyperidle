import type { HyperIdleDb, Routine } from "@hyperidle/db";
import type { DispatchConfig } from "@hyperidle/dispatch";
import { getRoutine } from "@hyperidle/routine";
import type { EventBus } from "@hyperidle/shared";
import { dispatchOps } from "../services/dispatch-bindings.js";
import {
	fireRoutine,
	registerBuiltinRoutineReactions,
} from "../services/routine-scheduler-bindings.js";

export async function fireStoredRoutine(
	db: HyperIdleDb,
	eventBus: EventBus,
	routineId: string,
	args?: { readonly betId: string },
) {
	const routine = await getRoutine(db, routineId);
	if (!routine) return { fired: false as const, reason: "routine not found" };
	return fireRoutine(db, eventBus, routine, { args });
}

export function fireGenericRoutine(
	db: HyperIdleDb,
	eventBus: EventBus,
	routine: Routine,
	/**
	 * @lore AU21 §9 Increment 4: `runtimeDeps` was always dead — the relocated
	 * `fireGenericRoutine` never consumed it (the original
	 * `fireGenericRoutineInternal` prefixed the param `_runtimeDeps`). Kept
	 * here, ignored, purely so existing call sites that still pass a
	 * runtime-deps-shaped object (`agent-work-intent-production.integration.test.ts`,
	 * `routine-scheduler.au15.integration.test.ts`) don't need editing.
	 */
	_runtimeDeps?: unknown,
) {
	return fireRoutine(db, eventBus, routine, {});
}

export const seedTeamRoutines = dispatchOps.provisionTeamRoutines;

/**
 * @lore AU21 §9 Increment 4: `dispatchOps.start` (dispatch's OWN lifecycle —
 * assistant-turn + task-queue) no longer wires any routine reaction at all.
 * This test helper's name ("the whole engine") means the FULL production
 * composition (`registerAgentLayerServices`'s equivalent minus the cron
 * scheduler, which none of this helper's callers exercise) — so it also
 * starts the relocated `bet_state_changed` → builtin-routine reaction
 * (`registerBuiltinRoutineReactions`, now core-api-side). Tests that want to
 * assert `dispatchOps` in ISOLATION sheds routine awareness call
 * `dispatchOps.start` directly instead of this helper (see
 * `routine-scheduler-relocation.integration.test.ts`'s "dispatchOps.start no
 * longer wires..." test).
 */
export async function startDispatchEngine(config: DispatchConfig): Promise<() => void> {
	const stopDispatch = await dispatchOps.start(config);
	const stopBuiltinReactions = registerBuiltinRoutineReactions(config.db, config.eventBus);
	return () => {
		stopBuiltinReactions();
		stopDispatch();
	};
}
