#!/usr/bin/env tsx
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
//   bun run obs:report costs                 # cost breakdown by model, session, workpackage
//   bun run obs:report workpackages          # per-workpackage rollup
//   bun run obs:report workpackage <wp-id>   # drill into one workpackage
//   bun run obs:report bash                  # bash command audit (from hook)
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
	`CREATE OR REPLACE VIEW spans_raw AS
	 SELECT * FROM read_json_auto('${TRACE_FILE_SQL}', format='newline_delimited', maximum_object_size=33554432)`,
);
// @lore Older JSONL rows (before the collector knew about `workpackage`) lack
// the top-level column, so we synthesize it via to_json -> json_extract_string.
// That path tolerates missing struct keys without erroring at parse time.
const rawColumns = await rows(
	"SELECT column_name FROM information_schema.columns WHERE table_name = 'spans_raw'",
);
const rawColumnNames = new Set(rawColumns.map((r) => r.column_name as string));
const sources: string[] = [];
if (rawColumnNames.has("workpackage")) sources.push("workpackage");
if (rawColumnNames.has("attributes")) {
	sources.push(`json_extract_string(to_json(attributes), '$."hyperidle.story.id"')`);
}
if (rawColumnNames.has("resource")) {
	sources.push(`json_extract_string(to_json(resource), '$."hyperidle.workpackage"')`);
}
const wpFallback = sources.length > 0 ? `COALESCE(${sources.join(", ")})` : "NULL";
await conn.run(
	`CREATE OR REPLACE VIEW spans AS
	 SELECT *${rawColumnNames.has("workpackage") ? " EXCLUDE (workpackage)" : ""},
	        ${wpFallback} AS workpackage
	 FROM spans_raw`,
);

// Register a cost-calculation macro in DuckDB so all queries can use it
await conn.run(`
	CREATE OR REPLACE MACRO model_base(m) AS
		CASE
			WHEN m LIKE 'claude-opus-4%' THEN 'claude-opus-4'
			WHEN m LIKE 'claude-sonnet-4-6%' THEN 'claude-sonnet-4-6'
			WHEN m LIKE 'claude-sonnet-4-5%' THEN 'claude-sonnet-4-5'
			WHEN m LIKE 'claude-haiku-4-5%' THEN 'claude-haiku-4-5'
			WHEN m LIKE 'opus-4%' THEN 'claude-opus-4'
			ELSE 'unknown'
		END
`);

// Cost per token (USD) as a join table
await conn.run(`
	CREATE OR REPLACE TABLE pricing (model_family VARCHAR, input_per_mtok DOUBLE, output_per_mtok DOUBLE, cache_read_per_mtok DOUBLE, cache_write_per_mtok DOUBLE);
	INSERT INTO pricing VALUES
		('claude-opus-4', 5, 25, 0.50, 6.25),
		('claude-sonnet-4-6', 3, 15, 0.30, 3.75),
		('claude-sonnet-4-5', 3, 15, 0.30, 3.75),
		('claude-haiku-4-5', 1, 5, 0.10, 1.25),
		('unknown', 5, 25, 0.50, 6.25);
`);

// Enriched view with cost columns
await conn.run(`
	CREATE OR REPLACE VIEW spans_costed AS
	SELECT s.*,
		p.input_per_mtok,
		p.output_per_mtok,
		p.cache_read_per_mtok,
		p.cache_write_per_mtok,
		COALESCE(s.input_tokens, 0) / 1e6 * p.input_per_mtok
			+ COALESCE(s.output_tokens, 0) / 1e6 * p.output_per_mtok
			+ COALESCE(s.cache_read_tokens, 0) / 1e6 * p.cache_read_per_mtok
			+ COALESCE(s.cache_creation_tokens, 0) / 1e6 * p.cache_write_per_mtok
		AS cost_usd
	FROM spans s
	LEFT JOIN pricing p ON p.model_family = model_base(s.model)
`);

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
				ROUND(SUM(cost_usd), 2) AS cost_usd,
				ROUND(SUM(duration_ms) / 1000.0, 1) AS total_seconds,
				string_agg(DISTINCT model, ',' ORDER BY model)
					FILTER (WHERE span_type = 'llm_request' AND model IS NOT NULL) AS models
			FROM spans_costed
			WHERE CAST(ingested_at AS TIMESTAMP) > now() - INTERVAL 1 DAY
		`),
	);

	printTable(
		"Per-model breakdown (last 24h)",
		await rows(`
			SELECT
				model,
				COUNT(*) AS calls,
				SUM(input_tokens) AS in_tok,
				SUM(output_tokens) AS out_tok,
				SUM(cache_read_tokens) AS cache_r,
				SUM(cache_creation_tokens) AS cache_w,
				ROUND(SUM(cost_usd), 2) AS cost_usd,
				ROUND(SUM(COALESCE(output_tokens, 0) / 1e6 * output_per_mtok), 2) AS output_cost,
				ROUND(SUM(COALESCE(cache_read_tokens, 0) / 1e6 * cache_read_per_mtok), 2) AS cache_read_cost,
				ROUND(SUM(COALESCE(cache_creation_tokens, 0) / 1e6 * cache_write_per_mtok), 2) AS cache_write_cost,
				ROUND(SUM(duration_ms) / 1000.0, 1) AS total_seconds
			FROM spans_costed
			WHERE CAST(ingested_at AS TIMESTAMP) > now() - INTERVAL 1 DAY
				AND span_type = 'llm_request'
				AND model IS NOT NULL
			GROUP BY model
			ORDER BY cost_usd DESC
		`),
	);

	printTable(
		"Recent sessions (last 24h)",
		await rows(`
			SELECT
				session_id,
				to_timestamp(MIN(start_unix_ns) / 1e9) AS started,
				COUNT(*) FILTER (WHERE span_type = 'llm_request') AS llms,
				SUM(output_tokens) AS out_tok,
				SUM(cache_read_tokens) AS cache_r,
				ROUND(SUM(cost_usd), 2) AS cost_usd,
				string_agg(DISTINCT model, ',' ORDER BY model)
					FILTER (WHERE span_type = 'llm_request' AND model IS NOT NULL) AS models,
				string_agg(DISTINCT workpackage, ',' ORDER BY workpackage)
					FILTER (WHERE workpackage IS NOT NULL) AS workpackage
			FROM spans_costed
			WHERE CAST(ingested_at AS TIMESTAMP) > now() - INTERVAL 1 DAY
				AND session_id IS NOT NULL
			GROUP BY session_id
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
				string_agg(DISTINCT model, ',' ORDER BY model)
					FILTER (WHERE span_type = 'llm_request' AND model IS NOT NULL) AS models,
				string_agg(DISTINCT workpackage, ',' ORDER BY workpackage)
					FILTER (WHERE workpackage IS NOT NULL) AS workpackage,
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
				ROUND(SUM(duration_ms) / 1000.0, 1) AS total_seconds,
				string_agg(DISTINCT model, ',' ORDER BY model)
					FILTER (WHERE span_type = 'llm_request' AND model IS NOT NULL) AS models
			FROM spans WHERE session_id = ${idLit}
		`),
	);
	printTable(
		`Session ${id} — by model`,
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
			WHERE session_id = ${idLit}
				AND span_type = 'llm_request'
				AND model IS NOT NULL
			GROUP BY model
			ORDER BY calls DESC
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
				ROUND(SUM(duration_ms) / 1000.0, 1) AS total_seconds,
				string_agg(DISTINCT model, ',' ORDER BY model)
					FILTER (WHERE span_type = 'llm_request' AND model IS NOT NULL) AS models
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
				ROUND(SUM(cost_usd), 2) AS cost_usd,
				ROUND(SUM(COALESCE(output_tokens, 0) / 1e6 * output_per_mtok), 2) AS output_cost,
				ROUND(SUM(COALESCE(cache_read_tokens, 0) / 1e6 * cache_read_per_mtok), 2) AS cache_read_cost,
				ROUND(SUM(COALESCE(cache_creation_tokens, 0) / 1e6 * cache_write_per_mtok), 2) AS cache_write_cost,
				ROUND(SUM(duration_ms) / 1000.0, 1) AS total_seconds
			FROM spans_costed
			WHERE CAST(ingested_at AS TIMESTAMP) > now() - INTERVAL 1 DAY
				AND span_type = 'llm_request'
				AND model IS NOT NULL
			GROUP BY model
			ORDER BY cost_usd DESC
		`),
	);
}

async function costs(): Promise<void> {
	printTable(
		"Cost breakdown by model (last 24h)",
		await rows(`
			SELECT
				model,
				COUNT(*) AS calls,
				ROUND(SUM(COALESCE(input_tokens, 0) / 1e6 * input_per_mtok), 2) AS input_cost,
				ROUND(SUM(COALESCE(output_tokens, 0) / 1e6 * output_per_mtok), 2) AS output_cost,
				ROUND(SUM(COALESCE(cache_read_tokens, 0) / 1e6 * cache_read_per_mtok), 2) AS cache_read_cost,
				ROUND(SUM(COALESCE(cache_creation_tokens, 0) / 1e6 * cache_write_per_mtok), 2) AS cache_write_cost,
				ROUND(SUM(cost_usd), 2) AS total_cost
			FROM spans_costed
			WHERE CAST(ingested_at AS TIMESTAMP) > now() - INTERVAL 1 DAY
				AND span_type = 'llm_request'
				AND model IS NOT NULL
			GROUP BY model
			ORDER BY total_cost DESC
		`),
	);

	printTable(
		"Cost breakdown by category (last 24h)",
		await rows(`
			SELECT
				ROUND(SUM(COALESCE(input_tokens, 0) / 1e6 * input_per_mtok), 2) AS input_cost,
				ROUND(SUM(COALESCE(output_tokens, 0) / 1e6 * output_per_mtok), 2) AS output_cost,
				ROUND(SUM(COALESCE(cache_read_tokens, 0) / 1e6 * cache_read_per_mtok), 2) AS cache_read_cost,
				ROUND(SUM(COALESCE(cache_creation_tokens, 0) / 1e6 * cache_write_per_mtok), 2) AS cache_write_cost,
				ROUND(SUM(cost_usd), 2) AS total_cost
			FROM spans_costed
			WHERE CAST(ingested_at AS TIMESTAMP) > now() - INTERVAL 1 DAY
				AND span_type = 'llm_request'
		`),
	);

	printTable(
		"Cost per session (last 24h, top 15)",
		await rows(`
			SELECT
				session_id,
				string_agg(DISTINCT workpackage, ',' ORDER BY workpackage)
					FILTER (WHERE workpackage IS NOT NULL) AS workpackage,
				COUNT(*) FILTER (WHERE span_type = 'llm_request') AS llm_calls,
				string_agg(DISTINCT model, ',' ORDER BY model)
					FILTER (WHERE span_type = 'llm_request' AND model IS NOT NULL) AS models,
				ROUND(SUM(cost_usd), 2) AS total_cost,
				ROUND(SUM(COALESCE(output_tokens, 0) / 1e6 * output_per_mtok), 2) AS output_cost,
				ROUND(SUM(COALESCE(cache_read_tokens, 0) / 1e6 * cache_read_per_mtok), 2) AS cache_read_cost
			FROM spans_costed
			WHERE CAST(ingested_at AS TIMESTAMP) > now() - INTERVAL 1 DAY
				AND session_id IS NOT NULL
			GROUP BY session_id
			ORDER BY total_cost DESC
			LIMIT 15
		`),
	);

	printTable(
		"Cost per workpackage (all time)",
		await rows(`
			SELECT
				workpackage,
				COUNT(DISTINCT session_id) AS sessions,
				COUNT(*) FILTER (WHERE span_type = 'llm_request') AS llm_calls,
				ROUND(SUM(cost_usd), 2) AS total_cost,
				ROUND(SUM(COALESCE(output_tokens, 0) / 1e6 * output_per_mtok), 2) AS output_cost,
				ROUND(SUM(COALESCE(cache_read_tokens, 0) / 1e6 * cache_read_per_mtok), 2) AS cache_read_cost,
				ROUND(SUM(COALESCE(cache_creation_tokens, 0) / 1e6 * cache_write_per_mtok), 2) AS cache_write_cost
			FROM spans_costed
			WHERE workpackage IS NOT NULL
			GROUP BY workpackage
			ORDER BY total_cost DESC
		`),
	);
}

async function workpackages(): Promise<void> {
	printTable(
		"Per-workpackage rollup",
		await rows(`
			SELECT
				workpackage,
				to_timestamp(MIN(start_unix_ns) / 1e9) AS first_seen,
				to_timestamp(MAX(end_unix_ns) / 1e9) AS last_seen,
				COUNT(DISTINCT session_id) AS sessions,
				COUNT(*) FILTER (WHERE span_type = 'llm_request') AS llm_calls,
				COUNT(*) FILTER (WHERE span_type LIKE 'tool%' AND span_type != 'tool.blocked_on_user') AS tool_calls,
				SUM(input_tokens) AS in_tok,
				SUM(output_tokens) AS out_tok,
				SUM(cache_read_tokens) AS cache_r,
				SUM(cache_creation_tokens) AS cache_w,
				ROUND(SUM(duration_ms) / 1000.0, 1) AS total_seconds,
				string_agg(DISTINCT model, ',' ORDER BY model)
					FILTER (WHERE span_type = 'llm_request' AND model IS NOT NULL) AS models
			FROM spans
			WHERE workpackage IS NOT NULL
			GROUP BY workpackage
			ORDER BY last_seen DESC
		`),
	);
}

async function workpackage(id: string): Promise<void> {
	const idLit = `'${id.replace(/'/g, "''")}'`;
	printTable(
		`Workpackage ${id} — totals`,
		await rows(`
			SELECT
				COUNT(DISTINCT session_id) AS sessions,
				COUNT(*) FILTER (WHERE span_type = 'llm_request') AS llm_calls,
				COUNT(*) FILTER (WHERE span_type LIKE 'tool%' AND span_type != 'tool.blocked_on_user') AS tool_calls,
				SUM(input_tokens) AS input_tokens,
				SUM(output_tokens) AS output_tokens,
				SUM(cache_read_tokens) AS cache_read_tokens,
				SUM(cache_creation_tokens) AS cache_creation_tokens,
				ROUND(SUM(duration_ms) / 1000.0, 1) AS total_seconds,
				string_agg(DISTINCT model, ',' ORDER BY model)
					FILTER (WHERE span_type = 'llm_request' AND model IS NOT NULL) AS models
			FROM spans WHERE workpackage = ${idLit}
		`),
	);
	printTable(
		`Workpackage ${id} — by model`,
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
			WHERE workpackage = ${idLit}
				AND span_type = 'llm_request'
				AND model IS NOT NULL
			GROUP BY model
			ORDER BY calls DESC
		`),
	);
	printTable(
		`Workpackage ${id} — sessions`,
		await rows(`
			SELECT
				session_id,
				to_timestamp(MIN(start_unix_ns) / 1e9) AS started,
				COUNT(*) FILTER (WHERE span_type = 'llm_request') AS llms,
				SUM(input_tokens) AS in_tok,
				SUM(output_tokens) AS out_tok,
				SUM(cache_read_tokens) AS cache_r,
				SUM(cache_creation_tokens) AS cache_w,
				ROUND(SUM(duration_ms) / 1000.0, 1) AS total_seconds,
				string_agg(DISTINCT model, ',' ORDER BY model)
					FILTER (WHERE span_type = 'llm_request' AND model IS NOT NULL) AS models,
				ab_test,
				ab_arm
			FROM spans
			WHERE workpackage = ${idLit} AND session_id IS NOT NULL
			GROUP BY session_id, ab_test, ab_arm
			ORDER BY started DESC
		`),
	);
}

async function bashAudit(): Promise<void> {
	const auditFile = resolve(process.env.HYPERIDLE_BASH_AUDIT ?? ".pipeline/bash-audit.jsonl");
	if (!existsSync(auditFile)) {
		console.log(
			"No bash audit data yet. The PostToolUse hook logs bash commands to .pipeline/bash-audit.jsonl.",
		);
		console.log("Run some bash commands first, then re-run this report.");
		return;
	}
	const auditFileSql = auditFile.replace(/'/g, "''");
	await conn.run(
		`CREATE OR REPLACE VIEW bash_audit AS
		 SELECT * FROM read_json_auto('${auditFileSql}', format='newline_delimited', maximum_object_size=33554432)`,
	);

	printTable(
		"Bash commands by category",
		await rows(`
			SELECT
				category,
				COUNT(*) AS calls,
				COUNT(*) FILTER (WHERE exit_code != 0) AS failures,
				ROUND(COUNT(*) FILTER (WHERE exit_code != 0)::FLOAT / COUNT(*) * 100, 1) AS fail_pct
			FROM bash_audit
			GROUP BY category
			ORDER BY calls DESC
		`),
	);

	printTable(
		"Top 20 commands (by frequency)",
		await rows(`
			SELECT
				CASE WHEN length(command) > 80 THEN command[:77] || '...' ELSE command END AS command,
				COUNT(*) AS calls,
				COUNT(*) FILTER (WHERE exit_code != 0) AS failures
			FROM bash_audit
			GROUP BY command
			ORDER BY calls DESC
			LIMIT 20
		`),
	);

	printTable(
		"Repeated failures (same command failing 2+ times — debug loops)",
		await rows(`
			SELECT
				CASE WHEN length(command) > 80 THEN command[:77] || '...' ELSE command END AS command,
				COUNT(*) AS failures
			FROM bash_audit
			WHERE exit_code != 0
			GROUP BY command
			HAVING COUNT(*) >= 2
			ORDER BY failures DESC
			LIMIT 15
		`),
	);

	printTable(
		"Commands by session (heaviest bash users)",
		await rows(`
			SELECT
				session_id,
				COUNT(*) AS bash_calls,
				COUNT(*) FILTER (WHERE exit_code != 0) AS failures,
				COUNT(DISTINCT category) AS categories,
				string_agg(DISTINCT category, ',' ORDER BY category) AS types
			FROM bash_audit
			GROUP BY session_id
			ORDER BY bash_calls DESC
			LIMIT 10
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
	case "costs":
		await costs();
		break;
	case "bash":
		await bashAudit();
		break;
	case "workpackages":
		await workpackages();
		break;
	case "workpackage":
		if (!rest[0]) {
			console.error("Usage: bun run obs:report workpackage <wp-id>");
			process.exit(2);
		}
		await workpackage(rest[0]);
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
			"Subcommands: summary | sessions | session <id> | ab <test> | tools | models | costs | bash | workpackages | workpackage <id> | sql <query>",
		);
		process.exit(2);
}
