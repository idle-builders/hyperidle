/**
 * BA9d D11 — transition constraint filter integration tests.
 *
 * The constraint lives in `registerRoutineEventMatcher` (routine-scheduler.ts
 * ~line 730): after assembling the trigger event, routines with a
 * `transitionTo` constraint are only fired when the event's `transition.to`
 * matches. Routines with no constraint fire on every occurrence.
 *
 * Three cases proven here:
 *   1. task_state_changed with toState="done"  → fires  (constraint matches)
 *   2. task_state_changed with toState="in_progress" → does NOT fire  (mismatch)
 *   3. team_created (no transition field) → does NOT fire  (line 732 branch)
 *
 * Sanity-break: the constraint filter is the only gate between receiving the
 * event and calling requireRunnableAgent.  Removing the `transitionTo` check
 * causes cases 2 and 3 to flip from 0 calls to ≥1 call.
 *
 * Spy strategy: `requireRunnableAgent` is the first port called inside
 * `fireGenericRoutineInternal` after the constraint filter selects a routine.
 * Making it a vi.fn() that throws lets us detect a call without needing to
 * stub the full agent-run path. The throw is swallowed by the fire-and-forget
 * `.catch(() => {})` wrapper — the test process is never crashed.
 */
import { routines, teams, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { getAgentIdentity } from "@hyperidle/knowledge";
import { describe, vi } from "vitest";
import type { RoutineSchedulerPorts } from "../ports.js";
import { startRoutineScheduler } from "../routine-scheduler.js";

const NOW = "2026-07-28T00:00:00.000Z";

function unreachable(label: string): () => never {
	return () => {
		throw new Error(`unreachable in this transition-constraint test: ${label}`);
	};
}

/**
 * Ports for the transition-constraint tests. Most ports are never reached
 * because the scheduler poll never fires (pollIntervalMs: 999_999) and the
 * only event-path ports exercised are getTaskById (returns null so
 * assembleTriggerEvent falls through to generic) and requireRunnableAgent
 * (the spy). All others throw so a stray call fails fast.
 */
function makePorts(
	requireRunnableAgent: RoutineSchedulerPorts["requireRunnableAgent"],
): RoutineSchedulerPorts {
	return {
		getAgentIdentity,
		work: {
			getBetById: unreachable("work.getBetById"),
			// Returns undefined so assembleTriggerEvent falls through to generic subject
			// without crashing when a task_state_changed event carries taskId.
			getTaskById: () => Promise.resolve(undefined),
			getItemById: unreachable("work.getItemById"),
			getArtifactById: unreachable("work.getArtifactById"),
			createItem: unreachable("work.createItem"),
			findRetroItemByThreadIds: unreachable("work.findRetroItemByThreadIds"),
		},
		conversation: {
			getThreadIdsByHost: unreachable("conversation.getThreadIdsByHost"),
			insertThread: unreachable("conversation.insertThread"),
			findThreadById: unreachable("conversation.findThreadById"),
		},
		knowledge: {
			runAutoPromotionSweep: unreachable("knowledge.runAutoPromotionSweep"),
			runStaleSweep: unreachable("knowledge.runStaleSweep"),
			listRecentByLayers: unreachable("knowledge.listRecentByLayers"),
			recomputeAttentionForCandidates: unreachable("knowledge.recomputeAttentionForCandidates"),
			getItemById: unreachable("knowledge.getItemById"),
		},
		settings: { readServerConfig: unreachable("settings.readServerConfig") },
		workIntents: { enqueueWorkIntent: unreachable("workIntents.enqueueWorkIntent") },
		requireRunnableAgent,
	};
}

async function seedEventRoutineWithConstraint(
	db: import("@hyperidle/db").HyperIdleDb,
	id: string,
	eventType: string,
	triggerConfig: string,
): Promise<void> {
	const teamId = `${id}-team`;
	const ownerAgentId = `${id}-owner`;
	await db
		.insert(teams)
		.values({ id: teamId, name: "Constraint test team", phase: "build", createdAt: NOW });
	await db.insert(users).values({
		id: ownerAgentId,
		kind: "ai",
		name: "Constraint Owner",
		role: "builder",
		status: "active",
		teamId,
		createdAt: NOW,
	});
	await db.insert(routines).values({
		id,
		name: "Constraint event routine",
		state: "active",
		ownerAgentId,
		triggerType: "event",
		eventType,
		triggerConfig,
		active: true,
	});
}

describe("routine transition constraint filter", () => {
	test("task_state_changed with matching toState fires the routine", async ({ db }) => {
		await seedEventRoutineWithConstraint(
			db,
			"tcc-match",
			"task_state_changed",
			JSON.stringify({ transitionTo: "done" }),
		);

		const requireRunnableAgent = vi.fn().mockRejectedValue(new Error("spy: not proceeding"));
		const ports = makePorts(requireRunnableAgent);
		const eventBus = new EventBus();
		const scheduler = await startRoutineScheduler(db, eventBus, ports, {
			pollIntervalMs: 999_999,
			canProvision: true,
		});

		try {
			eventBus.emit({
				type: "task_state_changed",
				streamId: "stream-tcc-match",
				taskId: "task-tcc-match",
				fromState: "in_progress",
				toState: "done",
				timestamp: Date.now(),
			});

			// Allow the async chain (event handler → DB query → filter → fire) to settle.
			await new Promise((r) => setTimeout(r, 100));

			expect(requireRunnableAgent.mock.calls.length).toBe(1);
		} finally {
			scheduler.stop();
		}
	});

	test("task_state_changed with non-matching toState does not fire", async ({ db }) => {
		await seedEventRoutineWithConstraint(
			db,
			"tcc-nomatch",
			"task_state_changed",
			JSON.stringify({ transitionTo: "done" }),
		);

		const requireRunnableAgent = vi.fn().mockRejectedValue(new Error("spy: not proceeding"));
		const ports = makePorts(requireRunnableAgent);
		const eventBus = new EventBus();
		const scheduler = await startRoutineScheduler(db, eventBus, ports, {
			pollIntervalMs: 999_999,
			canProvision: true,
		});

		try {
			eventBus.emit({
				type: "task_state_changed",
				streamId: "stream-tcc-nomatch",
				taskId: "task-tcc-nomatch",
				fromState: "proposed",
				toState: "in_progress",
				timestamp: Date.now(),
			});

			await new Promise((r) => setTimeout(r, 100));

			expect(requireRunnableAgent.mock.calls.length).toBe(0);
		} finally {
			scheduler.stop();
		}
	});

	test("event with no transition field does not fire a constrained routine", async ({ db }) => {
		// team_created carries no fromState/toState — assembleTriggerEvent will NOT
		// set triggerEvent.transition, so line 732 (`if (!triggerEvent.transition) return false`)
		// causes the constrained routine to be filtered out.
		await seedEventRoutineWithConstraint(
			db,
			"tcc-notransition",
			"team_created",
			JSON.stringify({ transitionTo: "done" }),
		);

		const requireRunnableAgent = vi.fn().mockRejectedValue(new Error("spy: not proceeding"));
		const ports = makePorts(requireRunnableAgent);
		const eventBus = new EventBus();
		const scheduler = await startRoutineScheduler(db, eventBus, ports, {
			pollIntervalMs: 999_999,
			canProvision: true,
		});

		try {
			eventBus.emit({
				type: "team_created",
				streamId: "stream-tcc-notransition",
				teamId: "tcc-notransition-team",
				teamMembersId: "tcc-notransition-members",
				functions: [],
				agentIds: [],
				at: NOW,
			});

			await new Promise((r) => setTimeout(r, 100));

			expect(requireRunnableAgent.mock.calls.length).toBe(0);
		} finally {
			scheduler.stop();
		}
	});
});
