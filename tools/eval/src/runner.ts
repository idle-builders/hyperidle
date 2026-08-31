/**
 * X7: Eval runner — scenario discovery, serial execution, report generation.
 *
 * Serial execution is intentional: eval scenarios make real LLM calls and we
 * want deterministic ordering + clear cost attribution. Parallelism is a
 * follow-up optimization if run time becomes a bottleneck.
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyMigrations, createPgliteDb, type HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import { type EvalHarnessName, evalHarnessName, selectEvalHarness } from "./eval-harness.js";
import { scoreScenario } from "./scoring.js";
import type {
	EvalReport,
	EvalScenario,
	FeatureBreakdown,
	RunOptions,
	ScenarioReport,
	TriggerResult,
} from "./types.js";

// ---------------------------------------------------------------------------
// Migrations folder resolution
// ---------------------------------------------------------------------------

/**
 * @lore X7: ESM/CJS compat for __dirname — same pattern as test-utils.ts.
 * Eval runs as a standalone tsx script, not inside a vitest worker.
 */
function resolveDirname(): string {
	const cjsDirname = Reflect.get(globalThis, "__dirname") as string | undefined;
	return cjsDirname ?? fileURLToPath(new URL(".", import.meta.url));
}

function resolveMigrationsFolder(): string {
	const dirname = resolveDirname();
	// tools/eval/src → framework/db/drizzle
	return resolve(dirname, "../../../framework/db/drizzle");
}

// ---------------------------------------------------------------------------
// Ephemeral DB lifecycle
// ---------------------------------------------------------------------------

/**
 * Create a fresh PGlite instance (per-boot tmp dir) with all migrations applied.
 *
 * Each eval scenario gets its own PGlite. This provides complete isolation:
 * no cross-scenario state leakage. The ~150ms migration overhead is negligible
 * compared to the seconds-long LLM calls.
 *
 * @lore X7: We do NOT use createTestDb() from @hyperidle/db/test-utils because
 * test-utils is coupled to vitest (worker pool, IPC disconnect handler). The
 * eval runs as a standalone tsx script, not inside a vitest worker. Instead we
 * compose the database package's own `db:client` exports —
 * applyMigrations(dataDir, migrationsFolder) against a per-boot tmp dir, then
 * createPgliteDb(dataDir) on the same dir — rather than hand-rolling a
 * drizzle(client, { schema }) client.
 */
export async function createEvalDb(): Promise<{ db: HyperIdleDb; close: () => Promise<void> }> {
	const dataDir = await mkdtemp(join(tmpdir(), "eval-db-"));
	await applyMigrations(dataDir, resolveMigrationsFolder());
	const { db, close } = await createPgliteDb(dataDir);
	// @lore AU32: `createPgliteDb`'s own `close()` only closes the client handle — it does not
	// know it was handed a per-boot `mkdtemp` directory rather than an in-memory database, so it
	// cannot remove one. The caller that composed the tmp dir is the one that has to clean it up.
	return {
		db,
		close: async () => {
			await close();
			await rm(dataDir, { recursive: true, force: true });
		},
	};
}

// ---------------------------------------------------------------------------
// Judge model resolution
// ---------------------------------------------------------------------------

/**
 * The judge's model, resolved straight from the environment.
 *
 * @lore This used to go through `resolveModel` and a `ModelGatewayConfig` built
 * from the CLI flag. The gateway is gone with the built-in harness, and the
 * judge never needed it: it makes one Anthropic-SDK call against an
 * OpenAI-compatible base URL, so a provider, a key and a model id are the whole
 * of what it wants. Reading them here keeps the judge working without a gateway
 * to configure.
 *
 * The judge is deliberately NOT the harness under measurement — it scores what
 * the harness produced, so it resolves its own model on its own axis.
 */
/** What the LLM-as-judge needs to make its scoring call. */
export interface JudgeModel {
	readonly model: string;
	readonly apiKey: string;
	readonly baseUrl: string;
}

/** The judge's default when `--judge-model` is not given. */
const DEFAULT_JUDGE_MODEL = "deepseek/deepseek-v4-pro";

function resolveJudgeModel(modelOverride?: string): JudgeModel {
	const model = modelOverride ?? DEFAULT_JUDGE_MODEL;
	// An id with a "/" is an OpenRouter route; "claude-*" is Anthropic direct.
	// Anything else is an endpoint the operator is pointing us at themselves.
	if (model.startsWith("claude-")) {
		return {
			model,
			apiKey: process.env.ANTHROPIC_API_KEY ?? "",
			baseUrl: "https://api.anthropic.com",
		};
	}
	return {
		model,
		apiKey: process.env.OPENROUTER_API_KEY ?? "",
		baseUrl: "https://openrouter.ai/api/v1",
	};
}

// ---------------------------------------------------------------------------
// Scenario discovery
// ---------------------------------------------------------------------------

/**
 * Discover all scenarios by importing from scenarios/index.ts.
 * Each named export in that module is an EvalScenario.
 */
export async function discoverScenarios(): Promise<EvalScenario[]> {
	const mod = (await import("./scenarios/index.js")) as Record<string, unknown>;
	const scenarios: EvalScenario[] = [];
	for (const value of Object.values(mod)) {
		if (isEvalScenario(value)) {
			scenarios.push(value);
		} else if (Array.isArray(value)) {
			for (const item of value) {
				if (isEvalScenario(item)) {
					scenarios.push(item);
				}
			}
		}
	}
	return scenarios;
}

function isEvalScenario(value: unknown): value is EvalScenario {
	return (
		value !== null &&
		typeof value === "object" &&
		"id" in value &&
		"description" in value &&
		"feature" in value &&
		"tags" in value &&
		"seed" in value &&
		"trigger" in value &&
		"rubric" in value
	);
}

// ---------------------------------------------------------------------------
// Token extraction from root task
// @lore BB1: tokensActualJson moved from bets to tasks. We query the root task
// row, which accumulates this task's own session token usage.
// ---------------------------------------------------------------------------

async function extractTokensByTier(
	db: HyperIdleDb,
	rootTaskId: string,
): Promise<Record<string, { prompt: number; completion: number }>> {
	const { tasks } = await import("@hyperidle/db");
	const { eq } = await import("drizzle-orm");

	const [task] = await db
		.select({ tokensActualJson: tasks.tokensActualJson })
		.from(tasks)
		.where(eq(tasks.id, rootTaskId))
		.limit(1);

	if (!task?.tokensActualJson) return {};

	try {
		const parsed = JSON.parse(task.tokensActualJson) as {
			byTier?: Record<string, { prompt: number; completion: number }>;
		};
		return parsed.byTier ?? {};
	} catch {
		return {};
	}
}

// ---------------------------------------------------------------------------
// Execution loop
// ---------------------------------------------------------------------------

/**
 * Run eval scenarios serially.
 * Each scenario gets its own ephemeral PGlite DB.
 */
export async function runEval(options: RunOptions): Promise<EvalReport> {
	const runId = randomUUID();
	const timestamp = new Date().toISOString();

	// Fix the harness before anything is seeded — a seeded agent's `harness_type`
	// and `model_id` come from this selection, and an absent binary hard-fails
	// here rather than mid-suite.
	selectEvalHarness((options.harness ?? "codex") as EvalHarnessName, options.model ?? null);
	const harnessLabel = evalHarnessName();
	const judgeModel = resolveJudgeModel(options.judgeModel);
	const modelLabel = options.model ?? "(harness default)";

	let scenarios = await discoverScenarios();

	// Filter by --quick mode (only "quick"-tagged scenarios)
	if (options.quick) {
		scenarios = scenarios.filter((s) => s.tags.includes("quick"));
	}

	// Filter by --scenario flag
	if (options.filter) {
		scenarios = scenarios.filter((s) => s.id === options.filter);
	}

	// Filter by --feature flag
	if (options.feature) {
		scenarios = scenarios.filter((s) => s.feature === options.feature);
		if (scenarios.length === 0) {
			const allScenarios = await discoverScenarios();
			const features = [...new Set(allScenarios.map((s) => s.feature))].sort();
			process.stderr.write(
				`[eval] No scenarios for feature "${options.feature}". Available features:\n`,
			);
			for (const f of features) {
				process.stderr.write(`  - ${f}\n`);
			}
		}
	}

	const scenarioReports: ScenarioReport[] = [];
	const totalStart = Date.now();

	for (const scenario of scenarios) {
		process.stderr.write(`\n[eval] Running: ${scenario.id}...\n`);

		const { db, close } = await createEvalDb();
		let triggerResult: TriggerResult | null = null;
		let seedResult: Awaited<ReturnType<typeof scenario.seed>> | null = null;

		try {
			// Step 1: Seed
			seedResult = await scenario.seed({ db });

			// Step 2: Trigger
			const eventBus = new EventBus();
			const triggerCtx = {
				db,
				eventBus,
				seedResult,
			};
			triggerResult = await scenario.trigger(triggerCtx);

			process.stderr.write(
				`[eval]   outcome=${triggerResult.outcome} duration=${triggerResult.durationMs}ms\n`,
			);

			// Step 3: Score
			const judgeCtx = {
				db,
				seedResult,
				triggerResult,
				judgeModel,
			};
			const { dimensions, aggregateScore } = await scoreScenario(scenario.rubric, judgeCtx);

			// Step 4: Extract token data from bet
			const tokensByTier = await extractTokensByTier(db, seedResult.rootTaskId);

			process.stderr.write(`[eval]   score=${aggregateScore.toFixed(3)}\n`);

			scenarioReports.push({
				scenarioId: scenario.id,
				description: scenario.description,
				model: modelLabel,
				durationMs: triggerResult.durationMs,
				outcome: triggerResult.outcome,
				dimensions,
				aggregateScore,
				tokensByTier,
			});
		} catch (err) {
			const durationMs = Date.now() - totalStart;
			const errorMsg = err instanceof Error ? err.message : String(err);
			process.stderr.write(`[eval]   FAILED: ${errorMsg}\n`);

			scenarioReports.push({
				scenarioId: scenario.id,
				description: scenario.description,
				model: modelLabel,
				durationMs: triggerResult?.durationMs ?? durationMs,
				outcome: "crashed",
				dimensions: [],
				aggregateScore: 0,
				tokensByTier: {},
			});
		} finally {
			// Always close DB regardless of success/failure
			await close();
		}
	}

	const totalDurationMs = Date.now() - totalStart;
	const overallScore =
		scenarioReports.length > 0
			? scenarioReports.reduce((sum, r) => sum + r.aggregateScore, 0) / scenarioReports.length
			: 0;

	// Aggregate token counts
	const totalTokensByTier: Record<string, { prompt: number; completion: number }> = {};
	for (const report of scenarioReports) {
		for (const [tier, counts] of Object.entries(report.tokensByTier)) {
			const existing = totalTokensByTier[tier] ?? { prompt: 0, completion: 0 };
			totalTokensByTier[tier] = {
				prompt: existing.prompt + counts.prompt,
				completion: existing.completion + counts.completion,
			};
		}
	}

	// Compute per-feature breakdown
	const featureMap = new Map<string, ScenarioReport[]>();
	for (const report of scenarioReports) {
		// Find feature from the matched scenario
		const scenario = (await discoverScenarios()).find((s) => s.id === report.scenarioId);
		const feature = scenario?.feature ?? "unknown";
		const existing = featureMap.get(feature) ?? [];
		existing.push(report);
		featureMap.set(feature, existing);
	}
	const featureBreakdown: FeatureBreakdown[] = [];
	for (const [feature, featureReports] of featureMap) {
		const averageScore =
			featureReports.length > 0
				? featureReports.reduce((sum, r) => sum + r.aggregateScore, 0) / featureReports.length
				: 0;
		featureBreakdown.push({
			feature,
			scenarioCount: featureReports.length,
			averageScore,
			scenarioIds: featureReports.map((r) => r.scenarioId),
		});
	}
	featureBreakdown.sort((a, b) => a.feature.localeCompare(b.feature));

	const report: EvalReport = {
		runId,
		timestamp,
		harness: harnessLabel,
		model: modelLabel,
		mode: options.quick ? "quick" : "full",
		scenarios: scenarioReports,
		overallScore,
		totalDurationMs,
		totalTokensByTier,
		featureBreakdown,
	};

	// Write JSON report
	const outputPath = options.outputPath ?? "eval-results.json";
	fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf-8");
	process.stderr.write(`\n[eval] Report written to ${outputPath}\n`);
	process.stderr.write(
		`[eval] Overall score: ${overallScore.toFixed(3)} (${scenarioReports.length} scenarios) on ${harnessLabel}\n`,
	);

	return report;
}
