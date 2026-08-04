/**
 * AU26 G1 — migration 0055's forward backfill invariant (architecture §D-L).
 *
 * The invariant under test, quoted from §D-L:
 *
 *   "For every existing `users` row with `kind='ai'`, the migration inserts
 *    exactly one `agent_run_config` row carrying the current column values
 *    verbatim — including `max_concurrent_sessions` (never re-defaulted). For
 *    every existing `teams` row, exactly one `team_run_config_defaults` row,
 *    same rule."
 *
 * This test replays the REAL `drizzle/0055_*.sql` file against a real
 * PGlite instance holding real pre-migration rows. It does not re-declare the
 * backfill: a test that inlined its own copy of the SQL would prove only that
 * the copy is correct.
 *
 * @lore AU26 G1: this file allocates its own PGlite instance instead of using
 * the `@hyperidle/db/test-fixtures` pool. It has to — it reconstructs the
 * pre-0055 column shape with DDL (`DROP TABLE` / `ADD COLUMN`), and the pooled
 * instances are reused across tests via `TRUNCATE`, so a DDL mutation would
 * poison every later test that borrowed the same instance. Same reasoning that
 * keeps `createTestDb` in `seed-then-migrate.integration.test.ts`.
 *
 * @lore AU26 G1: forward-only, by design. There is no down-migration and none
 * is written — `desktop` ships versioned releases against a local PGlite
 * directory, so a user on the new release cannot roll the app back onto the old
 * schema. The mitigation is the smoke against a real populated local DB, not a
 * reverse migration.
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HyperIdleDb } from "../connection.js";
import * as schema from "../schema.js";

const DIRNAME = fileURLToPath(new URL(".", import.meta.url));
const DRIZZLE_DIR = resolve(DIRNAME, "../../drizzle");

/** The 0055 migration file, located by prefix so a rename of its suffix cannot silently skip the test. */
function readMigration0055(): string {
	const file = readdirSync(DRIZZLE_DIR).find((name) => name.startsWith("0055_"));
	if (!file) throw new Error("migration 0055_* not found in packages/db/drizzle");
	return readFileSync(resolve(DRIZZLE_DIR, file), "utf8");
}

/**
 * Put the schema back into its pre-0055 shape: drop the two new tables and
 * restore the 11 columns 0055 removes, with their exact pre-move nullability
 * (`max_concurrent_sessions` is the one NOT NULL DEFAULT 1 column).
 */
const PRE_0055_SHAPE = `
DROP TABLE IF EXISTS "agent_run_config";
DROP TABLE IF EXISTS "team_run_config_defaults";
ALTER TABLE "users" ADD COLUMN "system_prompt" text;
ALTER TABLE "users" ADD COLUMN "system_prompt_path" text;
ALTER TABLE "users" ADD COLUMN "skills" text;
ALTER TABLE "users" ADD COLUMN "harness_type" text;
ALTER TABLE "users" ADD COLUMN "model_tier_preference" text;
ALTER TABLE "users" ADD COLUMN "model_id" text;
ALTER TABLE "users" ADD COLUMN "model_provider" text;
ALTER TABLE "users" ADD COLUMN "max_concurrent_sessions" integer DEFAULT 1 NOT NULL;
ALTER TABLE "teams" ADD COLUMN "default_harness_type" text;
ALTER TABLE "teams" ADD COLUMN "default_model_id" text;
ALTER TABLE "teams" ADD COLUMN "default_model_provider" text;
`;

interface Harness {
	readonly client: PGlite;
	readonly db: HyperIdleDb;
}

let harness: Harness | undefined;

/** Run a read query and return its rows — PGlite's own client, no drizzle typing in the way. */
async function query(client: PGlite, text: string): Promise<readonly Record<string, unknown>[]> {
	const result = await client.query<Record<string, unknown>>(text);
	return result.rows;
}

async function exec(client: PGlite, script: string): Promise<void> {
	for (const statement of script.split(/;\s*\n|--> statement-breakpoint/)) {
		const trimmed = statement.trim().replace(/;$/, "");
		if (trimmed.length === 0) continue;
		await client.exec(trimmed);
	}
}

beforeEach(async () => {
	const client = new PGlite();
	const db = drizzle(client, { schema }) as unknown as HyperIdleDb;
	await migrate(db as never, { migrationsFolder: DRIZZLE_DIR });
	await exec(client, PRE_0055_SHAPE);
	harness = { client, db };
});

afterEach(async () => {
	await harness?.client.close();
	harness = undefined;
});

function requireHarness(): Harness {
	if (!harness) throw new Error("harness not initialised");
	return harness;
}

const NOW = "2026-08-04T00:00:00.000Z";

describe("migration 0055 relocates run config off users and teams, forward-only", () => {
	it("carries every ai agent's run-config columns across verbatim", {
		timeout: 120_000,
	}, async () => {
		const { client } = requireHarness();

		await client.exec(`
			INSERT INTO "users" (id, kind, name, role, status, created_at, agent_category,
				system_prompt, harness_type, model_tier_preference, model_id, model_provider, max_concurrent_sessions)
			VALUES
				('a-custom', 'ai', 'Custom', 'builder', 'idle', '${NOW}', 'team',
				 'custom prompt', 'claude-code', 'reasoning', 'claude-opus-4-8', 'anthropic', 7),
				('a-null', 'ai', 'Null', 'builder', 'active', '${NOW}', 'team',
				 NULL, NULL, NULL, NULL, NULL, 1),
				('a-three', 'ai', 'Three', 'builder', 'active', '${NOW}', 'team',
				 NULL, 'builtin', NULL, 'claude-sonnet-4-6', 'anthropic', 3);
			INSERT INTO "users" (id, kind, name, role, status, created_at, max_concurrent_sessions)
			VALUES ('h-founder', 'human', 'Founder', 'founder', 'active', '${NOW}', 0);
		`);

		await exec(client, readMigration0055());

		const rows = await query(
			client,
			`SELECT agent_user_id, system_prompt, harness_type, model_tier_preference,
			        model_id, model_provider, max_concurrent_sessions
			 FROM agent_run_config ORDER BY agent_user_id`,
		);
		expect(rows).toEqual([
			{
				agent_user_id: "a-custom",
				system_prompt: "custom prompt",
				harness_type: "claude-code",
				model_tier_preference: "reasoning",
				model_id: "claude-opus-4-8",
				model_provider: "anthropic",
				max_concurrent_sessions: 7,
			},
			{
				agent_user_id: "a-null",
				system_prompt: null,
				harness_type: null,
				model_tier_preference: null,
				model_id: null,
				model_provider: null,
				max_concurrent_sessions: 1,
			},
			{
				agent_user_id: "a-three",
				system_prompt: null,
				harness_type: "builtin",
				model_tier_preference: null,
				model_id: "claude-sonnet-4-6",
				model_provider: "anthropic",
				max_concurrent_sessions: 3,
			},
		]);
	});

	it("gives every team exactly one defaults row, values verbatim", {
		timeout: 120_000,
	}, async () => {
		const { client } = requireHarness();

		await client.exec(`
			INSERT INTO "teams" (id, name, phase, created_at, default_harness_type, default_model_id, default_model_provider)
			VALUES
				('t-set', 'Set', 'build', '${NOW}', 'codex', 'claude-sonnet-4-6', 'anthropic'),
				('t-unset', 'Unset', 'build', '${NOW}', NULL, NULL, NULL);
		`);

		await exec(client, readMigration0055());

		const rows = await query(
			client,
			`SELECT team_id, default_harness_type, default_model_id, default_model_provider
			 FROM team_run_config_defaults ORDER BY team_id`,
		);
		expect(rows).toEqual([
			{
				team_id: "t-set",
				default_harness_type: "codex",
				default_model_id: "claude-sonnet-4-6",
				default_model_provider: "anthropic",
			},
			{
				team_id: "t-unset",
				default_harness_type: null,
				default_model_id: null,
				default_model_provider: null,
			},
		]);
	});

	it("drops all 11 relocated + dead columns off users and teams", {
		timeout: 120_000,
	}, async () => {
		const { client } = requireHarness();

		await exec(client, readMigration0055());

		const remaining = await query(
			client,
			`SELECT table_name, column_name FROM information_schema.columns
			 WHERE table_schema = 'public'
			   AND ((table_name = 'users' AND column_name IN
			         ('system_prompt','system_prompt_path','skills','harness_type',
			          'model_tier_preference','model_id','model_provider','max_concurrent_sessions'))
			     OR (table_name = 'teams' AND column_name IN
			         ('default_harness_type','default_model_id','default_model_provider')))`,
		);
		expect(remaining).toEqual([]);
	});

	it("leaves the identity columns kind, status and agent_category on users", {
		timeout: 120_000,
	}, async () => {
		const { client } = requireHarness();

		await exec(client, readMigration0055());

		const kept = await query(
			client,
			`SELECT column_name FROM information_schema.columns
			 WHERE table_schema = 'public' AND table_name = 'users'
			   AND column_name IN ('kind','status','agent_category')
			 ORDER BY column_name`,
		);
		expect(kept).toEqual([
			{ column_name: "agent_category" },
			{ column_name: "kind" },
			{ column_name: "status" },
		]);
	});

	it("writes no agent_run_config row for a human user", { timeout: 120_000 }, async () => {
		const { client } = requireHarness();

		await client.exec(`
			INSERT INTO "users" (id, kind, name, role, status, created_at, max_concurrent_sessions)
			VALUES ('h-only', 'human', 'Founder', 'founder', 'active', '${NOW}', 0);
		`);

		await exec(client, readMigration0055());

		const rows = await query(client, `SELECT agent_user_id FROM agent_run_config`);
		expect(rows).toEqual([]);
	});
});
