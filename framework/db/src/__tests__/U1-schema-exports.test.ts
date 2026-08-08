/**
 * U1 AC6 + AC7 — Zod schema and TypeScript schema exports.
 *
 * @lore U1: "Schema Migration: Products → Teams + Bet Simplification."
 *
 * @lore AU29: extracted from `framework/db/src/__tests__/U1-schema-migration.
 * integration.test.ts` (task D) when the rest of that suite relocated to
 * `tools/setup/src/__tests__/` — these two describe blocks never touched a
 * database (no `{db}` fixture), and need the WHOLE `schema` / `zod-schemas`
 * namespace object (including asserting a symbol is ABSENT), which is legal
 * only as a same-package deep import inside `framework/db` itself (a
 * cross-package namespace import is the `db:schema-ns` one-door surface,
 * forbidden even for tests). A plain unit test, not integration.
 */

import { getTableName } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import * as schema from "../schema.js";
import { teams } from "../schema.js";
import * as zodSchemas from "../zod-schemas.js";

// ---------------------------------------------------------------------------
// AC6: Zod schemas updated — selectTeamMemberSchema, insertTeamMemberSchema exist;
//      selectTeamSchema now maps to the teams (former products) table
// ---------------------------------------------------------------------------

describe("U1 AC6: Zod schemas updated", () => {
	test("selectTeamMemberSchema exists and is a valid Zod schema (replaces old selectTeamSchema)", () => {
		const schemas = zodSchemas as Record<string, unknown>;
		const selectTeamMemberSchema = schemas["selectTeamMemberSchema"] as
			| { parse: unknown; safeParse: unknown }
			| undefined;
		expect(selectTeamMemberSchema).toBeDefined();
		expect(typeof selectTeamMemberSchema?.parse).toBe("function");
	});

	test("insertTeamMemberSchema exists and is a valid Zod schema", () => {
		const schemas = zodSchemas as Record<string, unknown>;
		const insertTeamMemberSchema = schemas["insertTeamMemberSchema"] as
			| { parse: unknown }
			| undefined;
		expect(insertTeamMemberSchema).toBeDefined();
		expect(typeof insertTeamMemberSchema?.parse).toBe("function");
	});

	test("selectTeamSchema now reflects the new teams table (formerly products) shape", () => {
		const { selectTeamSchema } = zodSchemas;
		expect(selectTeamSchema).toBeDefined();

		// The new teams schema should parse a team (formerly product) row
		const valid = selectTeamSchema.safeParse({
			id: "team-1",
			name: "My Team",
			phase: "build",
			briefPath: null,
			architecturePath: null,
			brandPath: null,
			principlesPath: null,
			factoryDbPath: null,
			createdAt: "2025-01-01T00:00:00.000Z",
			// AB0: functions column added to teams table
			functions: null,
			// AV1: primary harness default columns (nullable)
			defaultHarnessType: null,
			defaultModelId: null,
			defaultModelProvider: null,
		});
		expect(valid.success).toBe(true);
	});

	test("insertProductSchema no longer exists (replaced by insertTeamSchema for the domain entity)", () => {
		const schemas = zodSchemas as Record<string, unknown>;
		expect(schemas["insertProductSchema"]).toBeUndefined();
	});

	test("selectProductSchema no longer exists (replaced by selectTeamSchema for the domain entity)", () => {
		const schemas = zodSchemas as Record<string, unknown>;
		expect(schemas["selectProductSchema"]).toBeUndefined();
	});

	test("selectBetSchema reflects new bet columns: description (not pitch), team_id (not product_id)", () => {
		const { selectBetSchema } = zodSchemas;
		expect(selectBetSchema).toBeDefined();

		// Should parse the new bet shape
		const validNewBet = selectBetSchema.safeParse({
			id: "bet-1",
			teamId: "team-1",
			description: "Build feature X",
			appetite: null,
			doneCondition: null,
			hypothesis: null,
			status: "draft",
			revisionLog: null,
			createdAt: "2025-01-01T00:00:00.000Z",
			completedAt: null,
			// atRisk is stored as integer in the DB (0/1), not boolean
			atRisk: 0,
			costAppetiteMinor: null,
			costAppetiteCurrency: null,
			costActualMinor: null,
			costActualCurrency: null,
			tokensActualJson: null,
			// AC1: outcome fields — nullable, default null
			outcomeVerdict: null,
			outcomeSummary: null,
			outcomeRecordedAt: null,
			outcomeRecordedBy: null,
		});
		expect(validNewBet.success).toBe(true);
	});

	test("selectBetSchema rejects old bet shape with pitch and productId", () => {
		const { selectBetSchema } = zodSchemas;

		const oldBetShape = selectBetSchema.safeParse({
			id: "bet-1",
			productId: "prod-1",
			teamId: "team-1",
			pitch: "Build feature X",
			appetite: null,
			doneCondition: null,
			hypothesis: null,
			status: "shaped",
			revisionLog: null,
			createdAt: "2025-01-01T00:00:00.000Z",
			shippedAt: null,
			costAppetiteMinor: null,
			costAppetiteCurrency: null,
			costActualMinor: null,
			costActualCurrency: null,
			tokensActualJson: null,
		});
		// Old shape must fail: no pitch/productId in new schema
		expect(oldBetShape.success).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// AC7: TypeScript types — Team (formerly Product), TeamMember (formerly Team)
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

	test("schema exports teamMembers table (formerly teams)", () => {
		expect((schema as Record<string, unknown>)["teamMembers"]).toBeDefined();
	});

	test("schema does NOT export 'products' table", () => {
		expect((schema as Record<string, unknown>)["products"]).toBeUndefined();
	});

	test("TeamMember type is exported from schema (formerly Team)", () => {
		const teamsTable = (schema as Record<string, unknown>)["teamMembers"];
		expect(teamsTable).toBeDefined();
	});
});
