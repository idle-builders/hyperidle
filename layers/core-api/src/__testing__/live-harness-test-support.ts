/**
 * Shared setup for core-api's real-agent (live-harness) integration tests
 * (`subscription-wake-live-harness`, `thread-turn-live-harness`,
 * `document-tools-live-harness`) — each drives a real installed harness
 * binary through the identical MCP-bridge-server + agent-orchestration
 * composition and only differs in the one action call that dispatches its
 * session. One copy here instead of three: `layers/core-api` may not depend
 * on `@hyperidle/agent-execution` (that boot is an Application's job), so
 * this hand-assembles the same real pieces `bootAgentExecution` wires
 * production-side.
 */

import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { serve } from "@hono/node-server";
import {
	type AgentOrchestrationBoot,
	bootAgentOrchestration,
	buildRunOrchestrationComposition,
	type RunOrchestrationComposition,
	type RunOrchestrationHarnessRuntimeAdapter,
} from "@hyperidle/agent-orchestration";
import type { AgentOrchestrationTransport } from "@hyperidle/api-contract";
import { type AgentSessionRequest, agentSessionRequests, type HyperIdleDb } from "@hyperidle/db";
import type { ActionResult } from "@hyperidle/domain-model";
import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
import { EventBus } from "@hyperidle/event-bus";
import {
	createLocalAdapterPool,
	createReturnEnforcement,
	provisionHarnessEnvironment,
	writePluginStdioMcpEntries,
} from "@hyperidle/harness-registry";
import {
	createMcpToolBridge,
	type McpToolBridge,
	returnStatusTool,
} from "@hyperidle/harness-registry/mcp";
import type { SupportedHarnessName } from "@hyperidle/harness-registry/test-utils";
import { findSessionById, type RunResult } from "@hyperidle/run-orchestration";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { expect } from "vitest";
import type { Action, ActionContext } from "../actions/action.js";
import { actionsAsTools } from "../actions/actions-as-tools.js";
import { buildCoreActions } from "../actions/compose.js";
import {
	buildAgentOrchestrationPort,
	buildSeamBackedReviewVerdictRecorder,
	buildSeamBackedWorkIntentRecorder,
} from "../services/agent-orchestration-port-composition.js";

/** Test-vocabulary harness name -> the exact `agent_run_config.harness_type` `createLocalAdapterPool` registers under. */
export const HARNESS_TYPE: Record<SupportedHarnessName, string> = {
	claude: "claude-code",
	codex: "codex",
	opencode: "opencode",
	"cursor-agent": "cursor-agent",
};

/**
 * Deliberately skips the middleware stack (auth, fail-closed) — this proves
 * the seam route's effect, not the door's authentication.
 */
export function fixtureAgentOrchestrationTransport(
	app: Hono<HyperIdleEnv>,
): AgentOrchestrationTransport {
	return async (req: Request) => {
		const url = new URL(req.url);
		const strippedPath = url.pathname.replace(/^\/api/, "");
		const target = new URL(`${strippedPath}${url.search}`, url.origin);
		const hasBody = req.method !== "GET" && req.method !== "HEAD";
		const body = hasBody ? await req.text() : undefined;
		return app.fetch(new Request(target, { method: req.method, headers: req.headers, body }));
	};
}

export function runnerFor<I, O>(actions: readonly Action[], name: string) {
	const found = actions.find((a) => a.declaration.name === name);
	if (!found) throw new Error(`no "${name}" action`);
	return found.run as (ctx: ActionContext, input: I) => Promise<ActionResult<O>>;
}

/** An OS-assigned free port — `createMcpToolBridge({baseUrl})` must know the origin before the first `open()` call. */
export async function getFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const probe = net.createServer();
		probe.once("error", reject);
		probe.listen(0, "127.0.0.1", () => {
			const addr = probe.address();
			if (addr === null || typeof addr === "string") {
				probe.close(() => reject(new Error("could not determine a free port")));
				return;
			}
			const { port } = addr;
			probe.close(() => resolve(port));
		});
	});
}

/** The concrete registry `createReturnEnforcement()` builds — never exported by name from `@hyperidle/harness-registry`. */
export type EnforcementRegistry = ReturnType<typeof createReturnEnforcement>;

/**
 * The session-scoped harness-runtime port `run-orchestration`'s provisioner
 * consumes, built directly over `@hyperidle/harness-registry` — the same real
 * pieces `bootAgentExecution` wires production-side.
 */
export function buildLiveHarnessRuntimeAdapter(
	mcpBridgeRegistry: McpToolBridge,
	enforcementRegistry: EnforcementRegistry,
): RunOrchestrationHarnessRuntimeAdapter {
	return {
		enforcementRegistry,
		createReturnGate: (requiredReturnActions, taskId) =>
			enforcementRegistry.createGate(requiredReturnActions, taskId),
		evaluateReturn: (gate, endReason) => enforcementRegistry.evaluate(gate, endReason),
		provisionReturnHook: async (options) => {
			await provisionHarnessEnvironment({ ...options, token: options.bridgeToken });
		},
		writeCliMcpConfig: (options) => provisionHarnessEnvironment(options),
		writePluginStdioMcpEntries: (params) => writePluginStdioMcpEntries(params),
		openMcpBridge: (session) =>
			mcpBridgeRegistry.open({
				sessionId: session.sessionId,
				registry: session.toolRegistry,
				onToolCall: session.onToolCall,
			}),
		closeMcpBridge: (token) => mcpBridgeRegistry.close(token),
	};
}

export interface LiveHarnessRun {
	readonly eventBus: EventBus;
	readonly orchestrationBoot: AgentOrchestrationBoot;
	readonly actions: readonly Action[];
	readonly agentWorkIntentRecorder: ReturnType<typeof buildSeamBackedWorkIntentRecorder>;
	readonly enforcementRegistry: EnforcementRegistry;
	readonly mcpBridgeRegistry: McpToolBridge;
	readonly composition: RunOrchestrationComposition;
	readonly sandboxBasePath: string;
	/** Disposes the orchestration boot, closes the bridge server, and removes the sandbox dir. */
	teardown(): Promise<void>;
}

/**
 * Builds the full live-harness composition every real-agent proof needs: a
 * booted agent-orchestration Layer wired to a real action list, a listening
 * MCP bridge server, and a fresh sandbox dir.
 */
export async function setUpLiveHarnessRun(
	db: HyperIdleDb,
	sandboxPrefix: string,
): Promise<LiveHarnessRun> {
	const eventBus = new EventBus();
	const orchestrationBoot = await bootAgentOrchestration({ db, eventBus });
	const agentOrchestration = buildAgentOrchestrationPort(
		fixtureAgentOrchestrationTransport(orchestrationBoot.app),
	);
	const agentWorkIntentRecorder = buildSeamBackedWorkIntentRecorder(agentOrchestration);
	const actions = buildCoreActions({
		agentOrchestration,
		agentWorkIntentRecorder,
		reviewVerdictRecorder: buildSeamBackedReviewVerdictRecorder(agentOrchestration),
	});
	const actionTools = actionsAsTools(actions);

	const port = await getFreePort();
	const mcpBaseUrl = `http://127.0.0.1:${port}`;
	const enforcementRegistry = createReturnEnforcement();
	const mcpBridgeRegistry = createMcpToolBridge({
		enforcement: enforcementRegistry,
		baseUrl: mcpBaseUrl,
	});
	const bridgeApp = new Hono();
	const bridgeApi = new Hono();
	bridgeApi.route("/", mcpBridgeRegistry.router);
	bridgeApp.route("/api", bridgeApi);
	const httpServer = await new Promise<ReturnType<typeof serve>>((resolve) => {
		const server = serve({ fetch: bridgeApp.fetch, port }, () => resolve(server));
	});

	const sandboxBasePath = fs.mkdtempSync(path.join(os.tmpdir(), `${sandboxPrefix}-`));

	const composition = buildRunOrchestrationComposition({
		harnessRuntime: buildLiveHarnessRuntimeAdapter(mcpBridgeRegistry, enforcementRegistry),
		returnStatusTool: { forRegistry: (registry) => returnStatusTool.forRegistry(registry) },
		// `actionTools` never changes mid-run, so a constant-returning closure is enough.
		actionTools: () => actionTools,
	});

	return {
		eventBus,
		orchestrationBoot,
		actions,
		agentWorkIntentRecorder,
		enforcementRegistry,
		mcpBridgeRegistry,
		composition,
		sandboxBasePath,
		async teardown() {
			orchestrationBoot.dispose();
			await new Promise<void>((resolve, reject) => {
				httpServer.close((err: Error | undefined) => (err ? reject(err) : resolve()));
			});
			fs.rmSync(sandboxBasePath, { recursive: true, force: true });
		},
	};
}

/** `createLocalAdapterPool` bound to a run's own enforcement registry — the last piece a proof needs before calling `composition.runSession`. */
export function buildLiveHarnessAdapterPool(run: LiveHarnessRun) {
	return createLocalAdapterPool({ enforcement: run.enforcementRegistry });
}

/**
 * Asserts a completed run's persisted `outcome` is `"completed"`, diagnosing
 * with the real failure reason (`agent_session_requests.error_code`/
 * `error_message`, written by `transitionAgentRunLifecycle`) instead of a
 * bare outcome mismatch.
 */
export async function assertRunOutcomeCompleted(
	db: HyperIdleDb,
	request: AgentSessionRequest,
	result: Extract<RunResult, { mode: "completed" }>,
	harness: SupportedHarnessName,
): Promise<void> {
	if (result.outcome === "completed") return;
	const [failedRequest] = await db
		.select()
		.from(agentSessionRequests)
		.where(eq(agentSessionRequests.id, request.id));
	throw new Error(
		`session on ${harness} did not complete: outcome=${result.outcome} ` +
			`errorCode=${failedRequest?.errorCode ?? "none"} errorMessage=${failedRequest?.errorMessage ?? "none"}`,
	);
}

/** The independent proof that teardown persisted the same verdict the in-memory result reported — the bug this guards against (a harness's own return persisted as "stopped" while the in-memory result said "completed") passed on in-memory assertions alone. */
export async function assertSessionRowDone(
	db: HyperIdleDb,
	sessionId: string,
	harness: SupportedHarnessName,
): Promise<void> {
	const sessionRow = await findSessionById(db, sessionId);
	expect(
		sessionRow?.state,
		`session row for ${harness} (session ${sessionId}) was not marked done`,
	).toBe("done");
	expect(
		sessionRow?.outcome,
		`session row for ${harness} (session ${sessionId}) was not marked completed`,
	).toBe("completed");
}
