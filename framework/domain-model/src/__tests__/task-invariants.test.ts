/**
 * Pure invariant unit tests for taskInvariants — duplicate ids in doneWhen and
 * reasons, and the reason_state_mismatch check. Exact code equality on every
 * problem; never toContain.
 */

import { describe, expect, it } from "vitest";
import type { Task } from "../actions/task.js";
import { taskInvariants } from "../actions/task.js";

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: "t1",
		parentTaskId: null,
		teamId: "team-1",
		ownerAgentId: null,
		title: "Do the thing",
		description: null,
		doneWhen: [],
		reasons: [],
		state: "in_progress",
		dependencies: null,
		threadId: "thr-t1",
		notes: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		outcomeVerdict: null,
		outcomeSummary: null,
		outcomeRecordedAt: null,
		outcomeRecordedBy: null,
		tokensActualJson: null,
		sourceDocumentId: null,
		completedAt: null,
		position: 0,
		...overrides,
	};
}

describe("taskInvariants: doneWhen duplicate id", () => {
	it("reports done_when_duplicate_id when two lines share an id", () => {
		const line = { id: "dw-1", what: "Ships", by: "check" as const, state: "open" as const, how: null };
		const problems = taskInvariants(makeTask({ doneWhen: [line, { ...line }] }), null);
		expect(problems[0]?.code).toBe("done_when_duplicate_id");
	});

	it("no problem when all ids are unique", () => {
		const problems = taskInvariants(
			makeTask({
				doneWhen: [
					{ id: "dw-1", what: "Ships", by: "check", state: "open", how: null },
					{ id: "dw-2", what: "Reviewed", by: "review", state: "open", how: null },
				],
			}),
			null,
		);
		expect(problems.filter((p) => p.code === "done_when_duplicate_id")).toHaveLength(0);
	});
});

describe("taskInvariants: reasons duplicate id", () => {
	it("reports reasons_duplicate_id when two reasons share an id", () => {
		const reason = { id: "r-1", kind: "decision" as const, what: "Use Postgres", state: "made" as const, why: null };
		const problems = taskInvariants(makeTask({ reasons: [reason, { ...reason }] }), null);
		expect(problems[0]?.code).toBe("reasons_duplicate_id");
	});
});

describe("taskInvariants: reason_state_mismatch", () => {
	it("reports reason_state_mismatch when a decision reason carries an assumption state (corrupted JSON)", () => {
		// Cast bypasses TS — this simulates data parsed from corrupted JSON.
		const bad = makeTask({
			reasons: [{ id: "r-1", kind: "decision", what: "Use Postgres", state: "held", why: null }] as unknown as Task["reasons"],
		});
		const problems = taskInvariants(bad, null);
		expect(problems[0]?.code).toBe("reason_state_mismatch");
	});

	it("reports reason_state_mismatch when an assumption reason carries a decision state", () => {
		const bad = makeTask({
			reasons: [{ id: "r-1", kind: "assumption", what: "API stable", state: "made", why: null }] as unknown as Task["reasons"],
		});
		const problems = taskInvariants(bad, null);
		expect(problems[0]?.code).toBe("reason_state_mismatch");
	});

	it("no problem when a decision has a valid decision state", () => {
		const problems = taskInvariants(
			makeTask({ reasons: [{ id: "r-1", kind: "decision", what: "Use Postgres", state: "made", why: null }] }),
			null,
		);
		expect(problems.filter((p) => p.code === "reason_state_mismatch")).toHaveLength(0);
	});

	it("no problem when an assumption has a valid assumption state", () => {
		const problems = taskInvariants(
			makeTask({ reasons: [{ id: "r-1", kind: "assumption", what: "API stable", state: "held", why: null }] }),
			null,
		);
		expect(problems.filter((p) => p.code === "reason_state_mismatch")).toHaveLength(0);
	});
});
