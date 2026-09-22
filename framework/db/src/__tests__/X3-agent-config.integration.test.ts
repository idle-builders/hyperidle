/**
 * X3 AC-1 — Agent Configuration: DB migration tests.
 *
 * AC-1: the agent run config carries harnessType
 *
 * @lore BA9f: `system_prompt` is no longer one of them. An agent's identity is
 * an `agent_file` document bound to the agent, not a run-config
 * field — how an agent runs and who it is are different things, and only one of
 * them is knowledge. The column is asserted GONE below.
 *
 * @lore `model_tier_preference` is no longer one of them either. It named a
 * model-gateway entry, selected nothing once the gateway went, and never
 * reached the agent's stored value anyway — the durable drain always supplies
 * its own tier. People choose a model per agent instead. Also asserted GONE.
 *
 * @lore AU26 G1 (architecture §D-L): AC-1 asserted these three columns on
 * `users`. They relocated to `agent_run_config` (owned by
 * `layers/agent-orchestration/agent-run-config`) — `users` is the identity
 * record, run config is agent-execution configuration. AC-1's insert cases
 * prove the FK-and-default shape of the new table (an `agent_run_config` row
 * requires its `users` row; `max_concurrent_sessions` defaults to 1).
 *
 * @lore AU29: this file used to also carry AC-2 (system-prompt template
 * resolution — moved to `framework/factory-defaults/src/__tests__/X3-templates.test.ts`,
 * task A, alongside `system-prompt-templates.ts` itself) and AC-3 (existing
 * agents backfilled with systemPrompt — moved to
 * `tools/setup/src/__tests__/X3-agent-config-bootstrap.integration.test.ts`,
 * task D, alongside `factory-bootstrap-runner.ts`). AC-1 is a pure schema/
 * migration assertion, unrelated to either move, and stays here.
 */

import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { sql } from "drizzle-orm";
import type { HyperIdleDb } from "../connection.js";

async function queryRows<T extends Record<string, unknown>>(
	db: HyperIdleDb,
	query: string,
): Promise<T[]> {
	const result = await db.execute(sql.raw(query));
	return (result as { rows: T[] }).rows;
}

describe("X3 AC-1: agent run config carries harnessType", () => {
	test("system_prompt column is gone — the identity is a document, not a column", async ({
		db,
	}) => {
		const rows = await queryRows<{
			columnName: string;
			isNullable: string;
			dataType: string;
		}>(
			db,
			`SELECT column_name AS "columnName", is_nullable AS "isNullable", data_type AS "dataType"
       FROM information_schema.columns
       WHERE table_name = 'agent_run_config' AND table_schema = 'public'
       AND column_name = 'system_prompt'`,
		);
		expect(rows).toHaveLength(0);
	});

	test("harness_type column exists on agent_run_config and is nullable", async ({ db }) => {
		const rows = await queryRows<{
			columnName: string;
			isNullable: string;
			dataType: string;
		}>(
			db,
			`SELECT column_name AS "columnName", is_nullable AS "isNullable", data_type AS "dataType"
       FROM information_schema.columns
       WHERE table_name = 'agent_run_config' AND table_schema = 'public'
       AND column_name = 'harness_type'`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.columnName).toBe("harness_type");
		expect(rows[0]?.isNullable).toBe("YES");
		expect(rows[0]?.dataType).toBe("text");
	});

	// @lore A test here asserted `model_tier_preference` existed and was nullable.
	// The dial is gone (migration 0075), so the claim inverts the same way the
	// `system_prompt` one did.
	test("model_tier_preference column is gone — the tier dial selected nothing", async ({ db }) => {
		const rows = await queryRows<{ columnName: string }>(
			db,
			`SELECT column_name AS "columnName"
       FROM information_schema.columns
       WHERE table_name = 'agent_run_config' AND table_schema = 'public'
       AND column_name = 'model_tier_preference'`,
		);
		expect(rows).toHaveLength(0);
	});

	test("can insert a run-config row with both columns null (null semantics work)", async ({
		db,
	}) => {
		const now = new Date().toISOString();
		await db.execute(
			sql.raw(`
      INSERT INTO users (id, kind, name, role, status, created_at)
      VALUES ('x3-test-agent-null-cols', 'ai', 'Test Agent', 'builder', 'active', '${now}')
    `),
		);
		await db.execute(
			sql.raw(`INSERT INTO agent_run_config (agent_user_id) VALUES ('x3-test-agent-null-cols')`),
		);

		const rows = await queryRows<{
			id: string;
			harnessType: string | null;
			maxConcurrentSessions: number;
		}>(
			db,
			`SELECT agent_user_id AS "id", harness_type AS "harnessType",
              max_concurrent_sessions AS "maxConcurrentSessions"
       FROM agent_run_config WHERE agent_user_id = 'x3-test-agent-null-cols'`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.harnessType).toBeNull();
		// @lore AU26 G1: the one NOT NULL DEFAULT 1 column — its exact pre-move shape on `users`.
		expect(Number(rows[0]?.maxConcurrentSessions)).toBe(1);
	});

	test("can insert a run-config row with harnessType set", async ({ db }) => {
		const now = new Date().toISOString();
		await db.execute(
			sql.raw(`
      INSERT INTO users (id, kind, name, role, status, created_at)
      VALUES ('x3-test-agent-full-cols', 'ai', 'Full Bot', 'builder', 'active', '${now}')
    `),
		);
		await db.execute(
			sql.raw(`
      INSERT INTO agent_run_config (agent_user_id, harness_type)
      VALUES ('x3-test-agent-full-cols', 'claude-code')
    `),
		);

		const rows = await queryRows<{
			harnessType: string | null;
		}>(
			db,
			`SELECT harness_type AS "harnessType"
       FROM agent_run_config WHERE agent_user_id = 'x3-test-agent-full-cols'`,
		);
		expect(rows[0]?.harnessType).toBe("claude-code");
	});
});
