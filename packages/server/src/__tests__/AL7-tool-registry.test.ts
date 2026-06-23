/**
 * AL7 RED — No bypass of the human gate.
 *
 * Static AC: the dispatcher is NOT in ALL_TOOL_DEFINITIONS, and no agent role
 * can receive an "execute" verb through buildToolRegistry.
 *
 * Tests FAIL until:
 * - stage_operation is registered in ALL_TOOL_DEFINITIONS
 * - The dispatcher (resolveStagedOperations / sweepStrandedOperations) is NOT
 *   in ALL_TOOL_DEFINITIONS
 */

import { describe, expect, it } from "vitest";
import { ALL_TOOL_DEFINITIONS, toolsForRole } from "../tools/tool-registry.js";
import type { UserRole } from "@hyperidle/shared";

const ALL_ROLES: readonly UserRole[] = [
	"builder",
	"assistant",
	"reviewer",
	"designer",
	"marketer",
	"analyst",
	"support",
	"sales",
];

describe("AL7 — tool registry: no bypass of the human gate", () => {
	it("stage_operation is registered in ALL_TOOL_DEFINITIONS", () => {
		const names = ALL_TOOL_DEFINITIONS.map((d) => d.name);
		expect(names).toContain("stage_operation");
	});

	it("no tool in ALL_TOOL_DEFINITIONS has an execute/dispatch verb", () => {
		// The dispatcher is server-internal; it must never appear as a tool.
		const forbidden = ["execute_operation", "dispatch_operation", "resolve_staged_operations"];
		const names = ALL_TOOL_DEFINITIONS.map((d) => d.name);
		for (const verb of forbidden) {
			expect(names).not.toContain(verb);
		}
	});

	it("toolsForRole never returns an execute-verb tool for any role", () => {
		const forbidden = ["execute_operation", "dispatch_operation", "resolve_staged_operations"];
		for (const role of ALL_ROLES) {
			const tools = toolsForRole(role);
			const names = tools.map((d) => d.name);
			for (const verb of forbidden) {
				expect(names, `role ${role} must not have ${verb}`).not.toContain(verb);
			}
		}
	});

	it("stage_operation is accessible to at least the builder role", () => {
		const builderTools = toolsForRole("builder");
		const names = builderTools.map((d) => d.name);
		expect(names).toContain("stage_operation");
	});
});
