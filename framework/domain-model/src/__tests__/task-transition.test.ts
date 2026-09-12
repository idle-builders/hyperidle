import { describe, expect, it } from "vitest";
import { canTransitionTaskState, TASK_STATE_TRANSITIONS, TASK_STATES } from "../index.js";

describe("task transition contract", () => {
	it("represents every task state in the canonical grammar", () => {
		expect(Object.keys(TASK_STATE_TRANSITIONS).sort()).toEqual([...TASK_STATES].sort());
	});

	it("pins valid and invalid edges", () => {
		expect(canTransitionTaskState("proposed", "accepted")).toBe(true);
		expect(canTransitionTaskState("in_progress", "blocked")).toBe(true);
		expect(canTransitionTaskState("review", "done")).toBe(true);
		expect(canTransitionTaskState("done", "accepted")).toBe(false);
		expect(canTransitionTaskState("killed", "proposed")).toBe(false);
	});

	/**
	 * BB1: `review` must be reachable from every non-terminal state so the
	 * parent auto-completion cascade can advance a container task that was
	 * never itself worked (e.g. `proposed` or `accepted`). Without these edges
	 * the cascade throws InvalidTransitionError and silently dies.
	 */
	it("allows review from every non-terminal state (BB1 parent auto-completion)", () => {
		const nonTerminal = ["proposed", "accepted", "hold", "in_progress", "blocked"] as const;
		for (const state of nonTerminal) {
			expect(canTransitionTaskState(state, "review")).toBe(true);
		}
	});

	it("does not allow review from terminal states", () => {
		expect(canTransitionTaskState("done", "review")).toBe(false);
		expect(canTransitionTaskState("killed", "review")).toBe(false);
	});

	/**
	 * BB1: `done` must also be reachable from every non-terminal state.
	 * When `task.needsReview = false`, the parent auto-completion cascade
	 * transitions the parent directly to `done`, bypassing `review`. Without
	 * these edges, a container in `accepted` with needsReview=false had no
	 * legal path to `done` and the cascade threw InvalidTransitionError.
	 */
	it("allows done from every non-terminal state (BB1 parent auto-completion)", () => {
		const nonTerminal = ["proposed", "accepted", "hold", "in_progress", "blocked"] as const;
		for (const state of nonTerminal) {
			expect(canTransitionTaskState(state, "done")).toBe(true);
		}
	});

	/**
	 * `hold` is the single waiting state, entered when a task is created
	 * or edited with an unfinished dependency. A task is born `proposed`, so
	 * without this edge nothing can ever enter the chain the watcher already
	 * carries onward.
	 */
	it("allows proposed -> hold (the entrance to the dependency-wait chain)", () => {
		expect(canTransitionTaskState("proposed", "hold")).toBe(true);
	});

	/**
	 * The pick-up guard in `task-state-machine.ts` exempts `blocked` from
	 * the "must come from accepted" pick-up check, and that exemption is only
	 * sound because `blocked` is reachable from `in_progress` alone — so a task
	 * in `blocked` was genuinely picked up once. This derives the set of
	 * sources into `blocked` straight from the table (no copy of it here) so
	 * that adding any other edge into `blocked` fails this test — a signal to
	 * revisit the pick-up guard's `blocked` exemption before it walks a
	 * parked task past pick-up undetected.
	 */
	it("blocked is reachable only from in_progress (the pick-up guard depends on this)", () => {
		const sourcesIntoBlocked = Object.entries(TASK_STATE_TRANSITIONS)
			.filter(([, targets]) => targets.includes("blocked"))
			.map(([from]) => from);
		expect(sourcesIntoBlocked).toEqual(["in_progress"]);
	});
});
// TaskInvalidTransitionError is tested in @hyperidle/work (layers/core-api/work/src/__tests__/errors.test.ts)
