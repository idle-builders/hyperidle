#!/usr/bin/env bun
// OTLP/HTTP-JSON receiver. Appends each span as a JSONL row to
// .pipeline/traces.jsonl. Reports query the file via DuckDB
// read_json_auto — no lock contention because the file is append-only.
//
// Why JSONL + DuckDB-on-read instead of a direct DuckDB write path:
// DuckDB holds an exclusive lock on its database file, so a running writer
// blocks every other process from reading. Rolling spans into JSONL keeps
// the collector dead simple, lets DuckDB do real analytics on the same data
// (read_json_auto + json_extract), and stays inspectable with jq / tail.
//
// Usage:
//   bun run obs:collector                 # foreground; Ctrl-C to stop
//   HYPERIDLE_TRACE_PORT=4318 bun ...     # custom port (default 4318)
//   HYPERIDLE_TRACE_FILE=./trace.jsonl …  # custom path
//
// On the SDK side, point OTEL_EXPORTER_OTLP_ENDPOINT at http://localhost:4318
// and set OTEL_EXPORTER_OTLP_PROTOCOL=http/json. otel.env already does both.

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const PORT = Number(process.env.HYPERIDLE_TRACE_PORT ?? 4318);
const TRACE_FILE = process.env.HYPERIDLE_TRACE_FILE ?? ".pipeline/traces.jsonl";

mkdirSync(dirname(TRACE_FILE), { recursive: true });

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

function asBool(v: Scalar | undefined): boolean | null {
	if (v === null || v === undefined) return null;
	if (typeof v === "boolean") return v;
	if (typeof v === "string") return v === "true";
	if (typeof v === "number") return v !== 0;
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

interface FlatSpan {
	ingested_at: string;
	trace_id: string | null;
	span_id: string;
	parent_span_id: string | null;
	name: string | null;
	span_type: string | null;
	start_unix_ns: number;
	end_unix_ns: number;
	duration_ms: number | null;
	service_name: string | null;
	service_version: string | null;
	session_id: string | null;
	ab_test: string | null;
	ab_arm: string | null;
	workpackage: string | null;
	model: string | null;
	tool_name: string | null;
	input_tokens: number | null;
	output_tokens: number | null;
	cache_read_tokens: number | null;
	cache_creation_tokens: number | null;
	ttft_ms: number | null;
	attempt: number | null;
	success: boolean | null;
	stop_reason: string | null;
	decision: string | null;
	attributes: Record<string, Scalar>;
	resource: Record<string, Scalar>;
}

let totalSpansIngested = 0;

function pickString(map: Record<string, Scalar>, ...keys: string[]): string | null {
	for (const key of keys) {
		const v = map[key];
		if (typeof v === "string") return v;
	}
	return null;
}

function flatten(req: OtlpTraceRequest): FlatSpan[] {
	const out: FlatSpan[] = [];
	const ingestedAt = new Date().toISOString();
	for (const rs of req.resourceSpans ?? []) {
		const resource = attrMap(rs.resource?.attributes);
		for (const ss of rs.scopeSpans ?? []) {
			for (const span of ss.spans ?? []) {
				const attrs = attrMap(span.attributes);
				const startNs = BigInt(span.startTimeUnixNano ?? 0);
				const endNs = BigInt(span.endTimeUnixNano ?? 0);
				const durationMs = endNs > startNs ? Number(endNs - startNs) / 1e6 : null;
				out.push({
					ingested_at: ingestedAt,
					trace_id: span.traceId ?? null,
					span_id: span.spanId,
					parent_span_id: span.parentSpanId ?? null,
					name: span.name ?? null,
					span_type: pickString(attrs, "span.type"),
					start_unix_ns: Number(startNs),
					end_unix_ns: Number(endNs),
					duration_ms: durationMs,
					service_name: pickString(resource, "service.name"),
					service_version: pickString(resource, "service.version"),
					session_id: pickString(attrs, "session.id"),
					ab_test: pickString(resource, "ab.test"),
					ab_arm: pickString(resource, "ab.arm"),
					workpackage:
						pickString(resource, "hyperidle.workpackage") ??
						pickString(attrs, "hyperidle.story.id"),
					model: pickString(attrs, "model", "gen_ai.request.model"),
					tool_name: pickString(attrs, "tool_name"),
					input_tokens: asNumber(attrs.input_tokens),
					output_tokens: asNumber(attrs.output_tokens),
					cache_read_tokens: asNumber(attrs.cache_read_tokens),
					cache_creation_tokens: asNumber(attrs.cache_creation_tokens),
					ttft_ms: asNumber(attrs.ttft_ms),
					attempt: asNumber(attrs.attempt),
					success: asBool(attrs.success),
					stop_reason: pickString(attrs, "stop_reason"),
					decision: pickString(attrs, "decision"),
					attributes: attrs,
					resource,
				});
			}
		}
	}
	return out;
}

function ingest(req: OtlpTraceRequest): number {
	const flat = flatten(req);
	if (flat.length === 0) return 0;
	const lines = `${flat.map((s) => JSON.stringify(s)).join("\n")}\n`;
	appendFileSync(TRACE_FILE, lines);
	totalSpansIngested += flat.length;
	return flat.length;
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
console.log(`  file:     ${TRACE_FILE}`);
console.log(`  query:    bun run obs:report   (DuckDB over read_json_auto)`);

const stop = (): void => {
	console.log("\nshutting down…");
	server.stop();
	process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
