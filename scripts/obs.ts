#!/usr/bin/env tsx
// Local-observability CLI for the DuckDB-backed trace collector
// (scripts/trace-collector.ts → .pipeline/traces.jsonl).
//
// Subcommands: env | smoke | run
//
// Examples:
//   source <(npm run obs:env)                                # tag this shell with OTel env
//   source <(npm run obs:env --in-container)                 # same, container-side rewrite
//   source <(npm run obs:env --ab=block-1 --variant=baseline) # OTel env + ab.test/ab.arm tags
//   source <(npm run obs:env --workpackage=L15)              # OTel env + hyperidle.workpackage tag
//   npm run obs:smoke                                        # emit one span; verify ingest
//   npm run obs:run -- <command>                         # run a command with OTel env set

import { type Span, SpanStatusCode, trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor, NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

const OTEL_ENV: Record<string, string> = {
	OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
	OTEL_EXPORTER_OTLP_PROTOCOL: "http/json",
	OTEL_RESOURCE_ATTRIBUTES: "service.name=hyperidle-pipeline,deployment.environment=local",
	CLAUDE_CODE_ENABLE_TELEMETRY: "1",
	CLAUDE_CODE_ENHANCED_TELEMETRY_BETA: "1",
	OTEL_TRACES_EXPORTER: "otlp",
	OTEL_METRICS_EXPORTER: "none",
	OTEL_LOGS_EXPORTER: "none",
};

function rewriteForContainer(env: Record<string, string>): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(env)) {
		out[k] = v
			.replace(/localhost/g, "host.docker.internal")
			.replace(/127\.0\.0\.1/g, "host.docker.internal");
	}
	return out;
}

function flagValue(args: string[], name: string): string | undefined {
	for (let i = 0; i < args.length; i++) {
		const a = args[i];
		if (a === undefined) continue;
		if (a === `--${name}`) return args[i + 1];
		if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
		if (a.startsWith(`--${name}:`)) return a.slice(name.length + 3);
	}
	return undefined;
}

function mergeResourceAttrs(base: string, additions: Record<string, string>): string {
	const additionsCsv = Object.entries(additions)
		.map(([k, v]) => `${k}=${v}`)
		.join(",");
	return base ? `${base},${additionsCsv}` : additionsCsv;
}

function formatExports(env: Record<string, string>): string {
	return `${Object.entries(env)
		.map(([k, v]) => `export ${k}="${v}"`)
		.join("\n")}\n`;
}

function env(args: string[]): void {
	const inContainer = args.includes("--in-container");
	const ab = flagValue(args, "ab");
	const variant = flagValue(args, "variant") ?? flagValue(args, "arm");
	const workpackage = flagValue(args, "workpackage") ?? flagValue(args, "wp");
	if ((ab && !variant) || (variant && !ab)) {
		console.error("Pass --ab and --variant together (or neither).");
		console.error("  source <(npm run obs:env --ab=block-1 --variant=baseline)");
		process.exit(2);
	}

	const out = inContainer ? rewriteForContainer(OTEL_ENV) : { ...OTEL_ENV };
	const additions: Record<string, string> = {};
	if (ab && variant) {
		additions["ab.test"] = ab;
		additions["ab.arm"] = variant;
	}
	if (workpackage) {
		additions["hyperidle.workpackage"] = workpackage;
	}
	if (Object.keys(additions).length > 0) {
		out.OTEL_RESOURCE_ATTRIBUTES = mergeResourceAttrs(out.OTEL_RESOURCE_ATTRIBUTES ?? "", additions);
	}
	process.stdout.write(formatExports(out));
}

function parseResourceAttributesEnv(): Record<string, string> {
	const raw = process.env.OTEL_RESOURCE_ATTRIBUTES;
	if (!raw) return {};
	const out: Record<string, string> = {};
	for (const pair of raw.split(",")) {
		const eq = pair.indexOf("=");
		if (eq <= 0) continue;
		out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
	}
	return out;
}

async function smoke(): Promise<void> {
	for (const [k, v] of Object.entries(OTEL_ENV)) {
		if (!process.env[k]) process.env[k] = v;
	}

	const provider = new NodeTracerProvider({
		resource: resourceFromAttributes({
			...parseResourceAttributesEnv(),
			[ATTR_SERVICE_NAME]: "hyperidle-obs-smoke",
		}),
		spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter())],
	});
	provider.register();

	const tracer = trace.getTracer("hyperidle-obs-smoke");
	const span: Span = tracer.startSpan("hyperidle.smoke");
	span.setAttribute("hyperidle.smoke.run", new Date().toISOString());
	span.setStatus({ code: SpanStatusCode.OK });
	span.end();

	console.log(`Emitted span via ${OTEL_ENV.OTEL_EXPORTER_OTLP_ENDPOINT} — flushing…`);
	await provider.forceFlush();
	await provider.shutdown();
	console.log("✓ Span emitted and flushed.");
	console.log("  Confirm with: npm run obs:report summary");
}

async function run(rest: string[]): Promise<void> {
	if (rest.length === 0) {
		console.error("Usage: npm run obs:run <command> [args…]");
		process.exit(2);
	}
	const merged: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) if (v !== undefined) merged[k] = v;
	for (const [k, v] of Object.entries(OTEL_ENV)) merged[k] = v;
	const { spawn } = await import("node:child_process");
	const [cmd, ...args] = rest;
	const proc = spawn(cmd ?? "", args, {
		env: merged,
		stdio: "inherit",
	});
	await new Promise<void>((resolve) => {
		proc.on("close", (code) => {
			process.exit(code ?? 0);
			resolve();
		});
	});
}

const [, , cmd, ...rest] = process.argv;
switch (cmd) {
	case "env":
		env(rest);
		break;
	case "smoke":
		await smoke();
		break;
	case "run":
		await run(rest);
		break;
	default:
		console.error(`Usage: npm run obs:run <env|smoke|run>`);
		console.error(`  env [--in-container] [--ab=<test> --variant=<arm>] [--workpackage=<id>]`);
		console.error(`               print export lines for OTLP env vars; A/B flags`);
		console.error(`               append ab.test / ab.arm / hyperidle.workpackage`);
		console.error(`               resource attributes`);
		console.error(`  smoke        emit one OTel span and confirm ingest`);
		console.error(`  run …        exec a command with OTLP env vars set`);
		process.exit(2);
}
