/**
 * `agent_run_config` (owned by `layers/agent-orchestration/agent-run-config`) holds an agent's run
 * settings, separate from its `users` identity row: `harness_type` is nullable (falls back to the
 * harness default), and `max_concurrent_sessions` defaults to 1 when not set.
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

describe("agent run config carries harnessType", () => {
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
