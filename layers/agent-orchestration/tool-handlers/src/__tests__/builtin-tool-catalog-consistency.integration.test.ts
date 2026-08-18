import { BUILTIN_TOOL_CATALOG } from "@hyperidle/tool-protocol";
import { describe, expect, test } from "vitest";
import { buildToolDefinitions } from "../tool-definitions.js";
import { STUB_TOOL_HANDLERS_PORTS } from "./stub-ports.js";

// Descriptor metadata (name/description/roles/reversibility) never touches a
// port method — a stub ports bundle is enough to assemble the catalogue.
const ALL_TOOL_DEFINITIONS = buildToolDefinitions(STUB_TOOL_HANDLERS_PORTS);

describe("builtin tool catalog consistency", () => {
	test("catalog name-set exactly matches the runtime tool registry name-set", () => {
		const catalogNames = new Set(BUILTIN_TOOL_CATALOG.map((entry) => entry.name));
		const registryNames = new Set(ALL_TOOL_DEFINITIONS.map((tool) => tool.name));

		expect(catalogNames).toEqual(registryNames);
	});

	test("return_status_tool is excluded from both catalog and registry", () => {
		expect(BUILTIN_TOOL_CATALOG.some((entry) => entry.name === "return_status_tool")).toBe(false);
		expect(ALL_TOOL_DEFINITIONS.some((tool) => tool.name === "return_status_tool")).toBe(false);
	});

	test("per-tool description/roles/reversibility deep-equal between catalog and registry", () => {
		const registryByName = new Map(ALL_TOOL_DEFINITIONS.map((tool) => [tool.name, tool]));

		for (const entry of BUILTIN_TOOL_CATALOG) {
			const tool = registryByName.get(entry.name);
			expect(tool, `catalog entry ${entry.name} has no matching registry tool`).toBeDefined();
			expect(entry.description).toBe(tool?.description);
			expect(entry.roles).toEqual(tool?.roles);
			expect(entry.reversibility).toEqual(tool?.reversibility);
		}
	});
});
