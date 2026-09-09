#!/usr/bin/env tsx
/**
 * X7: Eval CLI entry point.
 *
 * An eval run measures HyperIdle on ONE harness. `--harness` picks it and
 * `--model` picks the model that harness runs; both are run-scoped, because a
 * report that mixed harnesses would not be readable. Compare harnesses by
 * running the suite once per harness.
 *
 * `--judge-model` is a separate axis: the LLM-as-judge scores through the
 * model gateway and is deliberately independent of the harness, so a harness
 * comparison is not also a judge comparison.
 *
 * Usage:
 *   npm run eval                                              # all scenarios on codex
 *   npm run eval -- --harness claude                          # same suite, claude-code
 *   npm run eval -- --harness opencode --model openrouter/z-ai/glm-4.7-flash
 *   npm run eval -- --quick                                   # quick scenarios only
 *   npm run eval -- --scenario poc-session-notes              # single scenario
 *   npm run eval -- --output results.json                     # custom output path
 *
 * Requirements:
 *   - The selected harness's binary must be installed and logged in.
 *   - The judge needs OPENROUTER_API_KEY (or ANTHROPIC_API_KEY with
 *     --judge-model claude-*). Missing key → exits with code 1.
 */

import { EVAL_HARNESSES, isEvalHarnessName } from "./eval-harness.js";
import { runEval } from "./runner.js";

// ---------------------------------------------------------------------------
// CLI argument parsing (no external deps — keeps the package lean)
// ---------------------------------------------------------------------------

interface CliArgs {
	harness?: string;
	model?: string;
	judgeModel?: string;
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
		} else if (arg === "--harness") {
			args.harness = argv[++i];
		} else if (arg === "--model" || arg === "-m") {
			args.model = argv[++i];
		} else if (arg === "--judge-model") {
			args.judgeModel = argv[++i];
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
  --harness <name>             Harness to run: ${EVAL_HARNESSES.join(" | ")} (default: codex)
  --model, -m <model-id>       Harness-native model to run (default: the harness's own)
  --judge-model <model-id>     Gateway model for the LLM-as-judge
                               (default: deepseek/deepseek-v4-pro-0813 via OpenRouter)
  --quick, -q                  Run only quick-tagged scenarios
  --scenario, -s <id>          Run a single scenario by ID
  --feature, -f <name>         Run scenarios for a specific interaction feature
  --output, -o <path>          Output JSON path (default: eval-results.json)
  --help, -h                   Show this help

Harness model examples:
  --harness codex        --model gpt-5.6-luna
  --harness claude       --model haiku
  --harness opencode     --model openrouter/z-ai/glm-4.7-flash
  --harness cursor-agent --model auto

Environment variables:
  OPENROUTER_API_KEY  Required for the judge (default provider)
  ANTHROPIC_API_KEY   Required when --judge-model is an Anthropic model

The selected harness authenticates itself — its own login or key, not one of
these. Nothing here is injected into the harness subprocess.

Output:
  Console: scenario progress written to stderr
  JSON:    eval-results.json (or --output path) with full rubric scores
`);
}

// ---------------------------------------------------------------------------
// API key validation
// ---------------------------------------------------------------------------

function validateHarness(harness?: string): void {
	if (harness && !isEvalHarnessName(harness)) {
		process.stderr.write(
			`[eval] Error: unknown harness "${harness}". Choose one of: ${EVAL_HARNESSES.join(", ")}.\n`,
		);
		process.exit(1);
	}
}

/** The JUDGE's key — the harness brings its own auth and is never handed one. */
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

	// Validate selection + judge key before doing any work
	validateHarness(args.harness);
	validateApiKey(args.judgeModel);

	process.stderr.write("[eval] Starting HyperIdle Eval Framework\n");
	process.stderr.write(`[eval] Harness: ${args.harness ?? "codex"}\n`);
	process.stderr.write(`[eval] Model: ${args.model ?? "(harness default)"}\n`);
	process.stderr.write(
		`[eval] Judge model: ${args.judgeModel ?? "deepseek/deepseek-v4-pro-0813 (OpenRouter default)"}\n`,
	);
	if (args.quick) {
		process.stderr.write("[eval] Mode: quick (tagged scenarios only)\n");
	}

	try {
		await runEval({
			harness: args.harness,
			model: args.model,
			judgeModel: args.judgeModel,
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
