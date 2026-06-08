#!/usr/bin/env tsx
/**
 * X7: Eval CLI entry point.
 *
 * Usage:
 *   npm run eval                                              # run all scenarios (OpenRouter default)
 *   npm run eval -- --quick                                   # quick scenarios only
 *   npm run eval -- --model moonshotai/kimi-k2.6               # override model (OpenRouter)
 *   npm run eval -- --model deepseek/deepseek-v4-pro         # DeepSeek v4 Pro via OpenRouter
 *   npm run eval -- --model minimax/minimax-m3                # MiniMax M3 via OpenRouter
 *   npm run eval -- --model claude-sonnet-4-20250514          # Anthropic model
 *   npm run eval -- --scenario poc-session-notes              # single scenario
 *   npm run eval -- --output results.json                     # custom output path
 *
 * API key validation:
 *   - Default (OpenRouter): requires OPENROUTER_API_KEY
 *   - Anthropic models: requires ANTHROPIC_API_KEY
 *   - Missing key → exits with code 1
 */

import { runEval } from "./runner.js";

// ---------------------------------------------------------------------------
// CLI argument parsing (no external deps — keeps the package lean)
// ---------------------------------------------------------------------------

interface CliArgs {
	model?: string;
	quick: boolean;
	scenario?: string;
	feature?: string;
	output?: string;
	help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
	const args: CliArgs = { quick: false, help: false };
	let i = 0;
	while (i < argv.length) {
		const arg = argv[i];
		if (arg === "--help" || arg === "-h") {
			args.help = true;
		} else if (arg === "--quick" || arg === "-q") {
			args.quick = true;
		} else if (arg === "--model" || arg === "-m") {
			args.model = argv[++i];
		} else if (arg === "--scenario" || arg === "-s") {
			args.scenario = argv[++i];
		} else if (arg === "--feature" || arg === "-f") {
			args.feature = argv[++i];
		} else if (arg === "--output" || arg === "-o") {
			args.output = argv[++i];
		}
		i++;
	}
	return args;
}

function printHelp(): void {
	process.stderr.write(`
HyperIdle Eval Framework

Usage:
  npm run eval [-- options]

Options:
  --quick, -q                  Run only quick-tagged scenarios
  --model, -m <model-id>       Override model (default: deepseek/deepseek-v4-pro via OpenRouter)
  --scenario, -s <id>          Run a single scenario by ID
  --feature, -f <name>         Run scenarios for a specific interaction feature
  --output, -o <path>          Output JSON path (default: eval-results.json)
  --help, -h                   Show this help

OpenRouter model examples:
  --model moonshotai/kimi-k2.6
  --model deepseek/deepseek-v4-pro
  --model minimax/minimax-m3

Anthropic model examples:
  --model claude-sonnet-4-20250514

Environment variables:
  OPENROUTER_API_KEY  Required for OpenRouter models (default provider)
  ANTHROPIC_API_KEY   Required for Anthropic models

Output:
  Console: scenario progress written to stderr
  JSON:    eval-results.json (or --output path) with full rubric scores
`);
}

// ---------------------------------------------------------------------------
// API key validation
// ---------------------------------------------------------------------------

function validateApiKey(model?: string): void {
	// Determine which key is needed
	let needsAnthropic = false;
	let needsOpenRouter = false;

	if (!model) {
		// Default is OpenRouter
		needsOpenRouter = true;
	} else if (model.includes("/")) {
		// Contains "/" → OpenRouter (e.g. "moonshotai/kimi-k2.6")
		needsOpenRouter = true;
	} else if (model.startsWith("claude-")) {
		needsAnthropic = true;
	} else {
		// openai-compatible — no standard env var to check
		return;
	}

	if (needsOpenRouter && !process.env.OPENROUTER_API_KEY) {
		process.stderr.write(
			"[eval] Error: API key required. Set OPENROUTER_API_KEY for OpenRouter models.\n" +
				"  Example: OPENROUTER_API_KEY=sk-... npm run eval\n",
		);
		process.exit(1);
	}

	if (needsAnthropic && !process.env.ANTHROPIC_API_KEY) {
		process.stderr.write(
			"[eval] Error: API key required. Set ANTHROPIC_API_KEY for Anthropic models.\n" +
				"  Example: ANTHROPIC_API_KEY=sk-ant-... npm run eval -- --model claude-sonnet-4-20250514\n",
		);
		process.exit(1);
	}
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const args = parseArgs(argv);

	if (args.help) {
		printHelp();
		process.exit(0);
	}

	// Validate API key before doing any work
	validateApiKey(args.model);

	process.stderr.write("[eval] Starting HyperIdle Eval Framework\n");
	if (args.model) {
		process.stderr.write(`[eval] Model: ${args.model}\n`);
	} else {
		process.stderr.write("[eval] Model: deepseek/deepseek-v4-pro (OpenRouter default)\n");
	}
	if (args.quick) {
		process.stderr.write("[eval] Mode: quick (tagged scenarios only)\n");
	}

	try {
		await runEval({
			model: args.model,
			quick: args.quick,
			filter: args.scenario,
			feature: args.feature,
			outputPath: args.output,
		});
		process.exit(0);
	} catch (err) {
		process.stderr.write(
			`[eval] Fatal error: ${err instanceof Error ? err.message : String(err)}\n`,
		);
		process.exit(1);
	}
}

main().catch((err) => {
	process.stderr.write(
		`[eval] Unhandled error: ${err instanceof Error ? err.message : String(err)}\n`,
	);
	process.exit(1);
});
