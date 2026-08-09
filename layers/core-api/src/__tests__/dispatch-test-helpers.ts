import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import type { HyperIdleDb, Routine } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/event-bus";
import { getRoutine, provisionTeamRoutines } from "@hyperidle/routine";
import { fireRoutine } from "../services/routine-scheduler-bindings.js";

export async function fireStoredRoutine(
	db: HyperIdleDb,
	eventBus: EventBus,
	agentOrchestration: AgentOrchestrationPort,
	routineId: string,
	args?: { readonly betId: string },
) {
	const routine = await getRoutine(db, routineId);
	if (!routine) return { fired: false as const, reason: "routine not found" };
	return fireRoutine(db, eventBus, agentOrchestration, routine, { args });
}

export function fireGenericRoutine(
	db: HyperIdleDb,
	eventBus: EventBus,
	agentOrchestration: AgentOrchestrationPort,
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
	return fireRoutine(db, eventBus, agentOrchestration, routine, {});
}

export const seedTeamRoutines = provisionTeamRoutines;
