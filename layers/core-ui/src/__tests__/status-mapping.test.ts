import {
	DOCUMENT_STATUSES,
	type DocumentStatus,
	TASK_STATES,
	type TaskState,
} from "@hyperidle/domain-model";
import { describe, expect, it } from "vitest";
import { documentStatusToStatus, type Status, taskStateToStatus } from "../ds";

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

describe("documentStatusToStatus", () => {
	// @lore nested-knowledge-items: the 7-value status ladder collapsed to 4
	// (proposed | active | stale | archived) — captured/provisional/needs_human
	// folded into proposed, validated folded into active.
	// @lore BC4: renamed from knowledgeStatusToStatus — values unchanged.
	it("maps proposed to behind", () => {
		// I4 S2 intent preserved: proposed is the action-required state —
		// explicitly not `healthy` (would mislead the founder into thinking the
		// item needs no input).
		expect(documentStatusToStatus("proposed")).toBe("behind" satisfies Status);
	});

	it("maps active to healthy", () => {
		expect(documentStatusToStatus("active")).toBe("healthy" satisfies Status);
	});

	it("maps stale to error", () => {
		expect(documentStatusToStatus("stale")).toBe("error" satisfies Status);
	});

	it("maps archived to done", () => {
		expect(documentStatusToStatus("archived")).toBe("done" satisfies Status);
	});

	it("covers all DocumentStatus values", () => {
		const allStatuses: DocumentStatus[] = ["proposed", "active", "stale", "archived"];
		for (const ds of allStatuses) {
			const result = documentStatusToStatus(ds);
			expect(typeof result).toBe("string");
		}
	});

	it("exhaustively maps every DOCUMENT_STATUSES value to a valid Status", () => {
		// I4 S2/S6: runtime iteration over the shared DOCUMENT_STATUSES array
		// — catches additions to the union.
		expect(DOCUMENT_STATUSES).toHaveLength(4);
		for (const ds of DOCUMENT_STATUSES) {
			const result = documentStatusToStatus(ds);
			expect(VALID_STATUSES).toContain(result);
		}
	});
});
