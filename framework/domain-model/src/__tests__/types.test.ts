import { describe, expect, it } from "vitest";
import { AGENT_CATEGORIES, KERNEL_DOCUMENT_STATUSES, TASK_STATES } from "../types.js";

describe("status-union runtime constants", () => {
	it("TASK_STATES has 8 task states", () => {
		expect(TASK_STATES).toHaveLength(8);
	});

	it("KERNEL_DOCUMENT_STATUSES includes proposed, active, archived", () => {
		expect(KERNEL_DOCUMENT_STATUSES).toContain("proposed");
		expect(KERNEL_DOCUMENT_STATUSES).toContain("active");
		expect(KERNEL_DOCUMENT_STATUSES).toContain("archived");
	});

	it("AGENT_CATEGORIES is exactly {team, individual}", () => {
		expect([...AGENT_CATEGORIES].sort()).toEqual(["individual", "team"]);
	});
});
