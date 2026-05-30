import { describe, expect, it } from "vitest";
import {
	BET_STATUSES,
	type BetStatus,
	FABRIC_USER_ROLES,
	KERNEL_KNOWLEDGE_STATUSES,
	KERNEL_USER_ROLES,
	type KernelKnowledgeStatus,
	TASK_STATES,
	type TaskState,
	USER_ROLES,
	type UserRole,
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

		// @lore U1: Simplified from 9 statuses to 4 (draft | active | completed | killed).
		// Old statuses: shaped->draft, committed|in_progress|behind|blocked|paused|review->active,
		// shipped->completed.
		it("has 4 bet statuses matching the BetStatus union (U1 simplified)", () => {
			expect(BET_STATUSES).toHaveLength(4);
		});

		it("includes every BetStatus value", () => {
			const expected: readonly BetStatus[] = ["draft", "active", "completed", "killed"];
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

	describe("KERNEL_KNOWLEDGE_STATUSES", () => {
		it("is exported as a runtime array", () => {
			expect(Array.isArray(KERNEL_KNOWLEDGE_STATUSES)).toBe(true);
		});

		it("has 3 kernel knowledge statuses", () => {
			expect(KERNEL_KNOWLEDGE_STATUSES).toHaveLength(3);
		});

		it("includes draft, active, archived", () => {
			const expected: readonly KernelKnowledgeStatus[] = ["draft", "active", "archived"];
			for (const ks of expected) {
				expect(KERNEL_KNOWLEDGE_STATUSES).toContain(ks);
			}
		});
	});

	describe("User role split", () => {
		it("KERNEL_USER_ROLES has 3 roles", () => {
			expect(KERNEL_USER_ROLES).toHaveLength(3);
			expect(KERNEL_USER_ROLES).toContain("builder");
			expect(KERNEL_USER_ROLES).toContain("growth");
			expect(KERNEL_USER_ROLES).toContain("product_manager");
		});

		it("FABRIC_USER_ROLES has 3 roles", () => {
			expect(FABRIC_USER_ROLES).toHaveLength(3);
			expect(FABRIC_USER_ROLES).toContain("practice_facilitator");
			expect(FABRIC_USER_ROLES).toContain("chief_of_staff");
			expect(FABRIC_USER_ROLES).toContain("brand_voice");
		});

		it("USER_ROLES composes both arrays (6 total)", () => {
			expect(USER_ROLES).toHaveLength(6);
			for (const role of KERNEL_USER_ROLES) {
				expect(USER_ROLES).toContain(role);
			}
			for (const role of FABRIC_USER_ROLES) {
				expect(USER_ROLES).toContain(role);
			}
		});

		it("derives UserRole type", () => {
			const r: UserRole = USER_ROLES[0];
			expect(typeof r).toBe("string");
		});
	});
});
