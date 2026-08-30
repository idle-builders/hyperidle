import { describe, expect, it } from "vitest";
import {
	AGENT_CATEGORIES,
	KERNEL_KNOWLEDGE_STATUSES,
	type KernelKnowledgeStatus,
	TASK_STATES,
	type TaskState,
} from "../types.js";
// @lore BB1: BET_STATUSES and BetStatus removed — task vocabulary is the only work vocabulary.

/**
 * I4 cross-cutting: runtime `as const` arrays for `KnowledgeStatus` unions,
 * paralleling the existing `TASK_STATES`. BetStatus was here and is now gone (BB1).
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

	describe("KERNEL_KNOWLEDGE_STATUSES", () => {
		it("is exported as a runtime array", () => {
			expect(Array.isArray(KERNEL_KNOWLEDGE_STATUSES)).toBe(true);
		});

		it("has 4 kernel knowledge statuses", () => {
			// Y4: needs_human added for triage escalation (was 3)
			expect(KERNEL_KNOWLEDGE_STATUSES).toHaveLength(4);
		});

		it("includes draft, active, archived", () => {
			const expected: readonly KernelKnowledgeStatus[] = ["draft", "active", "archived"];
			for (const ks of expected) {
				expect(KERNEL_KNOWLEDGE_STATUSES).toContain(ks);
			}
		});
	});

	describe("Agent categories (AB0)", () => {
		it("AGENT_CATEGORIES has 2 values (strategy removed in BA9d)", () => {
			expect(AGENT_CATEGORIES).toHaveLength(2);
			expect(AGENT_CATEGORIES).toContain("team");
			expect(AGENT_CATEGORIES).toContain("individual");
		});

		it("UserRole is a plain string (open vocabulary)", () => {
			// UserRole was removed from domain-model — it was `type UserRole = string`, zero safety.
			const r: string = "any_custom_role";
			expect(typeof r).toBe("string");
		});
	});
});
