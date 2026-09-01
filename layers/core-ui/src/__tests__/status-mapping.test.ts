import {
	KNOWLEDGE_STATUSES,
	type KnowledgeStatus,
	TASK_STATES,
	type TaskState,
} from "@hyperidle/domain-model";
import { describe, expect, it } from "vitest";
import { knowledgeStatusToStatus, type Status, taskStateToStatus } from "../ds";

// @lore BB1: betStatusToStatus tests removed — WorkTeam still exports betStatusToStatus
// for WorkTeam.tsx consumption until that page is updated to the task primitive.

/** All legal presentation Status values, used to assert exhaustive coverage. */
const VALID_STATUSES: readonly Status[] = [
	"healthy",
	"behind",
	"blocked",
	"paused",
	"done",
	"error",
];

describe("taskStateToStatus", () => {
	it("maps proposed to paused", () => {
		expect(taskStateToStatus("proposed")).toBe("paused" satisfies Status);
	});

	it("maps accepted to healthy", () => {
		expect(taskStateToStatus("accepted")).toBe("healthy" satisfies Status);
	});

	it("maps hold to paused", () => {
		expect(taskStateToStatus("hold")).toBe("paused" satisfies Status);
	});

	it("maps in_progress to healthy", () => {
		expect(taskStateToStatus("in_progress")).toBe("healthy" satisfies Status);
	});

	it("maps blocked to blocked", () => {
		expect(taskStateToStatus("blocked")).toBe("blocked" satisfies Status);
	});

	it("maps review to behind", () => {
		expect(taskStateToStatus("review")).toBe("behind" satisfies Status);
	});

	it("maps done to done", () => {
		expect(taskStateToStatus("done")).toBe("done" satisfies Status);
	});

	it("maps killed to error", () => {
		expect(taskStateToStatus("killed")).toBe("error" satisfies Status);
	});

	it("covers all TaskState values", () => {
		const allStates: TaskState[] = [
			"proposed",
			"accepted",
			"hold",
			"in_progress",
			"blocked",
			"review",
			"done",
			"killed",
		];
		for (const state of allStates) {
			const result = taskStateToStatus(state);
			expect(typeof result).toBe("string");
		}
	});

	it("exhaustively maps every TASK_STATES value to a valid Status", () => {
		// I4 S3/S6: runtime-iterable TASK_STATES ensures the type and runtime
		// coverage cannot drift.
		expect(TASK_STATES).toHaveLength(8);
		for (const state of TASK_STATES) {
			const result = taskStateToStatus(state);
			expect(VALID_STATUSES).toContain(result);
		}
	});
});

describe("knowledgeStatusToStatus", () => {
	it("maps captured to paused", () => {
		expect(knowledgeStatusToStatus("captured")).toBe("paused" satisfies Status);
	});

	it("maps provisional to behind", () => {
		expect(knowledgeStatusToStatus("provisional")).toBe("behind" satisfies Status);
	});

	it("maps validated to healthy", () => {
		expect(knowledgeStatusToStatus("validated")).toBe("healthy" satisfies Status);
	});

	it("maps active to healthy", () => {
		expect(knowledgeStatusToStatus("active")).toBe("healthy" satisfies Status);
	});

	it("maps stale to error", () => {
		expect(knowledgeStatusToStatus("stale")).toBe("error" satisfies Status);
	});

	it("maps archived to done", () => {
		expect(knowledgeStatusToStatus("archived")).toBe("done" satisfies Status);
	});

	it("covers all KnowledgeStatus values", () => {
		const allStatuses: KnowledgeStatus[] = [
			"captured",
			"provisional",
			"validated",
			"active",
			"stale",
			"archived",
			"needs_human",
		];
		for (const ks of allStatuses) {
			const result = knowledgeStatusToStatus(ks);
			expect(typeof result).toBe("string");
		}
	});

	it("maps needs_human to a non-healthy attention-required Status", () => {
		// I4 S2: `needs_human` must map to a value that surfaces the
		// action-required state — explicitly not `healthy` (would mislead the
		// founder into thinking the item needs no input).
		const result = knowledgeStatusToStatus("needs_human");
		expect(result).not.toBe("healthy");
		expect(VALID_STATUSES).toContain(result);
	});

	it("exhaustively maps every KNOWLEDGE_STATUSES value to a valid Status", () => {
		// I4 S2/S6: runtime iteration over the shared KNOWLEDGE_STATUSES array
		// — catches additions to the union.
		expect(KNOWLEDGE_STATUSES).toHaveLength(7);
		for (const ks of KNOWLEDGE_STATUSES) {
			const result = knowledgeStatusToStatus(ks);
			expect(VALID_STATUSES).toContain(result);
		}
	});
});
