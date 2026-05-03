#!/usr/bin/env bun
// Query the local SQLite trace store. Six canned reports plus arbitrary SQL.
//
//   bun run obs:report                      # overall summary (last 24h)
//   bun run obs:report sessions             # list sessions, latest first
//   bun run obs:report session <session-id> # span breakdown for one session
//   bun run obs:report ab <test-id>         # arm-by-arm comparison
//   bun run obs:report tools                # tool-call rollup
//   bun run obs:report models               # per-model token totals
//   bun run obs:report sql "<query>"        # arbitrary SQL against `spans`
//
// Concurrent with a running collector — the DB is in WAL mode.

import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";

const DB_PATH = process.env.HYPERIDLE_TRACE_DB ?? ".pipeline/traces.db";

if (!existsSync(DB_PATH)) {
	console.error(`No trace database at ${DB_PATH}.`);
	console.error("Start the collector first: bun run obs:collector");
	process.exit(1);
}

const db = new Database(DB_PATH, { readonly: true });

function printTable(header: string, items: unknown[]): void {
	console.log(`\n=== ${header} ===`);
	if (items.length === 0) {
		console.log("(no rows)");
		return;
	}
	console.table(items);
}

function query(sql: string, params: Record<string, unknown> = {}): unknown[] {
	return db.prepare(sql).all(params);
}

function summary(): void {
	printTable(
		"Overall (last 24h)",
		query(`
			SELECT
				SUM(CASE WHEN span_type = 'llm_request' THEN 1 ELSE 0 END) AS llm_calls,
				SUM(CASE WHEN span_type LIKE 'tool%' AND span_type != 'tool.blocked_on_user' THEN 1 ELSE 0 END) AS tool_calls,
				SUM(input_tokens) AS input_tokens,
				SUM(output_tokens) AS output_tokens,
				SUM(cache_read_tokens) AS cache_read_tokens,
				SUM(cache_creation_tokens) AS cache_creation_tokens,
				ROUND(SUM(duration_ms) / 1000.0, 1) AS total_seconds
			FROM spans
			WHERE ingested_at > datetime('now', '-1 day')
		`),
	);

	printTable(
		"Recent sessions (last 24h)",
		query(`
			SELECT
				session_id,
				datetime(MIN(start_unix_ns) / 1000000000, 'unixepoch') AS started,
				COUNT(*) AS spans,
				SUM(CASE WHEN span_type = 'llm_request' THEN 1 ELSE 0 END) AS llms,
				SUM(input_tokens) AS in_tok,
				SUM(output_tokens) AS out_tok,
				SUM(cache_read_tokens) AS cache_r,
				SUM(cache_creation_tokens) AS cache_w,
				ab_test,
				ab_arm
			FROM spans
			WHERE ingested_at > datetime('now', '-1 day') AND session_id IS NOT NULL
			GROUP BY session_id, ab_test, ab_arm
			ORDER BY started DESC
			LIMIT 20
		`),
	);
}

function sessions(): void {
	printTable(
		"All sessions",
		query(`
			SELECT
				session_id,
				datetime(MIN(start_unix_ns) / 1000000000, 'unixepoch') AS started,
				datetime(MAX(end_unix_ns) / 1000000000, 'unixepoch') AS ended,
				COUNT(*) AS spans,
				ab_test,
				ab_arm
			FROM spans
			WHERE session_id IS NOT NULL
			GROUP BY session_id, ab_test, ab_arm
			ORDER BY started DESC
			LIMIT 50
		`),
	);
}

function session(id: string): void {
	printTable(
		`Session ${id} — totals`,
		query(
			`
			SELECT
				SUM(CASE WHEN span_type = 'llm_request' THEN 1 ELSE 0 END) AS llm_calls,
				SUM(CASE WHEN span_type LIKE 'tool%' AND span_type != 'tool.blocked_on_user' THEN 1 ELSE 0 END) AS tool_calls,
				SUM(input_tokens) AS input_tokens,
				SUM(output_tokens) AS output_tokens,
				SUM(cache_read_tokens) AS cache_read_tokens,
				SUM(cache_creation_tokens) AS cache_creation_tokens,
				ROUND(SUM(duration_ms) / 1000.0, 1) AS total_seconds
			FROM spans WHERE session_id = $id
		`,
			{ $id: id },
		),
	);
	printTable(
		`Session ${id} — by span type`,
		query(
			`
			SELECT
				span_type,
				COUNT(*) AS n,
				SUM(input_tokens) AS in_tok,
				SUM(output_tokens) AS out_tok,
				SUM(cache_read_tokens) AS cache_r,
				SUM(cache_creation_tokens) AS cache_w,
				ROUND(SUM(duration_ms), 1) AS total_ms
			FROM spans WHERE session_id = $id
			GROUP BY span_type
			ORDER BY total_ms DESC NULLS LAST
		`,
			{ $id: id },
		),
	);
	printTable(
		`Session ${id} — top 10 tools`,
		query(
			`
			SELECT
				tool_name,
				COUNT(*) AS calls,
				ROUND(SUM(duration_ms), 1) AS total_ms
			FROM spans
			WHERE session_id = $id AND tool_name IS NOT NULL
			GROUP BY tool_name
			ORDER BY calls DESC
			LIMIT 10
		`,
			{ $id: id },
		),
	);
}

function ab(testId: string): void {
	printTable(
		`A/B comparison: ab.test=${testId}`,
		query(
			`
			SELECT
				ab_arm AS arm,
				COUNT(DISTINCT session_id) AS sessions,
				SUM(CASE WHEN span_type = 'llm_request' THEN 1 ELSE 0 END) AS llm_calls,
				SUM(CASE WHEN span_type LIKE 'tool%' AND span_type != 'tool.blocked_on_user' THEN 1 ELSE 0 END) AS tool_calls,
				SUM(input_tokens) AS input_tok,
				SUM(output_tokens) AS output_tok,
				SUM(cache_read_tokens) AS cache_r_tok,
				SUM(cache_creation_tokens) AS cache_w_tok,
				ROUND(SUM(duration_ms) / 1000.0, 1) AS total_seconds
			FROM spans
			WHERE ab_test = $test
			GROUP BY ab_arm
			ORDER BY ab_arm
		`,
			{ $test: testId },
		),
	);
}

function tools(): void {
	printTable(
		"Tool-call rollup (last 24h)",
		query(`
			SELECT
				tool_name,
				COUNT(*) AS calls,
				ROUND(AVG(duration_ms), 1) AS avg_ms,
				ROUND(SUM(duration_ms), 1) AS total_ms
			FROM spans
			WHERE ingested_at > datetime('now', '-1 day')
				AND span_type = 'tool'
				AND tool_name IS NOT NULL
			GROUP BY tool_name
			ORDER BY calls DESC
		`),
	);
}

function models(): void {
	printTable(
		"Per-model totals (last 24h)",
		query(`
			SELECT
				model,
				COUNT(*) AS calls,
				SUM(input_tokens) AS in_tok,
				SUM(output_tokens) AS out_tok,
				SUM(cache_read_tokens) AS cache_r,
				SUM(cache_creation_tokens) AS cache_w,
				ROUND(SUM(duration_ms) / 1000.0, 1) AS total_seconds
			FROM spans
			WHERE ingested_at > datetime('now', '-1 day')
				AND span_type = 'llm_request'
				AND model IS NOT NULL
			GROUP BY model
			ORDER BY calls DESC
		`),
	);
}

function sqlCmd(q: string): void {
	printTable("SQL", query(q));
}

const [, , cmd, ...rest] = process.argv;
switch (cmd) {
	case undefined:
	case "summary":
		summary();
		break;
	case "sessions":
		sessions();
		break;
	case "session":
		if (!rest[0]) {
			console.error("Usage: bun run obs:report session <session-id>");
			process.exit(2);
		}
		session(rest[0]);
		break;
	case "ab":
		if (!rest[0]) {
			console.error("Usage: bun run obs:report ab <test-id>");
			process.exit(2);
		}
		ab(rest[0]);
		break;
	case "tools":
		tools();
		break;
	case "models":
		models();
		break;
	case "sql":
		if (!rest[0]) {
			console.error('Usage: bun run obs:report sql "<query>"');
			process.exit(2);
		}
		sqlCmd(rest.join(" "));
		break;
	default:
		console.error(`Unknown subcommand: ${cmd}`);
		console.error(
			"Subcommands: summary | sessions | session <id> | ab <test> | tools | models | sql <query>",
		);
		process.exit(2);
}

db.close();
