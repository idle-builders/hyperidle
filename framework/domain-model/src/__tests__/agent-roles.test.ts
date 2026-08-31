/**
 * AB0 — Agent Roles: unit tests (RED phase)
 *
 * AC2: AGENT_ROLE_CATALOG carries the role vocabulary with required fields
 * AC3: communityForRole() behaves correctly
 *
 * @lore BA9g: `TEAM_FUNCTIONS` and `defaultRoster()` are gone — a team no longer
 * arrives with a roster derived from its functions. The catalog stays as
 * VOCABULARY (a plugin agent declares `role: "builder"`, `roleLabel` renders it,
 * `communityForRole` scopes a session's knowledge); `teamFunctions` and
 * `hasTemplate` went with the roster. The count gained `agent`, the neutral role
 * a new team's one agent carries.
 * AC7: communityForRole() replaces ROLE_TO_COMMUNITY record
 */

import { describe, expect, it } from "vitest";
import { AGENT_CATEGORIES, type AgentCategory, roleLabel } from "../agent-roles.js";

// ---------------------------------------------------------------------------
// AGENT_ROLE_CATALOG — AC2
// ---------------------------------------------------------------------------

// @lore BA9g: the `AGENT_ROLE_CATALOG` block is gone with the catalog. A role is
// a string on an agent now — the roles in use are the distinct roles among the
// agents you can see, and `roleLabel` derives a display name from any string, so
// nothing needs a registry to render. Introducing a role is creating an agent
// with it (`BA9g-roles-are-data.integration.test.ts`).

// ---------------------------------------------------------------------------
// findRoleCatalogEntry
// ---------------------------------------------------------------------------

// @lore BA9g: the `findRoleCatalogEntry` and `communityForRole` blocks are gone
// with the functions. There is no catalog to look a role up in — a role is a
// string on an agent — and the practice an agent belongs to is its role, so
// there is no mapping left to assert. `roleLabel` below is what survives: it
// derives a display name from any string, which is all rendering ever needed.
describe("AGENT_CATEGORIES", () => {
	it("has exactly 2 values (strategy removed in BA9d)", () => {
		expect(AGENT_CATEGORIES).toHaveLength(2);
	});

	it("contains team and individual only", () => {
		expect(AGENT_CATEGORIES).toContain("team");
		expect(AGENT_CATEGORIES).toContain("individual");
		expect(AGENT_CATEGORIES).not.toContain("strategy");
	});

	it("type annotation: AgentCategory is assignable", () => {
		// Type-level test
		const cat: AgentCategory = AGENT_CATEGORIES[0];
		expect(typeof cat).toBe("string");
	});
});

// ---------------------------------------------------------------------------
// roleLabel — AV3 amendment A1
// ---------------------------------------------------------------------------

describe("roleLabel", () => {
	it("known role → catalog label (product_manager → 'Product Manager')", () => {
		expect(roleLabel("product_manager")).toBe("Product Manager");
	});

	it("known role → catalog label (builder → 'Builder')", () => {
		expect(roleLabel("builder")).toBe("Builder");
	});

	it("known role → catalog label (facilitator → 'Facilitator')", () => {
		expect(roleLabel("facilitator")).toBe("Facilitator");
	});

	it("unknown underscore role → title-cased (growth_hacker → 'Growth Hacker')", () => {
		expect(roleLabel("growth_hacker")).toBe("Growth Hacker");
	});

	it("unknown hyphen role → title-cased (data-engineer → 'Data Engineer')", () => {
		expect(roleLabel("data-engineer")).toBe("Data Engineer");
	});

	it("unknown single-word role → title-cased (founder → 'Founder')", () => {
		expect(roleLabel("founder")).toBe("Founder");
	});

	it("unknown mixed-separator role → title-cased (senior_product manager → 'Senior Product Manager')", () => {
		expect(roleLabel("senior_product manager")).toBe("Senior Product Manager");
	});

	it("empty string → returns ''", () => {
		expect(roleLabel("")).toBe("");
	});

	it("whitespace-only → returns ''", () => {
		expect(roleLabel("   ")).toBe("");
	});
});
