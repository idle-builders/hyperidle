#!/usr/bin/env tsx
// OTLP/HTTP-JSON receiver. Appends each span as a JSONL row to
// .pipeline/traces.jsonl (append-only, inspectable with jq / tail).
//
// Usage:
//   npm run obs:collector                 # foreground; Ctrl-C to stop
//   HYPERIDLE_TRACE_PORT=4318 npx tsx scripts/trace-collector.ts  # custom port
//   HYPERIDLE_TRACE_FILE=./trace.jsonl …  # custom path
//
// On the SDK side, point OTEL_EXPORTER_OTLP_ENDPOINT at http://localhost:4318
// and set OTEL_EXPORTER_OTLP_PROTOCOL=http/json. otel.env already does both.

import { appendFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
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

const server = createServer((req, res) => {
	const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
	const chunks: Buffer[] = [];

	req.on("data", (chunk: Buffer) => chunks.push(chunk));
	req.on("end", () => {
		const bodyStr = Buffer.concat(chunks).toString("utf-8");

		if (req.method === "POST" && url.pathname === "/v1/traces") {
			const ct = req.headers["content-type"] ?? "";
			if (!ct.includes("json")) {
				res.writeHead(415, { "Content-Type": "text/plain" });
				res.end(
					`Only OTLP/HTTP-JSON is supported. Set OTEL_EXPORTER_OTLP_PROTOCOL=http/json (got Content-Type: ${ct}).`,
				);
				return;
			}
			let body: OtlpTraceRequest;
			try {
				body = JSON.parse(bodyStr) as OtlpTraceRequest;
			} catch (err) {
				res.writeHead(400, { "Content-Type": "text/plain" });
				res.end(`bad json: ${err}`);
				return;
			}
			let ingested = 0;
			try {
				ingested = ingest(body);
			} catch (err) {
				console.error("ingest failed:", err);
				res.writeHead(500, { "Content-Type": "text/plain" });
				res.end(`ingest error: ${err}`);
				return;
			}
			console.log(`ingested ${ingested} span(s) (total ${totalSpansIngested})`);
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ partialSuccess: {} }));
			return;
		}

		// Anything else under /v1/* (metrics, logs) — accept and drop, so SDKs
		// that chatter at us don't error out the parent process.
		if (req.method === "POST" && url.pathname.startsWith("/v1/")) {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ partialSuccess: {} }));
			return;
		}

		if (req.method === "GET" && url.pathname === "/healthz") {
			res.writeHead(200, { "Content-Type": "text/plain" });
			res.end("ok");
			return;
		}

		res.writeHead(404, { "Content-Type": "text/plain" });
		res.end("not found");
	});
});

server.listen(PORT, () => {
	console.log(`trace collector listening on http://localhost:${PORT}`);
	console.log(`  endpoint: POST /v1/traces (OTLP/HTTP-JSON)`);
	console.log(`  file:     ${TRACE_FILE}`);
});

const stop = (): void => {
	console.log("\nshutting down…");
	server.close();
	process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
