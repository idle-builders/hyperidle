/**
 * AD8b — Assistant tool surface + risk classification tests (RED phase).
 *
 * AC-4: High-risk actions (create_bet, edit_bet, submit_review, handoff_to)
 *       surface as review messages. HIGH_RISK_TOOLS contains exactly those 4.
 * AC-5: Low/medium-risk actions execute directly. LOW_MEDIUM_TOOLS are not in HIGH_RISK_TOOLS.
 * AC-7 (Task 7): toolsForAssistant() returns all 13 assistant-accessible tools.
 */

import { describe, expect, it } from "vitest";
import {
	ASSISTANT_TOOLS,
	type AssistantToolDef,
	HIGH_RISK_TOOLS,
	type ToolRiskLevel,
	toolsForAssistant,
} from "../assistant-tools.js";

// ---------------------------------------------------------------------------
// ASSISTANT_TOOLS constant
// ---------------------------------------------------------------------------

describe("AD8b — ASSISTANT_TOOLS", () => {
	it("contains exactly 13 tool definitions", () => {
		expect(ASSISTANT_TOOLS).toHaveLength(13);
	});

	it("every entry has a name and riskLevel", () => {
		for (const tool of ASSISTANT_TOOLS) {
			expect(typeof tool.name).toBe("string");
			expect(tool.name.length).toBeGreaterThan(0);
			expect(["low", "medium", "high"]).toContain(tool.riskLevel);
		}
	});

	it("includes read_inbox with riskLevel='low'", () => {
		const tool = ASSISTANT_TOOLS.find((t) => t.name === "read_inbox");
		expect(tool).toBeDefined();
		expect(tool?.riskLevel).toBe("low");
	});

	it("includes send_message with riskLevel='medium'", () => {
		const tool = ASSISTANT_TOOLS.find((t) => t.name === "send_message");
		expect(tool).toBeDefined();
		expect(tool?.riskLevel).toBe("medium");
	});

	it("includes create_bet with riskLevel='high'", () => {
		const tool = ASSISTANT_TOOLS.find((t) => t.name === "create_bet");
		expect(tool).toBeDefined();
		expect(tool?.riskLevel).toBe("high");
	});

	it("includes edit_bet with riskLevel='high'", () => {
		const tool = ASSISTANT_TOOLS.find((t) => t.name === "edit_bet");
		expect(tool).toBeDefined();
		expect(tool?.riskLevel).toBe("high");
	});

	it("includes submit_review with riskLevel='high'", () => {
		const tool = ASSISTANT_TOOLS.find((t) => t.name === "submit_review");
		expect(tool).toBeDefined();
		expect(tool?.riskLevel).toBe("high");
	});

	it("includes handoff_to with riskLevel='high'", () => {
		const tool = ASSISTANT_TOOLS.find((t) => t.name === "handoff_to");
		expect(tool).toBeDefined();
		expect(tool?.riskLevel).toBe("high");
	});

	it("includes update_task_status", () => {
		const tool = ASSISTANT_TOOLS.find((t) => t.name === "update_task_status");
		expect(tool).toBeDefined();
	});

	it("includes edit_block", () => {
		const tool = ASSISTANT_TOOLS.find((t) => t.name === "edit_block");
		expect(tool).toBeDefined();
	});

	it("no duplicate tool names", () => {
		const names = ASSISTANT_TOOLS.map((t) => t.name);
		expect(new Set(names).size).toBe(names.length);
	});

	it("type annotation: each entry is assignable to AssistantToolDef", () => {
		const entry: AssistantToolDef = ASSISTANT_TOOLS[0]!;
		expect(entry).toBeDefined();
	});

	it("type annotation: ToolRiskLevel includes 'low', 'medium', 'high'", () => {
		const low: ToolRiskLevel = "low";
		const medium: ToolRiskLevel = "medium";
		const high: ToolRiskLevel = "high";
		expect(low).toBe("low");
		expect(medium).toBe("medium");
		expect(high).toBe("high");
	});
});

// ---------------------------------------------------------------------------
// AC-4: HIGH_RISK_TOOLS — exactly the 4 gated actions
// ---------------------------------------------------------------------------

describe("AD8b — HIGH_RISK_TOOLS", () => {
	it("contains exactly 4 entries", () => {
		expect(HIGH_RISK_TOOLS).toHaveLength(4);
	});

	it("contains 'create_bet'", () => {
		expect(HIGH_RISK_TOOLS).toContain("create_bet");
	});

	it("contains 'edit_bet'", () => {
		expect(HIGH_RISK_TOOLS).toContain("edit_bet");
	});

	it("contains 'submit_review'", () => {
		expect(HIGH_RISK_TOOLS).toContain("submit_review");
	});

	it("contains 'handoff_to'", () => {
		expect(HIGH_RISK_TOOLS).toContain("handoff_to");
	});

	it("does NOT contain 'read_inbox' (low-risk)", () => {
		expect(HIGH_RISK_TOOLS).not.toContain("read_inbox");
	});

	it("does NOT contain 'send_message' (medium-risk)", () => {
		expect(HIGH_RISK_TOOLS).not.toContain("send_message");
	});

	it("does NOT contain 'create_task' (medium-risk)", () => {
		expect(HIGH_RISK_TOOLS).not.toContain("create_task");
	});

	it("does NOT contain 'update_task_status' (medium-risk)", () => {
		expect(HIGH_RISK_TOOLS).not.toContain("update_task_status");
	});
});

// ---------------------------------------------------------------------------
// AC-7 (Task 7): toolsForAssistant() returns all assistant-accessible tools
// ---------------------------------------------------------------------------

describe("AD8b — toolsForAssistant()", () => {
	it("returns exactly 13 ToolDefinition entries", () => {
		const tools = toolsForAssistant();
		expect(tools).toHaveLength(13);
	});

	it("includes 'read_inbox'", () => {
		const tools = toolsForAssistant();
		expect(tools.some((t) => t.name === "read_inbox")).toBe(true);
	});

	it("includes 'create_bet'", () => {
		const tools = toolsForAssistant();
		expect(tools.some((t) => t.name === "create_bet")).toBe(true);
	});

	it("includes 'edit_bet'", () => {
		const tools = toolsForAssistant();
		expect(tools.some((t) => t.name === "edit_bet")).toBe(true);
	});

	it("includes 'update_task_status'", () => {
		const tools = toolsForAssistant();
		expect(tools.some((t) => t.name === "update_task_status")).toBe(true);
	});

	it("includes 'edit_block'", () => {
		const tools = toolsForAssistant();
		expect(tools.some((t) => t.name === "edit_block")).toBe(true);
	});

	it("every returned tool has a name, description, inputSchema, and handler", () => {
		for (const tool of toolsForAssistant()) {
			expect(typeof tool.name).toBe("string");
			expect(typeof tool.description).toBe("string");
			expect(tool.inputSchema).toBeDefined();
			expect(typeof tool.handler).toBe("function");
		}
	});

	it("no duplicate tool names in result", () => {
		const tools = toolsForAssistant();
		const names = tools.map((t) => t.name);
		expect(new Set(names).size).toBe(names.length);
	});
});
