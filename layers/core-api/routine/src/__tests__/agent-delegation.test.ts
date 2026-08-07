/**
 * AU21 §9 Increment 8 (RED) — architecture.md §6 Decision F1: the
 * `routine_delegate` surface of `AgentSelectionService.selectAgent` is a
 * `routine`-owned "who gets assigned" decision (a skill-based fallback scan
 * over `userSkills`, excluding the routine's owner), materially different
 * from `work`'s team-membership candidate source (`agent-assignment.ts`,
 * this wave's sibling module).
 *
 * `resolveRoutineRunRequest` (`routine-service.ts`) already injects this
 * decision as a Mechanism-C port (`RoutineRunResolverDeps.agentSelection`) —
 * that shape is UNCHANGED by this wave (`routine-run-resolver.integration.test.ts`
 * fakes it and stays green). What changes is what backs the algorithm: today
 * `agent-selection/src/service.ts`'s `selectRoutineDelegate` lives in the
 * standalone `agent-selection` Service; this module is its mechanical
 * relocation into `routine` itself as a plain function, called by the real
 * composition-root wiring (`routine-scheduler-bindings.ts`) instead of
 * `@hyperidle/agent-selection`.
 *
 * The `isAtCapacity` half of the decision is NOT this module's concern — per
 * Decision F1 it folds into `run-orchestration`'s existing provision-time
 * concurrency check (`concurrency.integration.test.ts`, this wave's other
 * sibling module) and is injected here exactly like `resolveRoutineRunRequest`
 * already injects it (a cross-Service capacity read, still a legitimate
 * Mechanism-C port — only the wiring TARGET changes, not the shape).
 *
 * Currently RED: `../agent-delegation.js` does not exist yet — this import
 * fails to resolve, so every test below fails at collection/import time.
 */

import { describe, expect, test } from "vitest";
import { selectRoutineDelegate } from "../agent-delegation.js";

function fakeDeps(options: {
	readonly skilledAgentIds: readonly string[];
	readonly atCapacityAgentIds?: readonly string[];
}) {
	const atCapacity = new Set(options.atCapacityAgentIds ?? []);
	return {
		listAgentIdsBySkill: async (): Promise<readonly string[]> => options.skilledAgentIds,
		isAtCapacity: async (_db: unknown, agentId: string): Promise<boolean> =>
			atCapacity.has(agentId),
	};
}

describe("selectRoutineDelegate — routine's own skill-based delegate scan (Decision F1 fold)", () => {
	test("returns the first skilled candidate not at capacity, excluding the routine owner", async () => {
		const deps = fakeDeps({ skilledAgentIds: ["owner-1", "delegate-1", "delegate-2"] });

		expect(
			await selectRoutineDelegate(undefined, deps, {
				skillId: "skill-x",
				excludeAgentId: "owner-1",
			}),
		).toEqual({ agentId: "delegate-1" });
	});

	test("skips a skilled candidate that is itself at capacity", async () => {
		const deps = fakeDeps({
			skilledAgentIds: ["owner-1", "delegate-1", "delegate-2"],
			atCapacityAgentIds: ["delegate-1"],
		});

		expect(
			await selectRoutineDelegate(undefined, deps, {
				skillId: "skill-x",
				excludeAgentId: "owner-1",
			}),
		).toEqual({ agentId: "delegate-2" });
	});

	test("resolves to null when every candidate is excluded or at capacity", async () => {
		const deps = fakeDeps({
			skilledAgentIds: ["owner-1", "delegate-1"],
			atCapacityAgentIds: ["delegate-1"],
		});

		expect(
			await selectRoutineDelegate(undefined, deps, {
				skillId: "skill-x",
				excludeAgentId: "owner-1",
			}),
		).toEqual({ agentId: null });
	});

	test("resolves to null when no candidate has the skill", async () => {
		const deps = fakeDeps({ skilledAgentIds: [] });

		expect(
			await selectRoutineDelegate(undefined, deps, {
				skillId: "skill-missing",
				excludeAgentId: "owner-1",
			}),
		).toEqual({ agentId: null });
	});
});
