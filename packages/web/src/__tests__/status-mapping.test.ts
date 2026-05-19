import {
	betStatusToStatus,
	knowledgeStatusToStatus,
	type Status,
	taskStateToStatus,
} from "@hyperidle/design-system";
import { KNOWLEDGE_STATUSES, type KnowledgeStatus } from "@hyperidle/fabric";
import { BET_STATUSES, type BetStatus, TASK_STATES, type TaskState } from "@hyperidle/shared";
import { describe, expect, it } from "vitest";

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

describe("betStatusToStatus", () => {
	it("maps shaped to paused", () => {
		expect(betStatusToStatus("shaped")).toBe("paused" satisfies Status);
	});

	it("maps committed to healthy", () => {
		expect(betStatusToStatus("committed")).toBe("healthy" satisfies Status);
	});

	it("maps in_progress to healthy", () => {
		expect(betStatusToStatus("in_progress")).toBe("healthy" satisfies Status);
	});

	it("maps shipped to done", () => {
		expect(betStatusToStatus("shipped")).toBe("done" satisfies Status);
	});

	it("maps killed to error", () => {
		expect(betStatusToStatus("killed")).toBe("error" satisfies Status);
	});

	it("covers all BetStatus values (9 total including behind/blocked/paused/review)", () => {
		const allStatuses: BetStatus[] = [
			"shaped",
			"committed",
			"in_progress",
			"behind",
			"blocked",
			"paused",
			"review",
			"shipped",
			"killed",
		];
		for (const bs of allStatuses) {
			const result = betStatusToStatus(bs);
			expect(typeof result).toBe("string");
		}
	});

	it("maps behind to behind", () => {
		// I4 S1: `behind` bets must not fall through to undefined badge class.
		expect(betStatusToStatus("behind")).toBe("behind" satisfies Status);
	});

	it("maps blocked to blocked", () => {
		expect(betStatusToStatus("blocked")).toBe("blocked" satisfies Status);
	});

	it("maps paused to paused", () => {
		expect(betStatusToStatus("paused")).toBe("paused" satisfies Status);
	});

	it("maps review to a defined non-healthy Status", () => {
		const result = betStatusToStatus("review");
		expect(VALID_STATUSES).toContain(result);
		expect(result).not.toBe("healthy");
	});

	it("exhaustively maps every BET_STATUSES value to a valid Status", () => {
		// I4 S1/S6: runtime iteration over the shared BET_STATUSES array
		// — every future addition must be mapped or this test fails.
		expect(BET_STATUSES).toHaveLength(9);
		for (const bs of BET_STATUSES) {
			const result = betStatusToStatus(bs);
			expect(VALID_STATUSES).toContain(result);
		}
	});
});
