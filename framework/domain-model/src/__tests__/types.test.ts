import { describe, expect, it } from "vitest";
import {
	AGENT_CATEGORIES,
	BET_STATUSES,
	type BetStatus,
	KERNEL_KNOWLEDGE_STATUSES,
	type KernelKnowledgeStatus,
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
		it("AGENT_CATEGORIES has 3 values", () => {
			expect(AGENT_CATEGORIES).toHaveLength(3);
			expect(AGENT_CATEGORIES).toContain("team");
			expect(AGENT_CATEGORIES).toContain("strategy");
			expect(AGENT_CATEGORIES).toContain("individual");
		});

		it("UserRole is a plain string (open vocabulary)", () => {
			// UserRole was removed from domain-model — it was `type UserRole = string`, zero safety.
			const r: string = "any_custom_role";
			expect(typeof r).toBe("string");
		});
	});
});
