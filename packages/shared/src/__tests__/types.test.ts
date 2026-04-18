import { describe, expect, it } from "vitest";
import {
	BET_STATUSES,
	type BetStatus,
	KNOWLEDGE_STATUSES,
	type KnowledgeStatus,
	TASK_STATES,
	type TaskState,
} from "../types.js";

/**
 * I4 cross-cutting: runtime `as const` arrays for `BetStatus` and
 * `KnowledgeStatus` unions, paralleling the existing `TASK_STATES`. This
 * unlocks exhaustive iteration at the web layer for status-mapping coverage
 * without drifting from the type-checked union.
 */
describe("status-union runtime constants", () => {
	describe("TASK_STATES", () => {
		it("has 8 task states", () => {
			expect(TASK_STATES).toHaveLength(8);
		});

		it("derives TaskState union", () => {
			const s: TaskState = TASK_STATES[0];
			expect(typeof s).toBe("string");
		});
	});

	describe("BET_STATUSES", () => {
		it("is exported as a runtime array", () => {
			expect(Array.isArray(BET_STATUSES)).toBe(true);
		});

		it("has 9 bet statuses matching the BetStatus union", () => {
			expect(BET_STATUSES).toHaveLength(9);
		});

		it("includes every BetStatus value", () => {
			const expected: readonly BetStatus[] = [
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
			for (const status of expected) {
				expect(BET_STATUSES).toContain(status);
			}
		});

		it("runtime and type values agree", () => {
			for (const status of BET_STATUSES) {
				const typed: BetStatus = status;
				expect(typeof typed).toBe("string");
			}
		});
	});

	describe("KNOWLEDGE_STATUSES", () => {
		it("is exported as a runtime array", () => {
			expect(Array.isArray(KNOWLEDGE_STATUSES)).toBe(true);
		});

		it("has 7 knowledge statuses including needs_human", () => {
			expect(KNOWLEDGE_STATUSES).toHaveLength(7);
			expect(KNOWLEDGE_STATUSES).toContain("needs_human");
		});

		it("includes every KnowledgeStatus value", () => {
			const expected: readonly KnowledgeStatus[] = [
				"captured",
				"provisional",
				"validated",
				"active",
				"stale",
				"archived",
				"needs_human",
			];
			for (const ks of expected) {
				expect(KNOWLEDGE_STATUSES).toContain(ks);
			}
		});
	});
});
