/**
 * X7: Eval provision harness — wires up ProvisionSessionDeps with a real
 * MCP bridge and a real HTTP server so agents actually call tools.
 *
 * @lore X7: We call provisionSession() directly instead of booting the Hono
 * server. The server route handler also calls provisionSession() — so eval
 * exercises identical behavior at zero cost: no port binding, no auth
 * middleware, no WebSocket setup.
 *
 * @lore X7: teamId → productId mapping. ProvisionSessionParams.productId
 * receives the teamId value (confirmed in sessions-routes.ts: productId: task.teamId).
 * The field name is kept for backward compat (see @lore U1 in session-provisioning.ts).
 *
 * @lore artifacts-become-knowledge: eval sessions previously threw in
 * `openMcpBridge`, so agents had no tools to call. The fix starts a real
 * listening HTTP server (subprocess CLIs make real HTTP calls, so app.fetch
 * in-process is not enough) and mounts the MCP bridge as a pre-auth route.
 * Pattern mirrors `startLiveServer` in
 * `assistant-reply-live-harness.integration.test.ts` — the same proof the
 * harness lane uses, applied here.
 *
 * @lore BC5 T11: the `CoreApiPort` seam (`coreApiTransport`,
 * `createInProcessCoreApiTransport`) this file used to build and pass into
 * `buildRunOrchestrationComposition` is DELETED — `create_team`/`add_agent`,
 * the seam's last two tools, are gone with the `org` package they wrote
 * through.
 */

import { randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import {
	bootAgentOrchestration,
	buildRunOrchestrationComposition,
	type RunOrchestrationHarnessRuntimeAdapter,
	type RunOrchestrationReturnStatusToolAdapter,
} from "@hyperidle/agent-orchestration";
import {
	buildAgentOrchestrationPort,
	composeApiApplication,
	createInProcessAgentOrchestrationTransport,
} from "@hyperidle/core-api";
import { bootCoreApi } from "@hyperidle/core-api/boot";
import type { HyperIdleDb } from "@hyperidle/db";
import { assembleSessionDocuments } from "@hyperidle/document";
import { bakeAgentRunnableConfig } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import {
	createLocalAdapterPool,
	createReturnEnforcement,
	createSandboxAdapter,
	provisionHarnessEnvironment,
	writePluginStdioMcpEntries,
} from "@hyperidle/harness-registry";
import {
	createMcpToolBridge,
	type McpToolBridge,
	returnStatusTool,
} from "@hyperidle/harness-registry/mcp";
import { readServerConfig } from "@hyperidle/settings";
import * as work from "@hyperidle/task";
import { bakeTaskContextBundle } from "@hyperidle/task";
import { getTeam, requireRunnableAgent } from "@hyperidle/user";
import type { TriggerResult } from "./types.js";

// ---------------------------------------------------------------------------
// Live server — real HTTP server with MCP bridge mounted pre-auth
// ---------------------------------------------------------------------------

interface EvalLiveServer {
	readonly url: string;
	readonly mcpBridgeRegistry: McpToolBridge;
	readonly close: () => Promise<void>;
}

/**
 * Start a real Hono HTTP server (port 0 → OS-assigned) with both the
 * core-api and agent-orchestration layers composed, and the MCP bridge
 * mounted as a pre-auth route.
 *
 * The spawned CLI harness subprocess makes real HTTP calls to the MCP
 * bridge — `app.fetch` in-process is not enough. This is the same pattern
 * `startLiveServer` uses in the harness-lane integration test.
 *
 * Construction cycle (§3.2): the AgentOrchestrationPort transport is
 * deferred — it must dial the FULL composed app (with the `/api` prefix),
 * which does not exist until both layers have booted and been mounted.
 * Seam tool calls only happen once the session is running, after the cycle
 * is closed, so the deferred binding is always resolved in time.
 *
 * Caller MUST set `process.env.HYPERIDLE_API_KEY` to `evalApiKey` before
 * calling this function so the auth middleware (which reads it at boot time)
 * and `withActorTransport` (which reads it at call time) agree on the key.
 */
async function startEvalLiveServer(db: HyperIdleDb, eventBus: EventBus): Promise<EvalLiveServer> {
	const mcpBridgeRegistry = createMcpToolBridge({ enforcement: createReturnEnforcement() });

	// Deferred transport — the composed app does not exist yet.
	let realAgentOrchestrationTransport: ((req: Request) => Promise<Response>) | undefined;
	// biome-ignore lint/suspicious/useAwait: conditionally awaits the real transport; `async` required by the port type
	const agentOrchestrationTransport = async (req: Request): Promise<Response> => {
		if (!realAgentOrchestrationTransport) {
			throw new Error("AgentOrchestrationTransport called before the composed app was built.");
		}
		return realAgentOrchestrationTransport(req);
	};
	const agentOrchestrationPort = buildAgentOrchestrationPort(agentOrchestrationTransport);

	const agentOrchestrationBoot = await bootAgentOrchestration({ db, eventBus });
	const coreApiBoot = await bootCoreApi({
		db,
		eventBus,
		agentOrchestration: agentOrchestrationPort,
		onHarnessRedetect: () => agentOrchestrationBoot.inheritedReach.refresh(),
	});

	const composedApp = composeApiApplication({
		middleware: coreApiBoot.middleware,
		preAuthRegistrars: [
			(api) => coreApiBoot.registerPreAuthRoutes(api),
			(api) => agentOrchestrationBoot.registerPreAuthRoutes(api),
			(api) => {
				api.route("/", mcpBridgeRegistry.router);
			},
		],
		apps: [coreApiBoot.app, agentOrchestrationBoot.app],
	});

	// Close the construction cycle.
	realAgentOrchestrationTransport = createInProcessAgentOrchestrationTransport(composedApp);

	// Start a real listening HTTP server (CLI subprocesses make real HTTP calls).
	let resolvePort!: (port: number) => void;
	const portPromise = new Promise<number>((resolve) => {
		resolvePort = resolve;
	});
	const httpServer = serve({ fetch: composedApp.fetch, port: 0 }, (info) => resolvePort(info.port));
	const port = await portPromise;

	return {
		url: `http://127.0.0.1:${port}`,
		mcpBridgeRegistry,
		close: async () => {
			await new Promise<void>((resolve, reject) => {
				httpServer.close((err) => (err ? reject(err) : resolve()));
			});
			agentOrchestrationBoot.dispose();
			await agentOrchestrationBoot.joinLifecycleDrain();
			for (const dispose of coreApiBoot.disposers) {
				dispose();
			}
		},
	};
}

// ---------------------------------------------------------------------------
// Harness runtime adapter — real MCP bridge open/close
// ---------------------------------------------------------------------------

/**
 * Build the eval harness runtime adapter, wired to the real MCP bridge
 * mounted on the live server. Mirrors `buildLiveHarnessRuntimeAdapter` in
 * `assistant-reply-live-harness.integration.test.ts`.
 *
 * @lore artifacts-become-knowledge: previously this threw from `openMcpBridge`
 * ("eval sessions never supply an MCP bridge"). That was the structural cause
 * of toolCalls=0: provisioner.ts caught the throw and left mcpUrl undefined,
 * so no MCP config was ever written for the CLI. Now we open a real session
 * on the bridge that is mounted at `mcpBaseUrl/api/mcp/<token>`.
 */
function buildEvalHarnessRuntimeAdapter(
	mcpBridgeRegistry: McpToolBridge,
	mcpBaseUrl: string,
): RunOrchestrationHarnessRuntimeAdapter {
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
		openMcpBridge: async (session) => {
			const { token } = await mcpBridgeRegistry.open({
				sessionId: session.sessionId,
				registry: session.toolRegistry,
				onToolCall: session.onToolCall,
			});
			return { token, url: `${mcpBaseUrl}/api/mcp/${token}` };
		},
		closeMcpBridge: (token) => mcpBridgeRegistry.close(token),
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
 * A real MCP bridge is now supplied, so the agent's tool calls reach the
 * core-api routes through the in-process transport. `HYPERIDLE_API_KEY` is
 * set to a per-session random key before booting so the auth middleware and
 * `withActorTransport` agree, and restored after.
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
	// Set a per-session API key so the auth middleware and withActorTransport
	// agree. Save and restore the previous value so concurrent (future) eval
	// runners don't interfere with each other or with the test environment.
	const evalApiKey = `eval-${randomUUID()}`;
	const prevApiKey = process.env.HYPERIDLE_API_KEY;
	process.env.HYPERIDLE_API_KEY = evalApiKey;

	const liveServer = await startEvalLiveServer(deps.db, deps.eventBus);

	try {
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

		// Bake the task context the way the emit-time pipeline does.
		//
		// Without this the agent arrives at a "task-free session" and replies "what
		// would you like to work on?" — read from claude's own transcript, with
		// `inputTokens: 10`. Every eval scored ~0 for that reason alone, on every
		// feature and every harness: the scenario seeds a task, and the agent was
		// never told about it.
		//
		// `provisionSession` is called directly here, bypassing the durable emit-time
		// pipeline, so this seam has to supply what that pipeline bakes. It calls the
		// SAME `bakeTaskContextBundle` that pipeline uses, so an eval exercises the
		// prompt production actually ships rather than a lookalike.
		//
		// It bakes directly instead of going through `resolveTaskRunRequest`, because
		// that path needs a dispatch attempt and an attempt needs a predecessor
		// session. In production every attempt comes from a handoff, which always has
		// one; an eval IS the first session, so there is no honest value to put there.
		const evalTask = await work.get(deps.db, "task", params.taskId);
		if (!evalTask) throw new Error(`Eval task not found: ${params.taskId}`);
		const contextBundle = await bakeTaskContextBundle(
			deps.db,
			evalTask,
			[],
			agent,
			(db: HyperIdleDb, id: string) => getTeam(db, { id }),
			assembleSessionDocuments,
		);
		const { harnessDisabled } = await readServerConfig(deps.db);

		const composition = buildRunOrchestrationComposition({
			harnessRuntime: buildEvalHarnessRuntimeAdapter(liveServer.mcpBridgeRegistry, liveServer.url),
			returnStatusTool: evalReturnStatusToolAdapter,
		});
		const result = await composition.runSession(
			{
				db: deps.db,
				eventBus: deps.eventBus,
				adapterPool: pool,
				workspace,
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
					...(contextBundle ? { contextBundle } : {}),
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
	} finally {
		await liveServer.close();
		// Restore env var.
		if (prevApiKey === undefined) {
			delete process.env.HYPERIDLE_API_KEY;
		} else {
			process.env.HYPERIDLE_API_KEY = prevApiKey;
		}
	}
}
