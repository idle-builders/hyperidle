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

import {
	buildRunOrchestrationComposition,
	type RunOrchestrationHarnessRuntimeAdapter,
	type RunOrchestrationReturnStatusToolAdapter,
} from "@hyperidle/agent-orchestration";
import type { HyperIdleDb } from "@hyperidle/db";
import type { ResolvedModel } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import {
	AdapterPool,
	BuiltinHarnessAdapter,
	createReturnEnforcement,
	createSandboxAdapter,
	provisionHarnessEnvironment,
} from "@hyperidle/harness-registry";
import { DirectHarnessAdapter } from "./direct-harness-adapter.js";
import { returnStatusTool } from "@hyperidle/harness-registry/mcp";
import { readServerConfig } from "@hyperidle/settings";
import { requireRunnableAgent } from "@hyperidle/users";
import { bakeAgentRunnableConfig } from "@hyperidle/work-intent-port";
import type { TriggerResult } from "./types.js";

/**
 * @lore AU31 §2.3/§5: `@hyperidle/core-api/session` is DELETED — `runSession`
 * moved to the orchestration face (`buildRunOrchestrationComposition`). Eval
 * builds its OWN execution adapters (real `createReturnEnforcement`/
 * `provisionHarnessEnvironment`/`returnStatusTool`, the same pieces
 * `bootAgentExecution` wires production-side) because it drives a session
 * with no server or composed app in the picture — no `mcpBridgeRegistry`/
 * `mcpBaseUrl` is ever supplied below (unchanged from before this move), so
 * `openMcpBridge`/`closeMcpBridge` are never actually dialled (`provisioner.
 * ts`'s own `if (mcpBridgeRegistry && mcpBaseUrl)` guard). No `CoreApiTransport`
 * is supplied either — an eval scenario invoking a `CoreApiPort`-backed
 * domain tool would throw the same "not configured" error the deleted
 * ambient global threw when nothing had registered, which was already true
 * before this move (eval never registered one).
 */
function buildEvalHarnessRuntimeAdapter(): RunOrchestrationHarnessRuntimeAdapter {
	const enforcementRegistry = createReturnEnforcement();
	return {
		enforcementRegistry,
		createReturnGate: (requiredReturnActions) =>
			enforcementRegistry.createGate(requiredReturnActions),
		evaluateReturn: (gate, endReason) => enforcementRegistry.evaluate(gate, endReason),
		provisionReturnHook: async (options) => {
			await provisionHarnessEnvironment({ ...options, token: options.bridgeToken });
		},
		writeCliMcpConfig: (options) => provisionHarnessEnvironment(options),
		openMcpBridge: () => {
			throw new Error("eval sessions never supply an MCP bridge — this should be unreachable.");
		},
		closeMcpBridge: async () => {},
	};
}

const evalReturnStatusToolAdapter: RunOrchestrationReturnStatusToolAdapter = {
	forRegistry: (registry) => returnStatusTool.forRegistry(registry),
};

/** @internal The eval-builtin adapter name. */
const EVAL_BUILTIN_NAME = "eval-builtin";
/** @internal The eval-external adapter name. */
const EVAL_EXTERNAL_NAME = "eval-external";
export interface EvalProvisionDeps {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly resolvedModel: ResolvedModel;
	readonly sandboxBasePath: string;
}

/**
 * Run provisionSession for an eval scenario.
 *
 * Assembles AdapterPool (with BuiltinHarnessAdapter or external adapter),
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
 *
 * @lore T10: harnessKind:"external" registers the ExternalShapedAdapter
 * (returnEnforcement:"none" — Layer-B re-prompt loop only). Adapter selection:
 * 1. If the `claude` CLI binary is available: use CliHarnessAdapter (real subprocess).
 * 2. Else: use ExternalShapedAdapter (direct LLM call, reads AGENTS.md from sandbox).
 * Both prove the Layer-B re-prompt loop — neither uses Layer-A in-turn forcing.
 */
export async function runEvalSession(
	deps: EvalProvisionDeps,
	params: {
		readonly taskId: string;
		readonly agentId: string;
		/** The teamId value — mapped to productId in ProvisionSessionParams. */
		readonly teamId: string;
		/**
		 * T10: Select the harness kind.
		 * "builtin" (default): uses BuiltinHarnessAdapter (Layer-A, in-turn hook).
		 * "external": uses external-shaped adapter (Layer-B, re-prompt loop only).
		 */
		readonly harnessKind?: "builtin" | "external";
	},
): Promise<TriggerResult> {
	const workspace = createSandboxAdapter("local");
	const pool = new AdapterPool();

	const harnessKind = params.harnessKind ?? "builtin";

	if (harnessKind === "external") {
		const externalAdapter = new DirectHarnessAdapter({
			model: deps.resolvedModel,
			returnEnforcement: "none",
			maxTokens: 1024,
			tools: [
				{
					name: "submit_review",
					description: "Submit completed work for review.",
					inputSchema: {
						type: "object",
						properties: { message: { type: "string" } },
						required: ["message"],
					},
				},
			],
		});
		pool.register(EVAL_EXTERNAL_NAME, externalAdapter, {
			name: "Eval External Real-Model Adapter",
			kind: "local",
			type: "builtin",
			modelProviders: ["anthropic", "openrouter", "openai-compatible"],
			maxConcurrent: 1,
		});
	} else {
		// Default: Register a BuiltinHarnessAdapter with maxIterations: 20 to limit eval cost.
		const builtinAdapter = new BuiltinHarnessAdapter({ maxIterations: 20 });
		pool.register(EVAL_BUILTIN_NAME, builtinAdapter, {
			name: "Eval Built-in Harness",
			kind: "local",
			type: "builtin",
			modelProviders: ["anthropic", "openrouter", "openai-compatible"],
			maxConcurrent: 1,
		});
	}

	const startMs = Date.now();

	// AU21 §9 Increment 12 (Decision H3), Wave E: this "one-shot" seam calls
	// `provisionSession` directly, bypassing the durable emit-time resolver
	// pipeline entirely — so it must supply the baked `agentConfig`/
	// `harnessDisabled` `admitSession` now REQUIRES itself, same as it already
	// supplies `resolvedModel` itself instead of letting `run-orchestration`
	// resolve it. `requireRunnableAgent` is the SAME shared invariant every
	// per-kind resolver validates against before baking; a deactivated agent
	// throws here, before any session is provisioned — no live-read
	// regression versus the pre-Wave-E behavior (which performed this exact
	// check live, inside `admitSession`, every eval run).
	const agent = await requireRunnableAgent(deps.db, params.agentId);
	const { harnessDisabled } = await readServerConfig(deps.db);

	const composition = buildRunOrchestrationComposition({
		harnessRuntime: buildEvalHarnessRuntimeAdapter(),
		returnStatusTool: evalReturnStatusToolAdapter,
	});
	const result = await composition.runSession(
		{
			db: deps.db,
			eventBus: deps.eventBus,
			adapterPool: pool,
			workspace,
			// MCP bridge omitted — optional in ProvisionSessionDeps
		},
		{
			mode: "one-shot",
			completion: "await",
			input: {
				taskId: params.taskId,
				agentId: params.agentId,
				// @lore X7 U1: productId receives the teamId value.
				// ProvisionSessionParams.productId is the field name (kept for backward
				// compat) but the value is always a teams.id (which IS the teamId).
				productId: params.teamId,
				sandboxBasePath: deps.sandboxBasePath,
				resolvedModel: deps.resolvedModel,
				agentConfig: bakeAgentRunnableConfig(agent),
				harnessDisabled,
				// No cost cap during eval — cost is tracked but not capped.
			},
		},
	);
	if (result.mode !== "completed") throw new Error("Eval run did not complete");

	const durationMs = Date.now() - startMs;

	// T9 WARNING-B: Map outcomes to TriggerResult.
	// "completed" → "completed", "not_returned" → "not_returned" (first-class).
	// "stopped" → "crashed" (eval sessions cannot be manually stopped).
	// "budget_exhausted" | "crashed" → "crashed".
	const outcome: "completed" | "crashed" | "not_returned" =
		result.outcome === "completed"
			? "completed"
			: result.outcome === "not_returned"
				? "not_returned"
				: "crashed";

	// T10: Surface forceReturnCount from ProvisionSessionResult directly.
	// result.forceReturnCount is the unified Layer-A + Layer-B count set by runSession.
	// This works for ALL adapter types (builtin, cli, external) — not just builtin.
	const forceReturnCount = result.forceReturnCount;

	return {
		sessionId: result.sessionId,
		outcome,
		taskId: result.taskId ?? params.taskId,
		durationMs,
		// Return verdict and force count for eval judges.
		returnVerdict: result.returnVerdict,
		forceReturnCount,
	};
}
