/**
 * U1 AC7 — TypeScript schema exports.
 *
 * @lore U1: "Schema Migration: Products → Teams + Bet Simplification."
 *
 * @lore AU29: extracted from `framework/db/src/__tests__/U1-schema-migration.
 * integration.test.ts` (task D) when the rest of that suite relocated to
 * `tools/setup/src/__tests__/` — the AC7 describe block never touched a
 * database (no `{db}` fixture). A plain unit test, not integration.
 *
 * @lore AU43: AC6 (Zod schema exports) deleted — zod-schemas.ts removed in
 * the AU20 delete pass (bundle 1). The zod schemas had zero production importers.
 */

import { getTableName } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import * as schema from "../schema.js";
import { teams } from "../schema.js";

// ---------------------------------------------------------------------------
// AC7: TypeScript types — Team (formerly Product); teamMembers dissolved (AU44)
// ---------------------------------------------------------------------------

describe("U1 AC7: TypeScript type exports updated", () => {
	test("schema exports Team type (the domain entity, formerly Product)", () => {
		expect(teams).toBeDefined();

		// The teams table should have "teams" as its backing SQL table name
		// @lore U1: In Drizzle 0.39+, the `_` property is a TypeScript-only type
		// accessor (not a runtime property). The SQL table name is stored as
		// Symbol(drizzle:Name). Use getTableName from drizzle-orm to access it.
		expect(getTableName(teams)).toBe("teams");
	});

	// @lore AU44 B1: teamMembers was dissolved into teams — capacity, activeBets,
	// formedAt columns moved to teams; users.teamId now references teams.id directly.
	test("schema does NOT export teamMembers table (dissolved in AU44)", () => {
		expect((schema as Record<string, unknown>)["teamMembers"]).toBeUndefined();
	});

	test("schema does NOT export 'products' table", () => {
		expect((schema as Record<string, unknown>)["products"]).toBeUndefined();
	});
});
