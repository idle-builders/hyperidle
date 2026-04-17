import type { BetStatus, KnowledgeStatus, TaskState } from "@hyperidle/shared";
import { describe, expect, it } from "vitest";
import type { Status } from "../components/StatusChip";
import {
	betStatusToStatus,
	knowledgeStatusToStatus,
	taskStateToStatus,
} from "../components/status-mapping";

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
		];
		for (const ks of allStatuses) {
			const result = knowledgeStatusToStatus(ks);
			expect(typeof result).toBe("string");
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

	it("covers all BetStatus values", () => {
		const allStatuses: BetStatus[] = ["shaped", "committed", "in_progress", "shipped", "killed"];
		for (const bs of allStatuses) {
			const result = betStatusToStatus(bs);
			expect(typeof result).toBe("string");
		}
	});
});
