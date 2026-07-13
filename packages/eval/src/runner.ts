/**
 * X7: Eval runner — scenario discovery, serial execution, report generation.
 *
 * Serial execution is intentional: eval scenarios make real LLM calls and we
 * want deterministic ordering + clear cost attribution. Parallelism is a
 * follow-up optimization if run time becomes a bottleneck.
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { EnvCredentialResolver } from "@hyperidle/connections";
import { type HyperIdleDb, schema } from "@hyperidle/db";
import { resolveModelTier } from "@hyperidle/server/services/model-gateway";
import type { ModelGatewayConfig, ResolvedModel } from "@hyperidle/shared";
import { EventBus } from "@hyperidle/shared";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
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
	// packages/eval/src → packages/db/drizzle
	return resolve(dirname, "../../db/drizzle");
}

// ---------------------------------------------------------------------------
// Ephemeral DB lifecycle
// ---------------------------------------------------------------------------

/**
 * Create a fresh in-memory PGlite instance with all migrations applied.
 *
 * Each eval scenario gets its own PGlite. This provides complete isolation:
 * no cross-scenario state leakage. The ~150ms migration overhead is negligible
 * compared to the seconds-long LLM calls.
 *
 * @lore X7: We do NOT use createTestDb() from @hyperidle/db/test-utils because
 * test-utils is coupled to vitest (worker pool, IPC disconnect handler). The
 * eval runs as a standalone tsx script, not inside a vitest worker.
 */
export async function createEvalDb(): Promise<{ db: HyperIdleDb; close: () => Promise<void> }> {
	const client = new PGlite();
	await client.waitReady;
	const db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: resolveMigrationsFolder() });
	return {
		db,
		close: async () => {
			await client.close();
		},
	};
}

// ---------------------------------------------------------------------------
// Model resolution
// ---------------------------------------------------------------------------

/**
 * Build a ModelGatewayConfig for the given model override.
 *
 * Provider is inferred from the model ID:
 * - Contains "/" → openrouter provider (e.g. "moonshotai/kimi-k2")
 * - Starts with "claude-" → anthropic provider
 * - Otherwise → openai-compatible provider (requires baseUrl in env)
 */
function buildGatewayConfig(modelOverride?: string): ModelGatewayConfig {
	if (!modelOverride) {
		// @lore X7: Default to OpenRouter because OPENROUTER_API_KEY is the
		// configured provider. Anthropic models require ANTHROPIC_API_KEY which
		// may not be set. OpenRouter routes to many models including Anthropic.
		return {
			reasoning: { provider: "openrouter", model: "deepseek/deepseek-v4-pro" },
			workhorse: { provider: "openrouter", model: "deepseek/deepseek-v4-pro" },
			fast: { provider: "openrouter", model: "deepseek/deepseek-v4-flash" },
		};
	}

	let provider: "anthropic" | "openrouter" | "openai-compatible";

	if (modelOverride.includes("/")) {
		provider = "openrouter";
	} else if (modelOverride.startsWith("claude-")) {
		provider = "anthropic";
	} else {
		provider = "openai-compatible";
	}

	return {
		reasoning: { provider, model: modelOverride },
		workhorse: { provider, model: modelOverride },
		fast: { provider, model: modelOverride },
	};
}

async function resolveModel(modelOverride?: string): Promise<ResolvedModel> {
	const config = buildGatewayConfig(modelOverride);
	const resolver = new EnvCredentialResolver();
	return await resolveModelTier("workhorse", config, resolver);
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
// Token extraction from bet
// ---------------------------------------------------------------------------

async function extractTokensByTier(
	db: HyperIdleDb,
	betId: string,
): Promise<Record<string, { prompt: number; completion: number }>> {
	const { bets } = await import("@hyperidle/db");
	const { eq } = await import("drizzle-orm");

	const [bet] = await db
		.select({ tokensActualJson: bets.tokensActualJson })
		.from(bets)
		.where(eq(bets.id, betId))
		.limit(1);

	if (!bet?.tokensActualJson) return {};

	try {
		const parsed = JSON.parse(bet.tokensActualJson) as {
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

	const resolvedModel = await resolveModel(options.model);
	const modelLabel = resolvedModel.model;

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
				resolvedModel,
			};
			triggerResult = await scenario.trigger(triggerCtx);

			process.stderr.write(
				`[eval]   outcome=${triggerResult.outcome} cost=${triggerResult.totalCostCents}¢ duration=${triggerResult.durationMs}ms\n`,
			);

			// Step 3: Score
			const judgeCtx = {
				db,
				seedResult,
				triggerResult,
				resolvedModel,
			};
			const { dimensions, aggregateScore } = await scoreScenario(scenario.rubric, judgeCtx);

			// Step 4: Extract token data from bet
			const tokensByTier = await extractTokensByTier(db, seedResult.betId);

			process.stderr.write(`[eval]   score=${aggregateScore.toFixed(3)}\n`);

			scenarioReports.push({
				scenarioId: scenario.id,
				description: scenario.description,
				model: modelLabel,
				durationMs: triggerResult.durationMs,
				outcome: triggerResult.outcome,
				costCents: triggerResult.totalCostCents,
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
				costCents: triggerResult?.totalCostCents ?? 0,
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

	const totalCostCents = scenarioReports.reduce((sum, r) => sum + r.costCents, 0);

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
		model: modelLabel,
		mode: options.quick ? "quick" : "full",
		scenarios: scenarioReports,
		overallScore,
		totalDurationMs,
		totalCostCents,
		totalTokensByTier,
		featureBreakdown,
	};

	// Write JSON report
	const outputPath = options.outputPath ?? "eval-results.json";
	fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf-8");
	process.stderr.write(`\n[eval] Report written to ${outputPath}\n`);
	process.stderr.write(
		`[eval] Overall score: ${overallScore.toFixed(3)} (${scenarioReports.length} scenarios)\n`,
	);

	return report;
}
