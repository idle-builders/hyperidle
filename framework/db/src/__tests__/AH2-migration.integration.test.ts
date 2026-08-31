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
 * @lore AH2: This test must FAIL if either backfill UPDATE is missing or
 * narrowly scoped. The H-2 defect was: (a) harness_type never backfilled,
 * (b) model_id backfill excluded claude-code rows. Both gaps are now covered
 * by separate test cases below.
 *
 * @lore AU26 G1 (architecture §D-L): 0055 relocated `harness_type`,
 * `model_tier_preference`, `model_id` and `model_provider` off `users` into
 * `agent_run_config`, so this test can no longer insert legacy rows into the
 * CURRENT `users` shape — 0032's subject columns are not there any more. Two
 * things changed, and both make the test stronger rather than weaker:
 *
 *   1. It reconstructs the genuine **pre-0032** `users` shape with DDL and
 *      replays the REAL `drizzle/0032_wild_nova.sql` file, instead of a
 *      hand-copied pair of UPDATE statements. A test that inlines its own copy
 *      of a migration proves only that the copy is correct.
 *   2. It allocates its own PGlite instance, because the pooled
 *      `@hyperidle/db/test-fixtures` instances are reused between tests via
 *      TRUNCATE — a DDL mutation would poison every later borrower. Same
 *      reasoning as `run-config-relocation-migration.integration.test.ts` and
 *      `seed-then-migrate.integration.test.ts`.
 *
 * What is asserted is unchanged: the shipped 0032 backfill leaves no AI agent
 * unrunnable, and leaves every human user alone.
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

/**
 * The exact three ids migration 0032's backfill writes, read off the migration
 * itself (`model_tier_preference` reasoning→opus, fast→haiku, else sonnet).
 *
 * @lore This used to check membership in `MODEL_CATALOG`, the built-in gateway's
 * four-entry list. That catalogue is gone with the gateway, and checking against
 * it was always the looser assertion: a historical backfill writes exactly what
 * its SQL says, and that is what a test of it should pin.
 */
const BACKFILLED_MODEL_IDS = new Set(["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"]);

function isBackfilledModel(id: string): boolean {
	return BACKFILLED_MODEL_IDS.has(id);
}

import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HyperIdleDb } from "../connection.js";
import * as schema from "../schema.js";

const DIRNAME = fileURLToPath(new URL(".", import.meta.url));
const DRIZZLE_DIR = resolve(DIRNAME, "../../drizzle");

// The registered harness types for this install.
// Matches the AdapterPool's registered adapters in production.
const REGISTERED_HARNESSES = new Set(["builtin", "claude-code"]);

/** The real 0032 migration file, located by prefix so a suffix rename cannot silently skip it. */
function readMigration0032(): string {
	const file = readdirSync(DRIZZLE_DIR).find((name) => name.startsWith("0032_"));
	if (!file) throw new Error("migration 0032_* not found in framework/db/drizzle");
	return readFileSync(resolve(DRIZZLE_DIR, file), "utf8");
}

/**
 * Put `users` back into its pre-0032 shape: `harness_type` and
 * `model_tier_preference` existed (0031 and earlier), `model_id` /
 * `model_provider` did not — 0032 is the migration that adds them.
 * `agent_category` is untouched by both 0032 and 0055 and is already present.
 */
const PRE_0032_SHAPE = `
ALTER TABLE "users" ADD COLUMN "harness_type" text;
ALTER TABLE "users" ADD COLUMN "model_tier_preference" text;
`;

let client: PGlite | undefined;

async function exec(script: string): Promise<void> {
	if (!client) throw new Error("harness not initialised");
	for (const statement of script.split(/;\s*\n|--> statement-breakpoint/)) {
		const trimmed = statement.trim().replace(/;$/, "");
		if (trimmed.length === 0) continue;
		await client.exec(trimmed);
	}
}

async function query<T extends Record<string, unknown>>(text: string): Promise<T[]> {
	if (!client) throw new Error("harness not initialised");
	const result = await client.query<T>(text);
	return [...result.rows];
}

beforeEach(async () => {
	const instance = new PGlite();
	const db = drizzle(instance, { schema }) as unknown as HyperIdleDb;
	await migrate(db as never, { migrationsFolder: DRIZZLE_DIR });
	client = instance;
	await exec(PRE_0032_SHAPE);
});

afterEach(async () => {
	await client?.close();
	client = undefined;
});

/** Replay the shipped 0032 migration file verbatim. */
function run0032Backfill(): Promise<void> {
	return exec(readMigration0032());
}

// ---------------------------------------------------------------------------
// Scenario helpers
// ---------------------------------------------------------------------------

const NOW = new Date().toISOString();

/** Insert a minimal AI agent row in the pre-0032 shape. */
async function insertLegacyAgent(
	id: string,
	{
		harnessType,
		modelTierPreference,
		agentCategory,
	}: {
		harnessType?: string | null;
		modelTierPreference?: string | null;
		agentCategory?: string | null;
	},
): Promise<void> {
	const harness = harnessType === undefined || harnessType === null ? "NULL" : `'${harnessType}'`;
	const tier =
		modelTierPreference === undefined || modelTierPreference === null
			? "NULL"
			: `'${modelTierPreference}'`;
	const category =
		agentCategory === undefined || agentCategory === null ? "NULL" : `'${agentCategory}'`;

	await exec(
		`INSERT INTO "users" (id, kind, name, role, status, created_at, harness_type, model_tier_preference, agent_category)
       VALUES ('${id}', 'ai', '${id}', 'builder', 'active', '${NOW}', ${harness}, ${tier}, ${category})`,
	);
}

interface AgentRow {
	harnessType: string | null;
	modelId: string | null;
	modelProvider: string | null;
}

/** Read a single user row's post-0032 harness/model columns. */
async function readAgent(id: string): Promise<AgentRow> {
	const rows = await query<{
		harness_type: string | null;
		model_id: string | null;
		model_provider: string | null;
	}>(`SELECT harness_type, model_id, model_provider FROM "users" WHERE id = '${id}'`);
	const row = rows[0];
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
	it("null-harness AI agent gets harness_type='builtin' after backfill", async () => {
		// Arrange: legacy onboarding agent — no harness, no model
		await insertLegacyAgent("legacy-null-harness", {
			harnessType: null,
			agentCategory: "strategy",
		});

		// Act: replay the shipped 0032 migration
		await run0032Backfill();

		// Assert
		const row = await readAgent("legacy-null-harness");
		expect(row.harnessType).toBe("builtin");
		expect(REGISTERED_HARNESSES.has(row.harnessType ?? "")).toBe(true);
	});

	it("null-harness AI agent gets a non-null backfilled model_id", async () => {
		await insertLegacyAgent("legacy-null-model", {
			harnessType: null,
			agentCategory: "strategy",
		});

		await run0032Backfill();

		const row = await readAgent("legacy-null-model");
		expect(row.modelId).not.toBeNull();
		expect(isBackfilledModel(row.modelId ?? "")).toBe(true);
		expect(row.modelProvider).not.toBeNull();
	});

	it("builtin-harness AI agent (already set) keeps harness_type and gets model after backfill", async () => {
		await insertLegacyAgent("legacy-builtin", {
			harnessType: "builtin",
			agentCategory: "kernel",
		});

		await run0032Backfill();

		const row = await readAgent("legacy-builtin");
		expect(row.harnessType).toBe("builtin");
		expect(row.modelId).not.toBeNull();
		expect(isBackfilledModel(row.modelId ?? "")).toBe(true);
	});

	it("claude-code-harness AI agent gets model_id after backfill (H-2b: previously excluded)", async () => {
		// This is the H-2b defect scenario: the old WHERE clause was
		// "harness_type IS NULL OR harness_type = 'builtin'" which excluded
		// claude-code rows, leaving them with null model_id.
		await insertLegacyAgent("legacy-claude-code", {
			harnessType: "claude-code",
			agentCategory: "individual",
		});

		await run0032Backfill();

		const row = await readAgent("legacy-claude-code");
		// harness_type must not be changed (already set)
		expect(row.harnessType).toBe("claude-code");
		// model_id must now be non-null and catalog-valid
		expect(row.modelId).not.toBeNull();
		expect(isBackfilledModel(row.modelId ?? "")).toBe(true);
		expect(row.modelProvider).not.toBeNull();
	});

	it("reasoning-tier agent gets claude-opus-4-8 after backfill", async () => {
		await insertLegacyAgent("legacy-reasoning", {
			harnessType: null,
			modelTierPreference: "reasoning",
			agentCategory: "strategy",
		});

		await run0032Backfill();

		const row = await readAgent("legacy-reasoning");
		expect(row.modelId).toBe("claude-opus-4-8");
	});

	it("fast-tier agent gets claude-haiku-4-5 after backfill", async () => {
		await insertLegacyAgent("legacy-fast", {
			harnessType: null,
			modelTierPreference: "fast",
			agentCategory: "individual",
		});

		await run0032Backfill();

		const row = await readAgent("legacy-fast");
		expect(row.modelId).toBe("claude-haiku-4-5");
	});

	it("null-tier agent gets workhorse default (claude-sonnet-4-6) after backfill", async () => {
		await insertLegacyAgent("legacy-null-tier", {
			harnessType: null,
			modelTierPreference: null,
			agentCategory: "individual",
		});

		await run0032Backfill();

		const row = await readAgent("legacy-null-tier");
		expect(row.modelId).toBe("claude-sonnet-4-6");
	});

	it("human user (agent_category IS NULL) is untouched by backfill", async () => {
		// Arrange: human user — no agent_category, no harness, no model
		await exec(
			`INSERT INTO "users" (id, kind, name, role, status, created_at, harness_type, agent_category)
         VALUES ('human-user', 'human', 'Alice', 'founder', 'active', '${NOW}', NULL, NULL)`,
		);

		await run0032Backfill();

		const row = await readAgent("human-user");

		// Human users must NOT be touched
		expect(row.harnessType).toBeNull();
		expect(row.modelId).toBeNull();
		expect(row.modelProvider).toBeNull();
	});

	it("mixed legacy batch: all AI agents end with registered harness and catalog model", async () => {
		// Insert a batch covering every legacy scenario
		const scenarios = [
			{ id: "batch-null-null", harnessType: null as string | null, agentCategory: "strategy" },
			{
				id: "batch-builtin-null",
				harnessType: "builtin" as string | null,
				agentCategory: "kernel",
			},
			{
				id: "batch-claude-code-null",
				harnessType: "claude-code" as string | null,
				agentCategory: "individual",
			},
		];

		for (const s of scenarios) {
			await insertLegacyAgent(s.id, {
				harnessType: s.harnessType,
				agentCategory: s.agentCategory,
			});
		}

		await run0032Backfill();

		for (const s of scenarios) {
			const row = await readAgent(s.id);
			expect(row.harnessType, `${s.id}: harness_type must be non-null`).not.toBeNull();
			expect(
				REGISTERED_HARNESSES.has(row.harnessType ?? ""),
				`${s.id}: harness_type '${row.harnessType}' must be a registered harness`,
			).toBe(true);
			expect(row.modelId, `${s.id}: model_id must be non-null`).not.toBeNull();
			expect(
				isBackfilledModel(row.modelId ?? ""),
				`${s.id}: model_id '${row.modelId}' must be one the 0032 backfill writes`,
			).toBe(true);
			expect(row.modelProvider, `${s.id}: model_provider must be non-null`).not.toBeNull();
		}
	});

	it("backfills null-harness rows with the harness that migration actually wrote", async () => {
		// A historical fact about migration 0032, asserted as the literal it wrote.
		// It used to be compared against a live `DEFAULT_AGENT_HARNESS` constant,
		// which tied a past migration's behaviour to a value the product is still
		// free to change — and the product has since stopped naming a default
		// harness at all.
		await insertLegacyAgent("default-harness-check", {
			harnessType: null,
			agentCategory: "strategy",
		});

		await run0032Backfill();

		const row = await readAgent("default-harness-check");
		expect(row.harnessType).toBe("builtin");
	});
});
