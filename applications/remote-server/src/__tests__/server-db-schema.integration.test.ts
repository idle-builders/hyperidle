/**
 * The server DB (what createServer migrates) must not contain run-layer tables.
 * Migration 0117 dropped sessions, agent_session_requests, review_sessions,
 * agent_run_config, service_connections, service_connection_withholds, and
 * agent_runner_keys — those belong to the runner process now.
 */

import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { sql } from "drizzle-orm";

const RUN_TABLES = [
	"sessions",
	"agent_session_requests",
	"review_sessions",
	"agent_run_config",
	"service_connections",
	"service_connection_withholds",
	"agent_runner_keys",
] as const;

describe("server DB schema", () => {
	test("run tables are absent from the server DB after migrations", async ({ db }) => {
		const list = RUN_TABLES.map((t) => `'${t}'`).join(", ");
		const result = (await db.execute(
			sql.raw(
				`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN (${list})`,
			),
		)) as { rows: unknown[] };
		expect(result.rows).toHaveLength(0);
	});
});
