#!/usr/bin/env bun
// OTLP/HTTP-JSON receiver. Accepts traces from Claude Code and our pipeline
// runner, dumps each span as a row into SQLite at .pipeline/traces.db.
//
// SQLite (in WAL mode) lets the report tool read concurrently while the
// collector keeps writing — DuckDB couldn't do that without going through
// an HTTP query bridge. We trade DuckDB's columnar speed (irrelevant at the
// thousands-of-spans-per-day scale) for native multi-process access.
//
// Usage:
//   bun run obs:collector              # foreground; Ctrl-C to stop
//   HYPERIDLE_TRACE_PORT=4318 bun ...  # custom port (default 4318)
//   HYPERIDLE_TRACE_DB=./db.sqlite …   # custom db path
//
// On the SDK side, point OTEL_EXPORTER_OTLP_ENDPOINT at http://localhost:4318
// and set OTEL_EXPORTER_OTLP_PROTOCOL=http/json. otel.env already does both.

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const PORT = Number(process.env.HYPERIDLE_TRACE_PORT ?? 4318);
const DB_PATH = process.env.HYPERIDLE_TRACE_DB ?? ".pipeline/traces.db";

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH, { create: true });
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA synchronous = NORMAL;");
db.exec(`
CREATE TABLE IF NOT EXISTS spans (
  ingested_at TEXT NOT NULL DEFAULT (datetime('now')),
  trace_id TEXT,
  span_id TEXT PRIMARY KEY,
  parent_span_id TEXT,
  name TEXT,
  span_type TEXT,
  start_unix_ns INTEGER,
  end_unix_ns INTEGER,
  duration_ms REAL,
  service_name TEXT,
  service_version TEXT,
  session_id TEXT,
  ab_test TEXT,
  ab_arm TEXT,
  model TEXT,
  tool_name TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_read_tokens INTEGER,
  cache_creation_tokens INTEGER,
  ttft_ms REAL,
  attempt INTEGER,
  success INTEGER,
  stop_reason TEXT,
  decision TEXT,
  attributes TEXT,
  resource TEXT
);
CREATE INDEX IF NOT EXISTS spans_session_idx ON spans(session_id);
CREATE INDEX IF NOT EXISTS spans_ab_idx ON spans(ab_test, ab_arm);
CREATE INDEX IF NOT EXISTS spans_type_idx ON spans(span_type);
`);

const insert = db.prepare(`
INSERT OR REPLACE INTO spans (
  trace_id, span_id, parent_span_id, name, span_type,
  start_unix_ns, end_unix_ns, duration_ms,
  service_name, service_version, session_id, ab_test, ab_arm,
  model, tool_name,
  input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
  ttft_ms, attempt, success, stop_reason, decision,
  attributes, resource
) VALUES (
  $trace_id, $span_id, $parent_span_id, $name, $span_type,
  $start_unix_ns, $end_unix_ns, $duration_ms,
  $service_name, $service_version, $session_id, $ab_test, $ab_arm,
  $model, $tool_name,
  $input_tokens, $output_tokens, $cache_read_tokens, $cache_creation_tokens,
  $ttft_ms, $attempt, $success, $stop_reason, $decision,
  $attributes, $resource
)
`);

interface OtlpAttribute {
	key: string;
	value: {
		stringValue?: string;
		intValue?: string | number;
		doubleValue?: number;
		boolValue?: boolean;
		arrayValue?: { values: OtlpAttribute["value"][] };
	};
}

type Scalar = string | number | boolean | null;

function attrValue(v: OtlpAttribute["value"]): Scalar {
	if (v.stringValue !== undefined) return v.stringValue;
	if (v.intValue !== undefined) return Number(v.intValue);
	if (v.doubleValue !== undefined) return v.doubleValue;
	if (v.boolValue !== undefined) return v.boolValue;
	if (v.arrayValue !== undefined) return JSON.stringify(v.arrayValue.values.map(attrValue));
	return null;
}

function attrMap(attrs: OtlpAttribute[] | undefined): Record<string, Scalar> {
	const out: Record<string, Scalar> = {};
	for (const a of attrs ?? []) out[a.key] = attrValue(a.value);
	return out;
}

function asNumber(v: Scalar | undefined): number | null {
	if (v === null || v === undefined) return null;
	if (typeof v === "number") return v;
	if (typeof v === "boolean") return v ? 1 : 0;
	const n = Number(v);
	return Number.isNaN(n) ? null : n;
}

function asBool(v: Scalar | undefined): number | null {
	if (v === null || v === undefined) return null;
	if (typeof v === "boolean") return v ? 1 : 0;
	if (typeof v === "string") return v === "true" ? 1 : 0;
	if (typeof v === "number") return v !== 0 ? 1 : 0;
	return null;
}

interface OtlpSpan {
	traceId: string;
	spanId: string;
	parentSpanId?: string;
	name?: string;
	startTimeUnixNano?: string | number;
	endTimeUnixNano?: string | number;
	attributes?: OtlpAttribute[];
}

interface OtlpScopeSpans {
	scope?: { name?: string; version?: string };
	spans?: OtlpSpan[];
}

interface OtlpResourceSpans {
	resource?: { attributes?: OtlpAttribute[] };
	scopeSpans?: OtlpScopeSpans[];
}

interface OtlpTraceRequest {
	resourceSpans?: OtlpResourceSpans[];
}

let totalSpansIngested = 0;

function ingest(req: OtlpTraceRequest): number {
	let count = 0;
	const tx = db.transaction((spans: OtlpResourceSpans[]) => {
		for (const rs of spans) {
			const resource = attrMap(rs.resource?.attributes);
			for (const ss of rs.scopeSpans ?? []) {
				for (const span of ss.spans ?? []) {
					const attrs = attrMap(span.attributes);
					const startNs = BigInt(span.startTimeUnixNano ?? 0);
					const endNs = BigInt(span.endTimeUnixNano ?? 0);
					const durationMs = endNs > startNs ? Number(endNs - startNs) / 1e6 : null;

					insert.run({
						$trace_id: span.traceId ?? null,
						$span_id: span.spanId,
						$parent_span_id: span.parentSpanId ?? null,
						$name: span.name ?? null,
						$span_type: (attrs["span.type"] as string) ?? null,
						$start_unix_ns: Number(startNs),
						$end_unix_ns: Number(endNs),
						$duration_ms: durationMs,
						$service_name: (resource["service.name"] as string) ?? null,
						$service_version: (resource["service.version"] as string) ?? null,
						$session_id: (attrs["session.id"] as string) ?? null,
						$ab_test: (resource["ab.test"] as string) ?? null,
						$ab_arm: (resource["ab.arm"] as string) ?? null,
						$model: (attrs.model as string) ?? (attrs["gen_ai.request.model"] as string) ?? null,
						$tool_name: (attrs.tool_name as string) ?? null,
						$input_tokens: asNumber(attrs.input_tokens),
						$output_tokens: asNumber(attrs.output_tokens),
						$cache_read_tokens: asNumber(attrs.cache_read_tokens),
						$cache_creation_tokens: asNumber(attrs.cache_creation_tokens),
						$ttft_ms: asNumber(attrs.ttft_ms),
						$attempt: asNumber(attrs.attempt),
						$success: asBool(attrs.success),
						$stop_reason: (attrs.stop_reason as string) ?? null,
						$decision: (attrs.decision as string) ?? null,
						$attributes: JSON.stringify(attrs),
						$resource: JSON.stringify(resource),
					});
					count++;
				}
			}
		}
	});
	tx(req.resourceSpans ?? []);
	totalSpansIngested += count;
	return count;
}

const server = Bun.serve({
	port: PORT,
	async fetch(req: Request): Promise<Response> {
		const url = new URL(req.url);

		if (req.method === "POST" && url.pathname === "/v1/traces") {
			const ct = req.headers.get("content-type") ?? "";
			if (!ct.includes("json")) {
				return new Response(
					`Only OTLP/HTTP-JSON is supported. Set OTEL_EXPORTER_OTLP_PROTOCOL=http/json (got Content-Type: ${ct}).`,
					{ status: 415 },
				);
			}
			let body: OtlpTraceRequest;
			try {
				body = (await req.json()) as OtlpTraceRequest;
			} catch (err) {
				return new Response(`bad json: ${err}`, { status: 400 });
			}
			let ingested = 0;
			try {
				ingested = ingest(body);
			} catch (err) {
				console.error("ingest failed:", err);
				return new Response(`ingest error: ${err}`, { status: 500 });
			}
			console.log(`ingested ${ingested} span(s) (total ${totalSpansIngested})`);
			return Response.json({ partialSuccess: {} });
		}

		// Anything else under /v1/* (metrics, logs) — accept and drop, so SDKs
		// that chatter at us don't error out the parent process.
		if (req.method === "POST" && url.pathname.startsWith("/v1/")) {
			return Response.json({ partialSuccess: {} });
		}

		if (req.method === "GET" && url.pathname === "/healthz") {
			return new Response("ok", { status: 200 });
		}

		return new Response("not found", { status: 404 });
	},
});

console.log(`trace collector listening on http://localhost:${server.port}`);
console.log(`  endpoint: POST /v1/traces (OTLP/HTTP-JSON)`);
console.log(`  db:       ${DB_PATH}`);
console.log(`  query:    bun run obs:report`);

const stop = (): void => {
	console.log("\nshutting down…");
	server.stop();
	db.close();
	process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
