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
	 * BA6: `hold` is the single waiting state, entered when a task is created
	 * or edited with an unfinished dependency. A task is born `proposed`, so
	 * without this edge nothing can ever enter the chain the watcher already
	 * carries onward — see `.pipeline/work/BA6/plan.md` "How it works".
	 */
	it("allows proposed -> hold (BA6: the entrance to the dependency-wait chain)", () => {
		expect(canTransitionTaskState("proposed", "hold")).toBe(true);
	});
});
// TaskInvalidTransitionError is tested in @hyperidle/work (layers/core-api/work/src/__tests__/errors.test.ts)
