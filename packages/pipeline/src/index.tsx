#!/usr/bin/env tsx
import { render } from "ink";
import React from "react";
import { runPipeline } from "./scheduler.js";
import { PipelineApp } from "./ui.js";

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

	// Normalize: "A2,A3" or "A2 A3" both become "A2 A3"
	if (positional.length > 0)
		target = positional.join(" ").replace(/,/g, " ").replace(/\s+/g, " ").trim();
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

const { target, concurrency, interactive } = parseArgs(process.argv.slice(2));
const cwd = process.cwd();

// Render the TUI
const { unmount, waitUntilExit } = render(React.createElement(PipelineApp));

// Run pipeline in background
runPipeline({ target, concurrency, interactive, cwd }).finally(() => {
	// Give UI a moment to show final state, then exit
	setTimeout(() => {
		unmount();
		process.exit(0);
	}, 3000);
});

// Handle clean exit
waitUntilExit().then(() => process.exit(0));
