/**
 * Pure invariant unit tests for the platform module's declarations —
 * `editPluginInvariants`, plus the schema shapes `SearchPluginsInputSchema`,
 * `EditPluginInputSchema`, `PluginScopeSchema`, `PluginViewSchema`. Exact
 * equality on `problems[0]?.code`, never `toContain`.
 */

import { describe, expect, it } from "vitest";
import {
	EditPluginInputSchema,
	editPluginInvariants,
	PluginScopeSchema,
	PluginViewSchema,
	SearchPluginsInputSchema,
} from "../actions/platform.js";

const factoryScope = { kind: "factory" as const, teamId: null };
const teamScope = { kind: "team" as const, teamId: "team-1" };

describe("editPluginInvariants", () => {
	it("one_change: no change field at all", () => {
		const problems = editPluginInvariants({ id: "p1" });
		expect(problems[0]?.code).toBe("one_change");
	});

	it("one_change: two change fields together", () => {
		const problems = editPluginInvariants({
			id: "p1",
			state: "enabled",
			remove: true,
		});
		expect(problems.map((p) => p.code)).toContain("one_change");
	});

	it("id_with_source: a source install names an id", () => {
		const problems = editPluginInvariants({
			id: "p1",
			source: { kind: "folder", path: "/plugins/x", scope: factoryScope },
		});
		expect(problems[0]?.code).toBe("id_with_source");
	});

	it("id_with_source does not fire on a source install with no id", () => {
		const problems = editPluginInvariants({
			source: { kind: "folder", path: "/plugins/x", scope: factoryScope },
		});
		expect(problems.map((p) => p.code)).not.toContain("id_with_source");
	});

	it("plugin_id_required: state given with no id", () => {
		const problems = editPluginInvariants({ state: "disabled" });
		expect(problems.map((p) => p.code)).toContain("plugin_id_required");
	});

	it("plugin_id_required: remove given with no id", () => {
		const problems = editPluginInvariants({ remove: true });
		expect(problems.map((p) => p.code)).toContain("plugin_id_required");
	});

	it("plugin_id_required: restore given with no id", () => {
		const problems = editPluginInvariants({ restore: { contribution: "p1/skill-a" } });
		expect(problems.map((p) => p.code)).toContain("plugin_id_required");
	});

	it("plugin_id_required does not fire on a well-formed state edit", () => {
		const problems = editPluginInvariants({ id: "p1", state: "disabled" });
		expect(problems.map((p) => p.code)).not.toContain("plugin_id_required");
	});

	it("a well-formed source install has no problems", () => {
		expect(
			editPluginInvariants({ source: { kind: "git", url: "https://x/y.git", scope: teamScope } }),
		).toEqual([]);
	});

	it("a well-formed state edit has no problems", () => {
		expect(editPluginInvariants({ id: "p1", state: "enabled" })).toEqual([]);
	});

	it("a well-formed remove has no problems", () => {
		expect(editPluginInvariants({ id: "p1", remove: true })).toEqual([]);
	});

	it("a well-formed restore has no problems", () => {
		expect(editPluginInvariants({ id: "p1", restore: { contribution: "p1/skill-a" } })).toEqual([]);
	});
});

describe("PluginScopeSchema — scope nested inside source, not a bare field", () => {
	it("accepts factory scope with a null teamId", () => {
		expect(PluginScopeSchema.safeParse(factoryScope).success).toBe(true);
	});

	it("accepts team scope with a teamId", () => {
		expect(PluginScopeSchema.safeParse(teamScope).success).toBe(true);
	});

	it("rejects team scope with a null teamId", () => {
		expect(PluginScopeSchema.safeParse({ kind: "team", teamId: null }).success).toBe(false);
	});

	it("rejects factory scope with a non-null teamId", () => {
		expect(PluginScopeSchema.safeParse({ kind: "factory", teamId: "t1" }).success).toBe(false);
	});
});

describe("EditPluginInputSchema", () => {
	it("scope without source is unrepresentable — there is no top-level scope field", () => {
		const result = EditPluginInputSchema.safeParse({ id: "p1", scope: factoryScope });
		expect(result.success).toBe(false);
	});

	it("a zip source with scope parses", () => {
		const result = EditPluginInputSchema.safeParse({
			source: { kind: "zip", path: "/tmp/x.zip", scope: teamScope },
		});
		expect(result.success).toBe(true);
	});

	it("a git source carries no ref field on the wire", () => {
		const result = EditPluginInputSchema.safeParse({
			source: { kind: "git", url: "https://x/y.git", ref: "main", scope: factoryScope },
		});
		expect(result.success).toBe(false);
	});
});

describe("SearchPluginsInputSchema", () => {
	it("an empty filter parses", () => {
		expect(SearchPluginsInputSchema.safeParse({}).success).toBe(true);
	});

	it("rejects a 'removed' state filter — search_plugins never returns a tombstone", () => {
		expect(SearchPluginsInputSchema.safeParse({ state: "removed" }).success).toBe(false);
	});
});

describe("PluginViewSchema", () => {
	it("parses a plugin with a contribution", () => {
		const result = PluginViewSchema.safeParse({
			id: "p1",
			name: "Document management",
			version: "1.0.0",
			description: null,
			state: "enabled",
			scope: factoryScope,
			source: { kind: "bundled", address: "document-management" },
			installedBy: null,
			installedAt: "2026-09-22T00:00:00.000Z",
			updatedAt: "2026-09-22T00:00:00.000Z",
			disabledAt: null,
			contributions: [
				{
					kind: "agent",
					entityId: "librarian",
					label: "Librarian",
					key: "p1/librarian",
					manifestKey: "librarian",
					slot: null,
					agentId: null,
					detachedAt: null,
					detachedBy: null,
				},
			],
		});
		expect(result.success).toBe(true);
	});
});
