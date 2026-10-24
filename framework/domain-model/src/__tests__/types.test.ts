import { describe, expect, it } from "vitest";
import { AGENT_CATEGORIES, TASK_STATES } from "../types.js";

describe("status-union runtime constants", () => {
	it("TASK_STATES has 8 task states", () => {
		expect(TASK_STATES).toHaveLength(8);
	});

	it("AGENT_CATEGORIES is exactly {team, individual}", () => {
		expect([...AGENT_CATEGORIES].sort()).toEqual(["individual", "team"]);
	});
});
