/**
 * X7: Eval Framework types.
 *
 * These interfaces define the contract that eval scenarios implement.
 * Framework-agnostic: X8 adds scenarios without touching framework code.
 *
 * @lore X7: Evals are NOT tests. Tests are deterministic, scripted, and run in
 * CI. Evals require real LLM calls, are non-deterministic, and benchmark system
 * quality. They are never part of `npm run verify` or `npm run test`. See AC10.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { ResolvedModel } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";

// Re-export for consumers of @hyperidle/eval
export type { HyperIdleDb, ResolvedModel };

// ---------------------------------------------------------------------------
// Seeding types
// ---------------------------------------------------------------------------

/** Context provided to seed functions. */
export interface SeedContext {
	/** Ephemeral PGlite-backed Drizzle DB instance with full schema. */
	readonly db: HyperIdleDb;
}

/** The IDs a seed function must return so the trigger knows what to provision. */
export interface ScenarioSeedResult {
	readonly teamId: string;
	readonly agentId: string;
	readonly taskId: string;
	/** @lore BB1: formerly betId — root tasks replace bets. */
	readonly rootTaskId: string;
	/** Sandbox base path for LocalSandboxAdapter. */
	readonly sandboxBasePath: string;
}

/** Context provided to trigger functions. */
export interface TriggerContext {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly seedResult: ScenarioSeedResult;
	/** Pre-resolved model from --model flag or default. */
	readonly resolvedModel: ResolvedModel;
}

/**
 * Result of trigger execution.
 *
 * @lore X7: outcome narrows SessionOutcome ("completed" | "crashed" | "stopped")
 * to just "completed" | "crashed" | "not_returned". "stopped" maps to "crashed"
 * (eval sessions cannot be manually stopped). "not_returned" is a first-class
 * outcome for force-return scenarios.
 *
 * @lore WARNING-B: TriggerResult is widened to carry `outcome: "not_returned"`,
 * `returnVerdict`, and `forceReturnCount` so the force-return eval judges can assert
 * that a session is never silently completed-without-return, and verify the forcing
 * message actually fired.
 */
export interface TriggerResult {
	readonly sessionId: string;
	readonly outcome: "completed" | "crashed" | "not_returned";
	readonly taskId: string;
	/** Wall-clock duration in milliseconds. */
	readonly durationMs: number;
	/**
	 * Return verdict from the provisioning drain ("returned" | "not_returned").
	 * Absent for sessions that crashed before the gate was evaluated.
	 */
	readonly returnVerdict?: "returned" | "not_returned";
	/**
	 * Number of force-continue re-injections applied by the builtin
	 * Tier-1 harness this session. Zero on non-builtin harnesses or if no forcing
	 * was needed. Absent on crashed sessions.
	 */
	readonly forceReturnCount?: number;
}

// ---------------------------------------------------------------------------
// Scoring rubric types
// ---------------------------------------------------------------------------

/** A single scoring dimension in a rubric. */
export interface RubricDimension {
	/** Stable identifier, e.g. "tool_selection_correctness". */
	readonly id: string;
	/** Human-readable label for reports. */
	readonly label: string;
	/**
	 * Judge function. Receives the post-session DB state and returns a score.
	 * Score is 0.0 (fail) to 1.0 (perfect). Fractional scores indicate partial success.
	 * The judge can be rule-based (DB query) or LLM-as-judge.
	 */
	readonly judge: (ctx: JudgeContext) => Promise<DimensionScore>;
}

export interface JudgeContext {
	readonly db: HyperIdleDb;
	readonly seedResult: ScenarioSeedResult;
	readonly triggerResult: TriggerResult;
	/** The resolved model, available for LLM-as-judge calls. */
	readonly resolvedModel: ResolvedModel;
}

export interface DimensionScore {
	/** 0.0 to 1.0. */
	readonly score: number;
	/** Optional qualitative note from the judge explaining the score. */
	readonly note?: string;
}

/** The full rubric for a scenario. */
export interface ScoringRubric {
	readonly dimensions: readonly RubricDimension[];
}

// ---------------------------------------------------------------------------
// Scenario contract
// ---------------------------------------------------------------------------

/** The contract that X8 scenarios implement. Framework-agnostic — X8 adds
 * scenarios without touching framework code. */
export interface EvalScenario {
	/** Unique identifier, e.g. "poc-session-notes". Used in report + CLI filter. */
	readonly id: string;
	/** Human-readable description shown in report output. */
	readonly description: string;
	/** Interaction name this scenario tests. Used for --feature filtering and report grouping. */
	readonly feature: string;
	/** Tags for --quick filtering. Scenarios tagged "quick" run in quick mode. */
	readonly tags: readonly string[];
	/**
	 * Populate the DB with realistic world state. Receives a seeded DB
	 * (migrations applied, no application data). Returns the IDs needed
	 * to trigger the session.
	 */
	readonly seed: (ctx: SeedContext) => Promise<ScenarioSeedResult>;
	/**
	 * Trigger: assign a task to an agent and run a real session through
	 * provisionSession. The framework calls this after seeding. Returns
	 * the provisionSession result.
	 */
	readonly trigger: (ctx: TriggerContext) => Promise<TriggerResult>;
	/** Scoring rubric: named dimensions with judge functions. */
	readonly rubric: ScoringRubric;
}

// ---------------------------------------------------------------------------
// Report types
// ---------------------------------------------------------------------------

export interface DimensionReport {
	readonly dimensionId: string;
	readonly label: string;
	readonly score: number;
	readonly note?: string;
}

/** Per-scenario result in the report. */
export interface ScenarioReport {
	readonly scenarioId: string;
	readonly description: string;
	readonly model: string;
	readonly durationMs: number;
	readonly outcome: "completed" | "crashed" | "not_returned";
	readonly dimensions: readonly DimensionReport[];
	/** Aggregate score: arithmetic mean of dimension scores. */
	readonly aggregateScore: number;
	/**
	 * Token usage by model tier for this scenario.
	 * Populated from tasks.tokensActualJson after session completes.
	 *
	 * @lore X7: Section 19 addendum — merged into canonical type per arch critique.
	 * @lore BB1: token data is queried from tasks.tokensActualJson (moved from
	 * bets.tokensActualJson when the bets table was dropped) rather than from
	 * provisionSession's return value (which does not expose tokens).
	 */
	readonly tokensByTier: Record<string, { prompt: number; completion: number }>;
}

/** Per-feature score breakdown in the eval report. */
export interface FeatureBreakdown {
	readonly feature: string;
	readonly scenarioCount: number;
	readonly averageScore: number;
	readonly scenarioIds: readonly string[];
}

/** Top-level eval report written to eval-results.json. */
export interface EvalReport {
	readonly runId: string;
	readonly timestamp: string;
	readonly model: string;
	readonly mode: "full" | "quick";
	readonly scenarios: readonly ScenarioReport[];
	/** Aggregate across all scenarios. */
	readonly overallScore: number;
	readonly totalDurationMs: number;
	/**
	 * Aggregate token usage across all scenarios.
	 *
	 * @lore X7: Section 19 addendum — merged into canonical type per arch critique.
	 * @lore AU21 (harness-telemetry narrowing): `totalCostCents` (mirrored from
	 * `ProvisionSessionResult.totalCostCents`) is REMOVED — founder ruling kept
	 * only token usage. This field (already queried independently from
	 * `tasks.tokensActualJson` — @lore BB1: moved from bets — not from the
	 * harness's $-cost report) is unaffected and remains the eval report's real
	 * usage signal.
	 */
	readonly totalTokensByTier: Record<string, { prompt: number; completion: number }>;
	/** Per-feature score breakdown, computed from scenarios grouped by feature field. */
	readonly featureBreakdown: readonly FeatureBreakdown[];
}

// ---------------------------------------------------------------------------
// Runner options
// ---------------------------------------------------------------------------

export interface RunOptions {
	readonly model?: string;
	readonly quick: boolean;
	readonly filter?: string;
	/** Filter scenarios by feature name. Only run scenarios where scenario.feature === feature. */
	readonly feature?: string;
	readonly outputPath?: string;
}
