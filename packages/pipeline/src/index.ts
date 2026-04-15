#!/usr/bin/env bun
import { createLogger } from "@hyperidle/shared";
import { runPipeline } from "./scheduler.js";

const log = createLogger({ pkg: "pipeline" });

function parseArgs(args: string[]): { target: string; concurrency: number; interactive: boolean } {
	let target = "all";
	let concurrency = 3;
	let interactive = false;

	const positional: string[] = [];

	for (let i = 0; i < args.length; i++) {
		const arg = args[i] ?? "";
		if (arg === "--concurrency" || arg === "-c") {
			concurrency = Number(args[++i]) || 3;
		} else if (arg === "--interactive" || arg === "-i") {
			interactive = true;
		} else if (arg === "--help" || arg === "-h") {
			printUsage();
			process.exit(0);
		} else if (!arg.startsWith("-")) {
			positional.push(arg);
		}
	}

	if (positional.length > 0) {
		target = positional.join(" ");
	}

	return { target, concurrency, interactive };
}

function printUsage(): void {
	// biome-ignore lint/suspicious/noConsole: CLI help output
	console.log(`
Usage: bin/pipeline [target] [options]

Targets:
  all              Run all stories (default)
  A                Run all stories in Track A
  "A2 A3"          Run specific stories
  A2               Run a single story

Options:
  -c, --concurrency <n>   Max parallel agents (default: 3)
  -i, --interactive        Surface permission requests for approval
  -h, --help               Show this help
`);
}

async function main(): Promise<void> {
	const { target, concurrency, interactive } = parseArgs(process.argv.slice(2));
	const cwd = process.cwd();

	log.info("═══════════════════════════════════════");
	log.info("  HyperIdle Development Pipeline");
	log.info("═══════════════════════════════════════");
	log.info(`Target: ${target}`);
	log.info(`Concurrency: ${concurrency}`);
	log.info(`Mode: ${interactive ? "interactive" : "auto"}`);
	log.info("═══════════════════════════════════════");

	await runPipeline({ target, concurrency, interactive, cwd });
}

main().catch((err) => {
	log.error(`Pipeline crashed: ${err}`);
	process.exit(1);
});
