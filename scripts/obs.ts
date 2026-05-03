#!/usr/bin/env bun
// Local-observability CLI. Runs the Langfuse stack defined in
// infrastructure/langfuse/docker-compose.yml and provides a smoke test that
// emits one OTel span and verifies it ingests.
//
// Subcommands: up | down | reset | status | logs | env | smoke | run
//
// Examples:
//   bun run scripts/obs.ts up                          # boot the stack
//   bun run scripts/obs.ts smoke                       # emit one span and confirm ingest
//   bun run scripts/obs.ts run bun pipeline L10        # run pipeline with OTel env set
//   bun run scripts/obs.ts down                        # stop (volumes preserved)

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Span, SpanStatusCode, trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor, NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const COMPOSE_FILE = join(REPO_ROOT, "infrastructure/langfuse/docker-compose.yml");
const ENV_FILE = join(REPO_ROOT, "infrastructure/langfuse/.env");
const OTEL_ENV_FILE = join(REPO_ROOT, "infrastructure/langfuse/otel.env");

function loadEnvFile(path: string): Record<string, string> {
	if (!existsSync(path)) return {};
	const out: Record<string, string> = {};
	for (const raw of readFileSync(path, "utf-8").split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) continue;
		const m = line.match(/^(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
		if (!m) continue;
		let value = m[2];
		if (
			value.length >= 2 &&
			((value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'")))
		) {
			value = value.slice(1, -1);
		}
		out[m[1]] = value;
	}
	return out;
}

function compose(args: string[], inheritStdio = true): { exitCode: number } {
	const proc = Bun.spawnSync({
		cmd: ["docker", "compose", "-f", COMPOSE_FILE, "--env-file", ENV_FILE, ...args],
		stdio: inheritStdio ? ["inherit", "inherit", "inherit"] : ["ignore", "pipe", "pipe"],
		cwd: REPO_ROOT,
	});
	return { exitCode: proc.exitCode ?? 1 };
}

async function up(): Promise<void> {
	console.log("Bringing up Langfuse stack…");
	const { exitCode } = compose(["up", "-d", "--remove-orphans"]);
	if (exitCode !== 0) process.exit(exitCode);
	console.log("\nWaiting for langfuse-web to become reachable…");
	const ok = await waitForLangfuse();
	if (!ok) {
		console.error("\nLangfuse did not become reachable within 90s.");
		console.error("Check `bun run obs:logs` for details.");
		process.exit(1);
	}
	console.log("✓ Langfuse is up.");
	console.log("  UI:    http://localhost:3000");
	console.log("  OTLP:  http://localhost:3000/api/public/otel/v1/traces");
	console.log("  Login: dev@hyperidle.local / hyperidle-local-pw");
	console.log("\nNext: `bun run obs:smoke` to verify ingest, then run a pipeline.");
}

async function waitForLangfuse(): Promise<boolean> {
	const deadline = Date.now() + 90_000;
	let lastErr: string | undefined;
	while (Date.now() < deadline) {
		try {
			const res = await fetch("http://localhost:3000/api/public/health", {
				signal: AbortSignal.timeout(2000),
			});
			if (res.ok) return true;
			lastErr = `status ${res.status}`;
		} catch (err) {
			lastErr = err instanceof Error ? err.message : String(err);
		}
		await new Promise((r) => setTimeout(r, 2000));
	}
	if (lastErr) console.error(`(last error: ${lastErr})`);
	return false;
}

function down(): never {
	const { exitCode } = compose(["down"]);
	process.exit(exitCode);
}

function reset(): never {
	const { exitCode } = compose(["down", "-v"]);
	process.exit(exitCode);
}

function status(): never {
	const { exitCode } = compose(["ps"]);
	process.exit(exitCode);
}

function logs(rest: string[]): never {
	const { exitCode } = compose(["logs", "-f", ...rest]);
	process.exit(exitCode);
}

function env(): void {
	if (!existsSync(OTEL_ENV_FILE)) {
		console.error(`missing ${OTEL_ENV_FILE}`);
		process.exit(1);
	}
	process.stdout.write(readFileSync(OTEL_ENV_FILE, "utf-8"));
}

async function smoke(): Promise<void> {
	const otelEnv = loadEnvFile(OTEL_ENV_FILE);
	for (const [k, v] of Object.entries(otelEnv)) {
		if (!process.env[k]) process.env[k] = v;
	}
	const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
	if (!endpoint) {
		console.error("OTEL_EXPORTER_OTLP_ENDPOINT not set after loading otel.env");
		process.exit(1);
	}

	const provider = new NodeTracerProvider({
		resource: resourceFromAttributes({
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

	console.log(`Emitted span via ${endpoint} — flushing…`);
	await provider.forceFlush();
	await provider.shutdown();
	console.log("✓ Span emitted and flushed.");
	console.log("  Open http://localhost:3000 → project hyperidle-pipeline → Traces");
	console.log("  to confirm the span appears (look for service hyperidle-obs-smoke).");
}

async function run(rest: string[]): Promise<void> {
	if (rest.length === 0) {
		console.error("Usage: bun run obs:run <command> [args…]");
		process.exit(2);
	}
	const otelEnv = loadEnvFile(OTEL_ENV_FILE);
	const merged: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) if (v !== undefined) merged[k] = v;
	for (const [k, v] of Object.entries(otelEnv)) merged[k] = v;
	const proc = Bun.spawn({
		cmd: rest,
		env: merged,
		stdio: ["inherit", "inherit", "inherit"],
		cwd: REPO_ROOT,
	});
	const code = await proc.exited;
	process.exit(code ?? 0);
}

const [, , cmd, ...rest] = process.argv;
switch (cmd) {
	case "up":
		await up();
		break;
	case "down":
		down();
		break;
	case "reset":
		reset();
		break;
	case "status":
		status();
		break;
	case "logs":
		logs(rest);
		break;
	case "env":
		env();
		break;
	case "smoke":
		await smoke();
		break;
	case "run":
		await run(rest);
		break;
	default:
		console.error(`Usage: bun run scripts/obs.ts <up|down|reset|status|logs|env|smoke|run>`);
		console.error(`  up       boot the Langfuse stack and wait for health`);
		console.error(`  down     stop the stack (volumes preserved)`);
		console.error(`  reset    stop the stack AND remove volumes`);
		console.error(`  status   docker compose ps`);
		console.error(`  logs     tail logs (optional service name)`);
		console.error(`  env      print the SDK-side OTLP env vars`);
		console.error(`  smoke    emit one OTel span and confirm ingest`);
		console.error(`  run …    exec a command with OTLP env vars set`);
		process.exit(2);
}
