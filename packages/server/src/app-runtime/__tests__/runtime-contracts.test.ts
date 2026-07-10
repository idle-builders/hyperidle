import { describe, expect, it } from "vitest";
import type { AgentScaffoldSpec, ScaffoldRequest } from "../contracts.js";

describe("app-runtime contracts", () => {
	it("keeps scaffold request on the three app-owned creation surfaces", () => {
		type Trigger = ScaffoldRequest["trigger"];
		const triggers: Trigger[] = ["team_scaffold", "agent_added", "user_assistant"];
		expect(triggers).toEqual(["team_scaffold", "agent_added", "user_assistant"]);
	});

	it("keeps scaffold specs free of harness, model, and cost fields", () => {
		const spec: AgentScaffoldSpec = {
			role: "assistant",
			name: "Assistant",
			agentCategory: "individual",
			systemPrompt: "Help the user.",
			idHint: "ast-user-1",
		};

		expect("harnessType" in spec).toBe(false);
		expect("modelId" in spec).toBe(false);
		expect("modelProvider" in spec).toBe(false);
		expect("costCap" in spec).toBe(false);
		expect("maxConcurrentSessions" in spec).toBe(false);
	});
});
