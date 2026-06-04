/**
 * Eval runner entry point.
 *
 * Usage:
 *   npm run eval                         -- mock mode (all scenarios)
 *   npm run eval -- --live               -- live mode (requires API key)
 *   npm run eval -- --scenario <id>      -- single scenario
 *
 * @lore X7: Standalone script, not Vitest. Evals are not unit tests:
 * they are long-running, optionally non-deterministic in live mode, and
 * produce a structured JSON report artifact. See plans/X7/architecture.md.
 */

import * as os from "node:os";
import * as path from "node:path";
import { createTestDb } from "@hyperidle/db";
import {
	AdapterPool,
	LocalWorkspaceAdapter,
	type ProvisionSessionDeps,
	provisionSession,
} from "@hyperidle/server/session";
import { EventBus } from "@hyperidle/shared";
import { EvalHarnessAdapter } from "./eval-harness-adapter.js";
import { writeReport } from "./report.js";
import { allScenarios } from "./scenarios/index.js";
import { seedWorld } from "./seed.js";
import type { EvalReport, EvalScenario, EvalScenarioResult } from "./types.js";

async function runScenario(scenario: EvalScenario, live: boolean): Promise<EvalScenarioResult> {
	const start = Date.now();
	const handle = await createTestDb();

	try {
		// 1. Seed the world.
		await seedWorld(handle.db, scenario.seed);

		// 2. Create adapter.
		let adapter: EvalHarnessAdapter;
		if (live) {
			// Dynamic import so the module is only loaded when --live is passed.
			const { LiveHarnessAdapter } = await import("./live-harness-adapter.js");
			const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.OPENROUTER_API_KEY ?? "";
			// LiveHarnessAdapter constructor takes apiKey
			adapter = new LiveHarnessAdapter(apiKey) as unknown as EvalHarnessAdapter;
		} else {
			adapter = new EvalHarnessAdapter(scenario.script);
		}

		// 3. Build deps.
		const eventBus = new EventBus();
		const pool = new AdapterPool();
		pool.register("eval", adapter, {
			name: "eval-adapter",
			kind: "local",
			modelProviders: ["anthropic"],
			maxConcurrent: 1,
		});

		const workspace = new LocalWorkspaceAdapter();
		const workspaceBasePath = path.join(os.tmpdir(), "hyperidle-eval");

		const deps: ProvisionSessionDeps = {
			db: handle.db,
			eventBus,
			adapterPool: pool,
			workspace,
		};

		// 4. Run the session.
		const sessionResult = await provisionSession(deps, {
			taskId: scenario.trigger.taskId,
			agentId: scenario.trigger.agentId,
			productId: scenario.seed.team.id,
			workspaceBasePath,
			modelTier: scenario.trigger.modelTier,
		});

		// 5. Assert outcomes.
		await scenario.assert({
			db: handle.db,
			sessionResult,
			events: [],
		});

		return {
			scenarioId: scenario.id,
			scenarioName: scenario.name,
			passed: true,
			durationMs: Date.now() - start,
			costCents: sessionResult.totalCostCents,
			mode: live ? "live" : "mock",
		};
	} catch (error) {
		return {
			scenarioId: scenario.id,
			scenarioName: scenario.name,
			passed: false,
			durationMs: Date.now() - start,
			costCents: 0,
			mode: live ? "live" : "mock",
			failure: {
				message: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			},
		};
	} finally {
		await handle.close();
	}
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const live = args.includes("--live");
	const scenarioFilter = args.includes("--scenario")
		? args[args.indexOf("--scenario") + 1]
		: undefined;

	// Gate live mode on API key presence.
	if (live && !process.env.ANTHROPIC_API_KEY && !process.env.OPENROUTER_API_KEY) {
		process.stderr.write("--live requires ANTHROPIC_API_KEY or OPENROUTER_API_KEY\n");
		process.exit(1);
	}

	const scenarios = scenarioFilter
		? allScenarios.filter((s) => s.id === scenarioFilter)
		: allScenarios;

	if (scenarios.length === 0) {
		process.stderr.write(
			`No scenarios found${scenarioFilter ? ` matching "${scenarioFilter}"` : ""}\n`,
		);
		process.exit(1);
	}

	const results: EvalScenarioResult[] = [];

	for (const scenario of scenarios) {
		const result = await runScenario(scenario, live);
		results.push(result);
		const icon = result.passed ? "PASS" : "FAIL";
		// biome-ignore lint/suspicious/noConsole: eval runner uses console for progress output
		console.log(`[${icon}] ${scenario.name} (${result.durationMs}ms)`);
		if (result.failure) {
			// biome-ignore lint/suspicious/noConsole: eval runner uses console for progress output
			console.log(`       ${result.failure.message}`);
		}
	}

	const report: EvalReport = {
		timestamp: new Date().toISOString(),
		mode: live ? "live" : "mock",
		scenarios: results,
		summary: {
			total: results.length,
			passed: results.filter((r) => r.passed).length,
			failed: results.filter((r) => !r.passed).length,
			totalDurationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
			totalCostCents: results.reduce((sum, r) => sum + r.costCents, 0),
		},
	};

	writeReport(report);

	const exitCode = report.summary.failed > 0 ? 1 : 0;
	process.exit(exitCode);
}

main().catch((err) => {
	process.stderr.write(
		`Eval runner fatal error: ${err instanceof Error ? err.message : String(err)}\n`,
	);
	process.exit(1);
});
