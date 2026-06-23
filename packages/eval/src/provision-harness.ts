/**
 * X7: Eval provision harness — wires up ProvisionSessionDeps without booting a server.
 *
 * @lore X7: We call provisionSession() directly instead of booting the Hono
 * server. The server route handler also calls provisionSession() — so eval
 * exercises identical behavior at zero cost: no port binding, no auth
 * middleware, no WebSocket setup.
 *
 * @lore X7: teamId → productId mapping. ProvisionSessionParams.productId
 * receives the teamId value (confirmed in sessions-routes.ts: productId: task.teamId).
 * The field name is kept for backward compat (see @lore U1 in session-provisioning.ts).
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { fabricStrategy } from "@hyperidle/fabric";
import { AdapterPool } from "@hyperidle/server/harness/adapter-pool";
import { BuiltinHarnessAdapter } from "@hyperidle/server/harness/builtin-harness-adapter";
import { LocalSandboxAdapter } from "@hyperidle/server/harness/local-sandbox-adapter";
import { provisionSession } from "@hyperidle/server/services/session-provisioning";
import { setActiveStrategy } from "@hyperidle/server/services/strategy-registry";
import type { EventBus, ResolvedModel } from "@hyperidle/shared";
import type { TriggerResult } from "./types.js";

/** @internal The eval-builtin adapter name, used to read forceReturnCount. */
const EVAL_BUILTIN_NAME = "eval-builtin";

export interface EvalProvisionDeps {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly resolvedModel: ResolvedModel;
	readonly resolvedFastModel?: ResolvedModel;
	readonly sandboxBasePath: string;
}

/**
 * Run provisionSession for an eval scenario.
 *
 * Assembles AdapterPool (with BuiltinHarnessAdapter only),
 * LocalSandboxAdapter, and calls provisionSession directly.
 * MCP bridge is omitted (optional in ProvisionSessionDeps).
 *
 * Returns the ProvisionSessionResult mapped to TriggerResult with wall-clock
 * duration.
 *
 * @lore X7: maxIterations is set to 20 for eval to limit cost per scenario.
 * The default of 50 would be too expensive for automated eval runs.
 *
 * @lore X7: "stopped" SessionOutcome is mapped to "crashed" because eval
 * sessions cannot be manually stopped. This narrowing satisfies the
 * TriggerResult.outcome type ("completed" | "crashed").
 */
export async function runEvalSession(
	deps: EvalProvisionDeps,
	params: {
		readonly taskId: string;
		readonly agentId: string;
		/** The teamId value — mapped to productId in ProvisionSessionParams. */
		readonly teamId: string;
	},
): Promise<TriggerResult> {
	// @lore X7 AL6: setActiveStrategy must be called before provisionSession.
	// The eval harness boots without a server process, so no boot-time strategy
	// registration happens. Set fabricStrategy here (the production default).
	setActiveStrategy(fabricStrategy);

	const workspace = new LocalSandboxAdapter();
	const pool = new AdapterPool();

	// Register a BuiltinHarnessAdapter with maxIterations: 20 to limit eval cost.
	const builtinAdapter = new BuiltinHarnessAdapter({ maxIterations: 20 });
	pool.register(EVAL_BUILTIN_NAME, builtinAdapter, {
		name: "Eval Built-in Harness",
		kind: "local",
		type: "builtin",
		modelProviders: ["anthropic", "openrouter", "openai-compatible"],
		maxConcurrent: 1,
	});

	const startMs = Date.now();

	const result = await provisionSession(
		{
			db: deps.db,
			eventBus: deps.eventBus,
			adapterPool: pool,
			workspace,
			// MCP bridge omitted — optional in ProvisionSessionDeps
		},
		{
			taskId: params.taskId,
			agentId: params.agentId,
			// @lore X7 U1: productId receives the teamId value.
			// ProvisionSessionParams.productId is the field name (kept for backward
			// compat) but the value is always a teams.id (which IS the teamId).
			productId: params.teamId,
			sandboxBasePath: deps.sandboxBasePath,
			resolvedModel: deps.resolvedModel,
			resolvedFastModel: deps.resolvedFastModel,
			// No cost cap during eval — cost is tracked but not capped.
			factoryCap: undefined,
		},
	);

	const durationMs = Date.now() - startMs;

	// AL6 v2 (T9 WARNING-B): Map outcomes to TriggerResult.
	// "completed" → "completed", "not_returned" → "not_returned" (first-class).
	// "stopped" → "crashed" (eval sessions cannot be manually stopped).
	// "budget_exhausted" | "crashed" → "crashed".
	const outcome: "completed" | "crashed" | "not_returned" =
		result.outcome === "completed"
			? "completed"
			: result.outcome === "not_returned"
				? "not_returned"
				: "crashed";

	// AL6 v2 (T9 WARNING-B): Surface forceReturnCount from the builtin adapter.
	// getSessionForceCount is a concrete-only method (not on HarnessAdapter interface),
	// so we call it directly on builtinAdapter.
	const forceReturnCount = builtinAdapter.getSessionForceCount(result.sessionId);

	return {
		sessionId: result.sessionId,
		outcome,
		totalCostCents: result.totalCostCents,
		taskId: result.taskId,
		durationMs,
		// AL6 v2: Return verdict and force count for eval judges.
		returnVerdict: result.returnVerdict,
		forceReturnCount,
	};
}
