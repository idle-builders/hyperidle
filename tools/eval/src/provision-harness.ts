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
import { bakeAgentRunnableConfig } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import {
	createLocalAdapterPool,
	createReturnEnforcement,
	createSandboxAdapter,
	provisionHarnessEnvironment,
	writePluginStdioMcpEntries,
} from "@hyperidle/harness-registry";
import { returnStatusTool } from "@hyperidle/harness-registry/mcp";
import { readServerConfig } from "@hyperidle/settings";
import { requireRunnableAgent } from "@hyperidle/users";
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
		writePluginStdioMcpEntries: (params) => writePluginStdioMcpEntries(params),
		openMcpBridge: () => {
			throw new Error("eval sessions never supply an MCP bridge — this should be unreachable.");
		},
		closeMcpBridge: async () => {},
	};
}

const evalReturnStatusToolAdapter: RunOrchestrationReturnStatusToolAdapter = {
	forRegistry: (registry) => returnStatusTool.forRegistry(registry),
};

export interface EvalProvisionDeps {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly sandboxBasePath: string;
}

/**
 * Run provisionSession for an eval scenario.
 *
 * Builds the SAME adapter pool production builds (`createLocalAdapterPool`),
 * so the harness an eval measures is the harness a user gets. The agent's own
 * `harness_type`/`model_id` — seeded from the run's `--harness`/`--model` —
 * pick the adapter and the model, through the ordinary provisioner path.
 *
 * MCP bridge is omitted (optional in ProvisionSessionDeps).
 *
 * Returns the ProvisionSessionResult mapped to TriggerResult with wall-clock
 * duration.
 *
 * @lore X7: "stopped" SessionOutcome is mapped to "crashed" because eval
 * sessions cannot be manually stopped. This narrowing satisfies the
 * TriggerResult.outcome type ("completed" | "crashed").
 *
 * @lore The eval used to assemble its own two-adapter pool: an in-process
 * `BuiltinHarnessAdapter` by default, and a direct single-call LLM adapter
 * under `harnessKind:"external"`. Both were direct model calls wearing the
 * adapter interface, so an eval score said something about the model and
 * almost nothing about HyperIdle's harness wiring — the MCP bridge, the
 * `.mcp.json` dialects, the return hook, none of it was exercised. Both are
 * gone; every eval session now spawns a real CLI.
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
	const workspace = createSandboxAdapter("local");
	const pool = await createLocalAdapterPool();

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
				// @lore No `resolvedModel`. It carried a gateway credential into the
				// session, and a CLI adapter forwards that key to its subprocess under
				// its own provider's variable name — handing codex an OpenRouter key as
				// OPENAI_API_KEY shadows the ChatGPT login it actually authenticates
				// with. A CLI harness brings its own auth; the model it should run
				// arrives as `selectedModel`, off the agent's own `model_id`.
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
