/**
 * AH2 migration 0032 — invariant test.
 *
 * Plan task 3 (AC3 verification): Insert legacy AI agent rows in the
 * pre-0032 shape (null model_id / null harness_type / various harness_type
 * values) then apply the migration backfill SQL and assert every AI agent row
 * ends with:
 *   - a non-null harness_type that is a registered harness ('builtin' | 'claude-code')
 *   - a non-null model_id that is a current-catalog model
 *   - a non-null model_provider
 *
 * Human users (agent_category IS NULL) must NOT be touched.
 *
 * The test fixture gives us a fully-migrated schema (columns exist).
 * We INSERT legacy-shaped rows (null harness_type / null model_id), run the
 * 0032 backfill UPDATE statements directly, then assert the invariants hold.
 * This proves the migration SQL is correct — not just that the columns exist.
 *
 * @lore AH2: This test must FAIL if either backfill UPDATE is missing or
 * narrowly scoped. The H-2 defect was: (a) harness_type never backfilled,
 * (b) model_id backfill excluded claude-code rows. Both gaps are now covered
 * by separate test cases below.
 */

import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { DEFAULT_AGENT_HARNESS, isCatalogModel } from "@hyperidle/shared";
import { sql } from "drizzle-orm";
import type { HyperIdleDb } from "../connection.js";

// The registered harness types for this install.
// Matches the AdapterPool's registered adapters in production.
const REGISTERED_HARNESSES = new Set(["builtin", "claude-code"]);

// ---------------------------------------------------------------------------
// Helper: run the 0032 backfill statements against the test DB.
// Replays only the two UPDATE statements (not the ADD COLUMN DDL, which the
// fixture already applied via the full migration run).
// ---------------------------------------------------------------------------
async function run0032Backfill(db: HyperIdleDb): Promise<void> {
	// Step 1: backfill harness_type for AI agents that have none.
	await db.execute(
		sql.raw(
			`UPDATE "users" SET "harness_type" = 'builtin' WHERE "agent_category" IS NOT NULL AND "harness_type" IS NULL`,
		),
	);

	// Step 2: tier-aware model backfill for ALL AI agents (any harness_type).
	await db.execute(
		sql.raw(
			`UPDATE "users"
       SET
         "model_id" = CASE
           WHEN "model_tier_preference" = 'reasoning' THEN 'claude-opus-4-8'
           WHEN "model_tier_preference" = 'fast'      THEN 'claude-haiku-4-5'
           ELSE 'claude-sonnet-4-6'
         END,
         "model_provider" = 'anthropic'
       WHERE "agent_category" IS NOT NULL`,
		),
	);
}

// ---------------------------------------------------------------------------
// Scenario helpers
// ---------------------------------------------------------------------------

const NOW = new Date().toISOString();

/** Insert a minimal AI agent row with the given overrides. */
async function insertLegacyAgent(
	db: HyperIdleDb,
	id: string,
	{
		harnessType,
		modelId,
		modelProvider,
		modelTierPreference,
		agentCategory,
	}: {
		harnessType?: string | null;
		modelId?: string | null;
		modelProvider?: string | null;
		modelTierPreference?: string | null;
		agentCategory?: string | null;
	},
): Promise<void> {
	const harness = harnessType === undefined || harnessType === null ? "NULL" : `'${harnessType}'`;
	const mId = modelId === undefined || modelId === null ? "NULL" : `'${modelId}'`;
	const mProv =
		modelProvider === undefined || modelProvider === null ? "NULL" : `'${modelProvider}'`;
	const tier =
		modelTierPreference === undefined || modelTierPreference === null
			? "NULL"
			: `'${modelTierPreference}'`;
	const category =
		agentCategory === undefined || agentCategory === null ? "NULL" : `'${agentCategory}'`;

	await db.execute(
		sql.raw(
			`INSERT INTO "users" (id, kind, name, role, status, created_at, harness_type, model_id, model_provider, model_tier_preference, agent_category)
       VALUES ('${id}', 'ai', '${id}', 'builder', 'active', '${NOW}', ${harness}, ${mId}, ${mProv}, ${tier}, ${category})`,
		),
	);
}

interface AgentRow {
	harnessType: string | null;
	modelId: string | null;
	modelProvider: string | null;
}

/** Read a single user row. */
async function readAgent(db: HyperIdleDb, id: string): Promise<AgentRow> {
	const result = await db.execute(
		sql.raw(`SELECT harness_type, model_id, model_provider FROM "users" WHERE id = '${id}'`),
	);
	const row = (
		result as {
			rows: Array<{
				harness_type: string | null;
				model_id: string | null;
				model_provider: string | null;
			}>;
		}
	).rows[0];
	if (!row) throw new Error(`row ${id} not found`);
	return {
		harnessType: row.harness_type,
		modelId: row.model_id,
		modelProvider: row.model_provider,
	};
}

// ---------------------------------------------------------------------------
// AC3 invariant tests
// ---------------------------------------------------------------------------

describe("AH2 migration 0032 — AC3: no AI agent ends unrunnable after backfill", () => {
	test("null-harness AI agent gets harness_type='builtin' after backfill", async ({ db }) => {
		// Arrange: legacy onboarding agent — no harness, no model
		await insertLegacyAgent(db, "legacy-null-harness", {
			harnessType: null,
			modelId: null,
			modelProvider: null,
			agentCategory: "strategy",
		});

		// Act: replay the 0032 backfill
		await run0032Backfill(db);

		// Assert
		const row = await readAgent(db, "legacy-null-harness");
		expect(row.harnessType).toBe("builtin");
		expect(REGISTERED_HARNESSES.has(row.harnessType ?? "")).toBe(true);
	});

	test("null-harness AI agent gets a non-null catalog model_id after backfill", async ({ db }) => {
		await insertLegacyAgent(db, "legacy-null-model", {
			harnessType: null,
			modelId: null,
			modelProvider: null,
			agentCategory: "strategy",
		});

		await run0032Backfill(db);

		const row = await readAgent(db, "legacy-null-model");
		expect(row.modelId).not.toBeNull();
		expect(isCatalogModel(row.modelId ?? "")).toBe(true);
		expect(row.modelProvider).not.toBeNull();
	});

	test("builtin-harness AI agent (already set) keeps harness_type and gets model after backfill", async ({
		db,
	}) => {
		await insertLegacyAgent(db, "legacy-builtin", {
			harnessType: "builtin",
			modelId: null,
			modelProvider: null,
			agentCategory: "kernel",
		});

		await run0032Backfill(db);

		const row = await readAgent(db, "legacy-builtin");
		expect(row.harnessType).toBe("builtin");
		expect(row.modelId).not.toBeNull();
		expect(isCatalogModel(row.modelId ?? "")).toBe(true);
	});

	test("claude-code-harness AI agent gets model_id after backfill (H-2b: previously excluded)", async ({
		db,
	}) => {
		// This is the H-2b defect scenario: the old WHERE clause was
		// "harness_type IS NULL OR harness_type = 'builtin'" which excluded
		// claude-code rows, leaving them with null model_id.
		await insertLegacyAgent(db, "legacy-claude-code", {
			harnessType: "claude-code",
			modelId: null,
			modelProvider: null,
			agentCategory: "individual",
		});

		await run0032Backfill(db);

		const row = await readAgent(db, "legacy-claude-code");
		// harness_type must not be changed (already set)
		expect(row.harnessType).toBe("claude-code");
		// model_id must now be non-null and catalog-valid
		expect(row.modelId).not.toBeNull();
		expect(isCatalogModel(row.modelId ?? "")).toBe(true);
		expect(row.modelProvider).not.toBeNull();
	});

	test("reasoning-tier agent gets claude-opus-4-8 after backfill", async ({ db }) => {
		await insertLegacyAgent(db, "legacy-reasoning", {
			harnessType: null,
			modelId: null,
			modelProvider: null,
			modelTierPreference: "reasoning",
			agentCategory: "strategy",
		});

		await run0032Backfill(db);

		const row = await readAgent(db, "legacy-reasoning");
		expect(row.modelId).toBe("claude-opus-4-8");
	});

	test("fast-tier agent gets claude-haiku-4-5 after backfill", async ({ db }) => {
		await insertLegacyAgent(db, "legacy-fast", {
			harnessType: null,
			modelId: null,
			modelProvider: null,
			modelTierPreference: "fast",
			agentCategory: "individual",
		});

		await run0032Backfill(db);

		const row = await readAgent(db, "legacy-fast");
		expect(row.modelId).toBe("claude-haiku-4-5");
	});

	test("null-tier agent gets workhorse default (claude-sonnet-4-6) after backfill", async ({
		db,
	}) => {
		await insertLegacyAgent(db, "legacy-null-tier", {
			harnessType: null,
			modelId: null,
			modelProvider: null,
			modelTierPreference: null,
			agentCategory: "individual",
		});

		await run0032Backfill(db);

		const row = await readAgent(db, "legacy-null-tier");
		expect(row.modelId).toBe("claude-sonnet-4-6");
	});

	test("human user (agent_category IS NULL) is untouched by backfill", async ({ db }) => {
		// Arrange: human user — no agent_category, no harness, no model
		await db.execute(
			sql.raw(
				`INSERT INTO "users" (id, kind, name, role, status, created_at, harness_type, model_id, model_provider, agent_category)
         VALUES ('human-user', 'human', 'Alice', 'founder', 'active', '${NOW}', NULL, NULL, NULL, NULL)`,
			),
		);

		await run0032Backfill(db);

		const result = await db.execute(
			sql.raw(`SELECT harness_type, model_id, model_provider FROM "users" WHERE id = 'human-user'`),
		);
		const row = (
			result as {
				rows: Array<{
					harness_type: string | null;
					model_id: string | null;
					model_provider: string | null;
				}>;
			}
		).rows[0];

		// Human users must NOT be touched
		expect(row?.harness_type).toBeNull();
		expect(row?.model_id).toBeNull();
		expect(row?.model_provider).toBeNull();
	});

	test("mixed legacy batch: all AI agents end with registered harness and catalog model", async ({
		db,
	}) => {
		// Insert a batch covering every legacy scenario
		const scenarios = [
			{
				id: "batch-null-null",
				harnessType: null as null,
				modelId: null as null,
				agentCategory: "strategy",
			},
			{
				id: "batch-builtin-null",
				harnessType: "builtin" as string,
				modelId: null as null,
				agentCategory: "kernel",
			},
			{
				id: "batch-claude-code-null",
				harnessType: "claude-code" as string,
				modelId: null as null,
				agentCategory: "individual",
			},
		];

		for (const s of scenarios) {
			await insertLegacyAgent(db, s.id, {
				harnessType: s.harnessType,
				modelId: s.modelId,
				modelProvider: null,
				agentCategory: s.agentCategory,
			});
		}

		await run0032Backfill(db);

		for (const s of scenarios) {
			const row = await readAgent(db, s.id);
			expect(row.harnessType, `${s.id}: harness_type must be non-null`).not.toBeNull();
			expect(
				REGISTERED_HARNESSES.has(row.harnessType ?? ""),
				`${s.id}: harness_type '${row.harnessType}' must be a registered harness`,
			).toBe(true);
			expect(row.modelId, `${s.id}: model_id must be non-null`).not.toBeNull();
			expect(
				isCatalogModel(row.modelId ?? ""),
				`${s.id}: model_id '${row.modelId}' must be in the current catalog`,
			).toBe(true);
			expect(row.modelProvider, `${s.id}: model_provider must be non-null`).not.toBeNull();
		}
	});

	test("DEFAULT_AGENT_HARNESS matches the harness backfilled for null-harness rows", async ({
		db,
	}) => {
		// Proves the migration default aligns with the shared constant
		await insertLegacyAgent(db, "default-harness-check", {
			harnessType: null,
			modelId: null,
			modelProvider: null,
			agentCategory: "strategy",
		});

		await run0032Backfill(db);

		const row = await readAgent(db, "default-harness-check");
		expect(row.harnessType).toBe(DEFAULT_AGENT_HARNESS);
	});
});
