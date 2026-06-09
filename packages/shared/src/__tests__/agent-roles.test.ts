/**
 * AB0 — Agent Roles: unit tests (RED phase)
 *
 * AC2: AGENT_ROLE_CATALOG has 16 entries with required fields for all known roles
 * AC3: TEAM_FUNCTIONS, defaultRoster(), communityForRole() behave correctly
 * AC7: communityForRole() replaces ROLE_TO_COMMUNITY record
 */

import { describe, expect, it } from "vitest";
import {
	AGENT_CATEGORIES,
	AGENT_ROLE_CATALOG,
	type AgentCategory,
	type AgentRoleCatalogEntry,
	communityForRole,
	defaultRoster,
	findRoleCatalogEntry,
	TEAM_FUNCTIONS,
	type TeamFunction,
} from "../agent-roles.js";

// ---------------------------------------------------------------------------
// AGENT_ROLE_CATALOG — AC2
// ---------------------------------------------------------------------------

describe("AGENT_ROLE_CATALOG", () => {
	it("has 16 entries", () => {
		expect(AGENT_ROLE_CATALOG).toHaveLength(16);
	});

	it("every entry has required fields", () => {
		for (const entry of AGENT_ROLE_CATALOG) {
			expect(entry).toHaveProperty("role");
			expect(entry).toHaveProperty("label");
			expect(entry).toHaveProperty("category");
			expect(entry).toHaveProperty("description");
			expect(entry).toHaveProperty("community");
			expect(entry).toHaveProperty("teamFunctions");
			expect(entry).toHaveProperty("hasTemplate");

			expect(typeof entry.role).toBe("string");
			expect(entry.role.length).toBeGreaterThan(0);
			expect(typeof entry.label).toBe("string");
			expect(entry.label.length).toBeGreaterThan(0);
			expect(typeof entry.description).toBe("string");
			expect(entry.description.length).toBeGreaterThan(0);
			expect(typeof entry.community).toBe("string");
			expect(entry.community.length).toBeGreaterThan(0);
			expect(Array.isArray(entry.teamFunctions)).toBe(true);
			expect(typeof entry.hasTemplate).toBe("boolean");
		}
	});

	it("every legacy role has a catalog entry", () => {
		const legacyRoles = [
			"builder",
			"growth",
			"product_manager",
			"practice_facilitator",
			"chief_of_staff", // @lore AD8a: role string renamed to "assistant" in AD8b
			"brand_voice",
		];
		for (const role of legacyRoles) {
			expect(
				findRoleCatalogEntry(role),
				`role "${role}" should have a catalog entry`,
			).toBeDefined();
		}
	});

	it("categories are valid AgentCategory values", () => {
		const validCategories = new Set<string>(AGENT_CATEGORIES);
		for (const entry of AGENT_ROLE_CATALOG) {
			expect(
				validCategories.has(entry.category),
				`entry "${entry.role}" has invalid category "${entry.category}"`,
			).toBe(true);
		}
	});

	it("no duplicate roles in catalog", () => {
		const roles = AGENT_ROLE_CATALOG.map((e) => e.role);
		const uniqueRoles = new Set(roles);
		expect(uniqueRoles.size).toBe(roles.length);
	});

	it("all 3 categories are represented", () => {
		const categoriesInCatalog = new Set(AGENT_ROLE_CATALOG.map((e) => e.category));
		expect(categoriesInCatalog.has("team")).toBe(true);
		expect(categoriesInCatalog.has("strategy")).toBe(true);
		expect(categoriesInCatalog.has("individual")).toBe(true);
	});

	it("type annotation: each entry is assignable to AgentRoleCatalogEntry", () => {
		// Type-level test — if this compiles, the shape is correct
		const entry: AgentRoleCatalogEntry = AGENT_ROLE_CATALOG[0];
		expect(entry).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// findRoleCatalogEntry
// ---------------------------------------------------------------------------

describe("findRoleCatalogEntry", () => {
	it("returns the entry for a known role", () => {
		const entry = findRoleCatalogEntry("builder");
		expect(entry).toBeDefined();
		expect(entry?.role).toBe("builder");
		expect(entry?.category).toBe("team");
	});

	it("returns undefined for an unknown role", () => {
		const entry = findRoleCatalogEntry("totally_unknown_role_xyz");
		expect(entry).toBeUndefined();
	});

	it("returns the entry for practice_facilitator", () => {
		const entry = findRoleCatalogEntry("practice_facilitator");
		expect(entry).toBeDefined();
		expect(entry?.category).toBe("strategy");
	});

	it("returns the entry for chief_of_staff", () => {
		// @lore AD8a: role string renamed in AD8b
		// @lore AD8a: role string renamed to "assistant" in AD8b
		const entry = findRoleCatalogEntry("chief_of_staff"); // @lore AD8a: role string renamed in AD8b
		expect(entry).toBeDefined();
		expect(entry?.category).toBe("individual");
	});
});

// ---------------------------------------------------------------------------
// communityForRole — AC7
// ---------------------------------------------------------------------------

describe("communityForRole", () => {
	it("returns 'building' for builder", () => {
		expect(communityForRole("builder")).toBe("building");
	});

	it("returns 'product' for product_manager", () => {
		expect(communityForRole("product_manager")).toBe("product");
	});

	it("returns 'growth' for growth", () => {
		expect(communityForRole("growth")).toBe("growth");
	});

	it("returns 'ops' for chief_of_staff", () => {
		// @lore AD8a: role string renamed in AD8b
		// @lore AD8a: role string renamed to "assistant" in AD8b
		expect(communityForRole("chief_of_staff")).toBe("ops"); // @lore AD8a: role string renamed in AD8b
	});

	it("returns 'ops' for practice_facilitator", () => {
		expect(communityForRole("practice_facilitator")).toBe("ops");
	});

	it("returns 'growth' for brand_voice", () => {
		expect(communityForRole("brand_voice")).toBe("growth");
	});

	it("returns 'ops' for unknown custom role (fallback)", () => {
		expect(communityForRole("unknown_custom_role")).toBe("ops");
	});

	it("returns 'ops' for empty string (fallback)", () => {
		expect(communityForRole("")).toBe("ops");
	});

	it("returns 'building' for qa_engineer", () => {
		expect(communityForRole("qa_engineer")).toBe("building");
	});
});

// ---------------------------------------------------------------------------
// TEAM_FUNCTIONS — AC3
// ---------------------------------------------------------------------------

describe("TEAM_FUNCTIONS", () => {
	it("is a readonly array of strings", () => {
		expect(Array.isArray(TEAM_FUNCTIONS)).toBe(true);
		for (const f of TEAM_FUNCTIONS) {
			expect(typeof f).toBe("string");
		}
	});

	it("includes development, product, design, marketing", () => {
		expect(TEAM_FUNCTIONS).toContain("development");
		expect(TEAM_FUNCTIONS).toContain("product");
		expect(TEAM_FUNCTIONS).toContain("design");
		expect(TEAM_FUNCTIONS).toContain("marketing");
	});

	it("type annotation: TeamFunction is assignable", () => {
		// Type-level test — if this compiles, the type is correct
		const f: TeamFunction = TEAM_FUNCTIONS[0];
		expect(typeof f).toBe("string");
	});
});

// ---------------------------------------------------------------------------
// defaultRoster — AC3
// ---------------------------------------------------------------------------

describe("defaultRoster", () => {
	it("returns builder and qa_engineer for development", () => {
		const roster = defaultRoster(["development"]);
		expect(roster).toEqual(["builder", "qa_engineer"]);
	});

	it("returns product_manager for product", () => {
		const roster = defaultRoster(["product"]);
		expect(roster).toContain("product_manager");
	});

	it("returns deduplicated union for development + product", () => {
		const roster = defaultRoster(["development", "product"]);
		expect(roster).toContain("builder");
		expect(roster).toContain("qa_engineer");
		expect(roster).toContain("product_manager");
		// No duplicates
		expect(new Set(roster).size).toBe(roster.length);
	});

	it("returns empty array for unknown function", () => {
		expect(defaultRoster(["custom_function"])).toEqual([]);
	});

	it("returns empty array for empty functions array", () => {
		expect(defaultRoster([])).toEqual([]);
	});

	it("results are sorted alphabetically", () => {
		const roster = defaultRoster(["development", "product"]);
		const sorted = [...roster].sort();
		expect(roster).toEqual(sorted);
	});

	it("does not include strategy or individual category agents", () => {
		const roster = defaultRoster(["development", "product", "design", "marketing"]);
		expect(roster).not.toContain("chief_of_staff"); // @lore AD8a: role string renamed in AD8b
		expect(roster).not.toContain("practice_facilitator");
	});
});

// ---------------------------------------------------------------------------
// AGENT_CATEGORIES re-export
// ---------------------------------------------------------------------------

describe("AGENT_CATEGORIES", () => {
	it("has exactly 3 values", () => {
		expect(AGENT_CATEGORIES).toHaveLength(3);
	});

	it("contains team, strategy, individual", () => {
		expect(AGENT_CATEGORIES).toContain("team");
		expect(AGENT_CATEGORIES).toContain("strategy");
		expect(AGENT_CATEGORIES).toContain("individual");
	});

	it("type annotation: AgentCategory is assignable", () => {
		// Type-level test
		const cat: AgentCategory = AGENT_CATEGORIES[0];
		expect(typeof cat).toBe("string");
	});
});
