import type { HyperIdleDb, Routine } from "@hyperidle/db";
import { getRoutine } from "@hyperidle/routine";
import type { EventBus } from "@hyperidle/shared";
import { dispatchOps } from "../services/dispatch-bindings.js";

export async function fireStoredRoutine(
	db: HyperIdleDb,
	eventBus: EventBus,
	routineId: string,
	args?: { readonly betId: string },
) {
	const routine = await getRoutine(db, routineId);
	if (!routine) return { fired: false as const, reason: "routine not found" };
	return dispatchOps.fireRoutine(db, eventBus, routine, { args });
}

export function fireGenericRoutine(
	db: HyperIdleDb,
	eventBus: EventBus,
	routine: Routine,
	runtimeDeps?: NonNullable<Parameters<typeof dispatchOps.fireRoutine>[3]>["runtimeDeps"],
) {
	return dispatchOps.fireRoutine(db, eventBus, routine, { runtimeDeps });
}

export const seedTeamRoutines = dispatchOps.provisionTeamRoutines;
export const startDispatchEngine = dispatchOps.start;
