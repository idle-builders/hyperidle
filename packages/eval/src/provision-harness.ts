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
import { AdapterPool } from "@hyperidle/server/harness/adapter-pool";
import { BuiltinHarnessAdapter } from "@hyperidle/server/harness/builtin-harness-adapter";
import { LocalSandboxAdapter } from "@hyperidle/server/harness/local-sandbox-adapter";
import { provisionSession } from "@hyperidle/server/services/session-provisioning";
import type { EventBus, ResolvedModel } from "@hyperidle/shared";
import type { TriggerResult } from "./types.js";

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
	const workspace = new LocalSandboxAdapter();
	const pool = new AdapterPool();

	// Register a BuiltinHarnessAdapter with maxIterations: 20 to limit eval cost.
	const builtinAdapter = new BuiltinHarnessAdapter({ maxIterations: 20 });
	pool.register("eval-builtin", builtinAdapter, {
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

	// Map "stopped" → "crashed": eval sessions cannot be manually stopped.
	// If stopSession is somehow called (e.g. via a tool), treat as crashed.
	const outcome: "completed" | "crashed" = result.outcome === "completed" ? "completed" : "crashed";

	return {
		sessionId: result.sessionId,
		outcome,
		totalCostCents: result.totalCostCents,
		taskId: result.taskId,
		durationMs,
	};
}
