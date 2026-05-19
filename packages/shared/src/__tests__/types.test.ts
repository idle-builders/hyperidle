import { describe, expect, it } from "vitest";
import {
	BET_STATUSES,
	type BetStatus,
	KERNEL_KNOWLEDGE_STATUSES,
	type KernelKnowledgeStatus,
	KERNEL_AGENT_ROLES,
	FABRIC_AGENT_ROLES,
	AGENT_ROLES,
	type AgentRole,
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

	describe("Agent role split", () => {
		it("KERNEL_AGENT_ROLES has 3 roles", () => {
			expect(KERNEL_AGENT_ROLES).toHaveLength(3);
			expect(KERNEL_AGENT_ROLES).toContain("builder");
			expect(KERNEL_AGENT_ROLES).toContain("growth");
			expect(KERNEL_AGENT_ROLES).toContain("product_manager");
		});

		it("FABRIC_AGENT_ROLES has 3 roles", () => {
			expect(FABRIC_AGENT_ROLES).toHaveLength(3);
			expect(FABRIC_AGENT_ROLES).toContain("practice_facilitator");
			expect(FABRIC_AGENT_ROLES).toContain("chief_of_staff");
			expect(FABRIC_AGENT_ROLES).toContain("brand_voice");
		});

		it("AGENT_ROLES composes both arrays (6 total)", () => {
			expect(AGENT_ROLES).toHaveLength(6);
			for (const role of KERNEL_AGENT_ROLES) {
				expect(AGENT_ROLES).toContain(role);
			}
			for (const role of FABRIC_AGENT_ROLES) {
				expect(AGENT_ROLES).toContain(role);
			}
		});

		it("derives AgentRole type", () => {
			const r: AgentRole = AGENT_ROLES[0];
			expect(typeof r).toBe("string");
		});
	});
});
