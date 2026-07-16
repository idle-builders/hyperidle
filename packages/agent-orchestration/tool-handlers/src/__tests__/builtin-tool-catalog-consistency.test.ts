import { createTestDb, type TestDbHandle } from "@hyperidle/db";
import { loadBuiltInConfigurationDefaults } from "@hyperidle/settings";
import { BUILTIN_TOOL_CATALOG } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildAllToolDefinitions } from "../tool-definitions.js";
import { STUB_TOOL_HANDLERS_PORTS } from "./stub-ports.js";

const NOW = "2026-07-11T09:00:00.000Z";

// Descriptor metadata (name/description/roles/reversibility) never touches a
// port method — a stub ports bundle is enough to assemble the catalogue.
const ALL_TOOL_DEFINITIONS = buildAllToolDefinitions(STUB_TOOL_HANDLERS_PORTS);

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

describe("builtin tool catalog capability validation (AC5)", () => {
	let handle: TestDbHandle;

	beforeEach(async () => {
		handle = await createTestDb();
	});

	afterEach(async () => {
		await handle.close();
	});

	test("every catalog entry projects through the real validated seeding path without throwing", async () => {
		const defaults = BUILTIN_TOOL_CATALOG.map((entry) => ({
			kind: "tool" as const,
			key: `tool.${entry.name}`,
			value: {
				name: entry.name,
				description: entry.description,
				roles: entry.roles ?? null,
				reversibility: entry.reversibility ?? null,
			},
		}));

		// loadBuiltInConfigurationDefaults → loadPluginConfigurationDefaults runs
		// validateConfigurationValue over every seed before persisting (plugin-configuration.ts:222).
		// A throw here means a catalog entry produced an invalid `tool` configuration
		// value — proving capability validation is explicit and inspectable without
		// the catalog owning runtime discovery.
		await expect(
			loadBuiltInConfigurationDefaults(handle.db, { defaults, now: NOW }),
		).resolves.toBeUndefined();
	});
});
