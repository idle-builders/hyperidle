#!/usr/bin/env bun
// DuckDB-backed query layer over the JSONL the collector writes. Each
// invocation spins an in-memory DuckDB, points read_json_auto at the
// JSONL file, and runs the requested report.
//
//   bun run obs:report                       # overall summary (last 24h)
//   bun run obs:report sessions              # list sessions, latest first
//   bun run obs:report session <session-id>  # span breakdown for one session
//   bun run obs:report ab <test-id>          # arm-by-arm comparison
//   bun run obs:report tools                 # tool-call rollup
//   bun run obs:report models                # per-model token totals
//   bun run obs:report sql "<query>"         # arbitrary SQL against `spans` view
//
// Concurrent with a running collector — JSONL is append-only so DuckDB
// reads happily without locking anything.

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";

const TRACE_FILE = resolve(process.env.HYPERIDLE_TRACE_FILE ?? ".pipeline/traces.jsonl");

if (!existsSync(TRACE_FILE)) {
	console.error(`No trace file at ${TRACE_FILE}.`);
	console.error("Start the collector first: bun run obs:collector");
	process.exit(1);
}

const instance = await DuckDBInstance.create(":memory:");
const conn = await instance.connect();

// One source of truth: a view that lets DuckDB infer the schema from the
// JSONL on every query. The maximum_object_size keeps the JSON column
// inferred as STRUCT, not VARCHAR.
const TRACE_FILE_SQL = TRACE_FILE.replace(/'/g, "''");
await conn.run(
	`CREATE OR REPLACE VIEW spans AS
	 SELECT * FROM read_json_auto('${TRACE_FILE_SQL}', format='newline_delimited', maximum_object_size=33554432)`,
);

async function rows(sql: string): Promise<Record<string, unknown>[]> {
	const result = await conn.runAndReadAll(sql);
	return result.getRowObjectsJson() as Record<string, unknown>[];
}

function printTable(header: string, items: Record<string, unknown>[]): void {
	console.log(`\n=== ${header} ===`);
	if (items.length === 0) {
		console.log("(no rows)");
		return;
	}
	console.table(items);
}

async function summary(): Promise<void> {
	printTable(
		"Overall (last 24h)",
		await rows(`
			SELECT
				COUNT(*) FILTER (WHERE span_type = 'llm_request') AS llm_calls,
				COUNT(*) FILTER (WHERE span_type LIKE 'tool%' AND span_type != 'tool.blocked_on_user') AS tool_calls,
				SUM(input_tokens) AS input_tokens,
				SUM(output_tokens) AS output_tokens,
				SUM(cache_read_tokens) AS cache_read_tokens,
				SUM(cache_creation_tokens) AS cache_creation_tokens,
				ROUND(SUM(duration_ms) / 1000.0, 1) AS total_seconds
			FROM spans
			WHERE CAST(ingested_at AS TIMESTAMP) > now() - INTERVAL 1 DAY
		`),
	);

	printTable(
		"Recent sessions (last 24h)",
		await rows(`
			SELECT
				session_id,
				to_timestamp(MIN(start_unix_ns) / 1e9) AS started,
				COUNT(*) AS spans,
				COUNT(*) FILTER (WHERE span_type = 'llm_request') AS llms,
				SUM(input_tokens) AS in_tok,
				SUM(output_tokens) AS out_tok,
				SUM(cache_read_tokens) AS cache_r,
				SUM(cache_creation_tokens) AS cache_w,
				ab_test,
				ab_arm
			FROM spans
			WHERE CAST(ingested_at AS TIMESTAMP) > now() - INTERVAL 1 DAY
				AND session_id IS NOT NULL
			GROUP BY session_id, ab_test, ab_arm
			ORDER BY started DESC
			LIMIT 20
		`),
	);
}

async function sessions(): Promise<void> {
	printTable(
		"All sessions",
		await rows(`
			SELECT
				session_id,
				to_timestamp(MIN(start_unix_ns) / 1e9) AS started,
				to_timestamp(MAX(end_unix_ns) / 1e9) AS ended,
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

async function session(id: string): Promise<void> {
	const idLit = `'${id.replace(/'/g, "''")}'`;
	printTable(
		`Session ${id} — totals`,
		await rows(`
			SELECT
				COUNT(*) FILTER (WHERE span_type = 'llm_request') AS llm_calls,
				COUNT(*) FILTER (WHERE span_type LIKE 'tool%' AND span_type != 'tool.blocked_on_user') AS tool_calls,
				SUM(input_tokens) AS input_tokens,
				SUM(output_tokens) AS output_tokens,
				SUM(cache_read_tokens) AS cache_read_tokens,
				SUM(cache_creation_tokens) AS cache_creation_tokens,
				ROUND(SUM(duration_ms) / 1000.0, 1) AS total_seconds
			FROM spans WHERE session_id = ${idLit}
		`),
	);
	printTable(
		`Session ${id} — by span type`,
		await rows(`
			SELECT
				span_type,
				COUNT(*) AS n,
				SUM(input_tokens) AS in_tok,
				SUM(output_tokens) AS out_tok,
				SUM(cache_read_tokens) AS cache_r,
				SUM(cache_creation_tokens) AS cache_w,
				ROUND(SUM(duration_ms), 1) AS total_ms
			FROM spans WHERE session_id = ${idLit}
			GROUP BY span_type
			ORDER BY total_ms DESC NULLS LAST
		`),
	);
	printTable(
		`Session ${id} — top 10 tools`,
		await rows(`
			SELECT
				tool_name,
				COUNT(*) AS calls,
				ROUND(SUM(duration_ms), 1) AS total_ms
			FROM spans
			WHERE session_id = ${idLit} AND tool_name IS NOT NULL
			GROUP BY tool_name
			ORDER BY calls DESC
			LIMIT 10
		`),
	);
}

async function ab(testId: string): Promise<void> {
	const idLit = `'${testId.replace(/'/g, "''")}'`;
	printTable(
		`A/B comparison: ab.test=${testId}`,
		await rows(`
			SELECT
				ab_arm AS arm,
				COUNT(DISTINCT session_id) AS sessions,
				COUNT(*) FILTER (WHERE span_type = 'llm_request') AS llm_calls,
				COUNT(*) FILTER (WHERE span_type LIKE 'tool%' AND span_type != 'tool.blocked_on_user') AS tool_calls,
				SUM(input_tokens) AS input_tok,
				SUM(output_tokens) AS output_tok,
				SUM(cache_read_tokens) AS cache_r_tok,
				SUM(cache_creation_tokens) AS cache_w_tok,
				ROUND(SUM(duration_ms) / 1000.0, 1) AS total_seconds
			FROM spans
			WHERE ab_test = ${idLit}
			GROUP BY ab_arm
			ORDER BY ab_arm
		`),
	);
}

async function tools(): Promise<void> {
	printTable(
		"Tool-call rollup (last 24h)",
		await rows(`
			SELECT
				tool_name,
				COUNT(*) AS calls,
				ROUND(AVG(duration_ms), 1) AS avg_ms,
				ROUND(SUM(duration_ms), 1) AS total_ms
			FROM spans
			WHERE CAST(ingested_at AS TIMESTAMP) > now() - INTERVAL 1 DAY
				AND span_type = 'tool'
				AND tool_name IS NOT NULL
			GROUP BY tool_name
			ORDER BY calls DESC
		`),
	);
}

async function models(): Promise<void> {
	printTable(
		"Per-model totals (last 24h)",
		await rows(`
			SELECT
				model,
				COUNT(*) AS calls,
				SUM(input_tokens) AS in_tok,
				SUM(output_tokens) AS out_tok,
				SUM(cache_read_tokens) AS cache_r,
				SUM(cache_creation_tokens) AS cache_w,
				ROUND(SUM(duration_ms) / 1000.0, 1) AS total_seconds
			FROM spans
			WHERE CAST(ingested_at AS TIMESTAMP) > now() - INTERVAL 1 DAY
				AND span_type = 'llm_request'
				AND model IS NOT NULL
			GROUP BY model
			ORDER BY calls DESC
		`),
	);
}

async function sqlCmd(q: string): Promise<void> {
	printTable("SQL", await rows(q));
}

const [, , cmd, ...rest] = process.argv;
switch (cmd) {
	case undefined:
	case "summary":
		await summary();
		break;
	case "sessions":
		await sessions();
		break;
	case "session":
		if (!rest[0]) {
			console.error("Usage: bun run obs:report session <session-id>");
			process.exit(2);
		}
		await session(rest[0]);
		break;
	case "ab":
		if (!rest[0]) {
			console.error("Usage: bun run obs:report ab <test-id>");
			process.exit(2);
		}
		await ab(rest[0]);
		break;
	case "tools":
		await tools();
		break;
	case "models":
		await models();
		break;
	case "sql":
		if (!rest[0]) {
			console.error('Usage: bun run obs:report sql "<query>"');
			process.exit(2);
		}
		await sqlCmd(rest.join(" "));
		break;
	default:
		console.error(`Unknown subcommand: ${cmd}`);
		console.error(
			"Subcommands: summary | sessions | session <id> | ab <test> | tools | models | sql <query>",
		);
		process.exit(2);
}
