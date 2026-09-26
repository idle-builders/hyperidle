/**
 * Shared setup for core-api's real-agent (live-harness) integration tests
 * (`subscription-wake-live-harness`, `thread-turn-live-harness`,
 * `document-tools-live-harness`, `real-harness-return-enforcement-realbinary`)
 * — each drives a real installed harness binary and only differs in the one
 * call that dispatches its session or fires its hook. One copy here instead
 * of several: the composition rides `@hyperidle/agent-execution`'s own real
 * boot (`bootAgentExecution`), the same boot `agent-orchestration`'s own
 * `boot-provisioning-wiring.integration.test.ts` already takes as a
 * devDependency — never a hand-copied field-for-field stand-in.
 *
 * The sandbox-directory and clean-env helpers ride
 * `@hyperidle/harness-registry/test-fixtures` — the published subpath for
 * this package's own real-harness test helpers, the same shape as
 * `@hyperidle/db/test-fixtures`.
 */

import * as net from "node:net";
import { serve } from "@hono/node-server";
import { bootAgentExecution } from "@hyperidle/agent-execution";
import {
	type AgentOrchestrationBoot,
	bootAgentOrchestration,
	buildRunOrchestrationComposition,
	type RunOrchestrationComposition,
} from "@hyperidle/agent-orchestration";
import type { AgentOrchestrationTransport } from "@hyperidle/api-contract";
import { type AgentSessionRequest, agentSessionRequests, type HyperIdleDb } from "@hyperidle/db";
import type { ActionResult } from "@hyperidle/domain-model";
import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
import { EventBus } from "@hyperidle/event-bus";
import type { AdapterPool, EnforcementRegistry, SandboxAdapter } from "@hyperidle/harness-registry";
import type { SupportedHarnessName } from "@hyperidle/harness-registry/test-utils";
import { findSessionById, type RunResult } from "@hyperidle/run-orchestration";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { expect } from "vitest";
import {
	buildCleanEnv,
	createHarnessSandbox,
	type HarnessSandbox,
} from "../../../agent-execution/harness-registry/src/__tests__/harness-sandbox.js";
import type { Action, ActionContext } from "../actions/action.js";
import { actionsAsTools } from "../actions/actions-as-tools.js";
import { buildCoreActions } from "../actions/compose.js";
import {
	buildAgentOrchestrationPort,
	buildSeamBackedReviewVerdictRecorder,
	buildSeamBackedWorkIntentRecorder,
} from "../services/agent-orchestration-port-composition.js";

export { buildCleanEnv, createHarnessSandbox, type HarnessSandbox };

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

/** An OS-assigned free port — `bootAgentExecution({ mcpBaseUrl })` must know the origin before the bridge exists. */
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

export interface LiveHarnessRun {
	readonly eventBus: EventBus;
	readonly orchestrationBoot: AgentOrchestrationBoot;
	readonly actions: readonly Action[];
	readonly agentWorkIntentRecorder: ReturnType<typeof buildSeamBackedWorkIntentRecorder>;
	readonly composition: RunOrchestrationComposition;
	readonly adapterPool: AdapterPool;
	readonly workspace: SandboxAdapter;
	readonly sandboxBasePath: string;
	/** Disposes the execution boot, the orchestration boot, closes the bridge server, and removes the sandbox dir. */
	teardown(): Promise<void>;
}

/**
 * Builds the full live-harness composition every real-agent proof needs: a
 * booted agent-orchestration Layer wired to a real action list, `agent-
 * execution`'s own real boot (adapter pool, sandbox adapter, MCP bridge
 * server, return enforcement — the identical pieces an Application boots),
 * and a fresh sandbox dir.
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
	const execution = await bootAgentExecution({ topology: "local", mcpBaseUrl });

	const bridgeApp = new Hono();
	const bridgeApi = new Hono();
	execution.mountMcpRouter(bridgeApi);
	bridgeApp.route("/api", bridgeApi);
	const httpServer = await new Promise<ReturnType<typeof serve>>((resolve) => {
		const server = serve({ fetch: bridgeApp.fetch, port }, () => resolve(server));
	});

	const sandbox = createHarnessSandbox(sandboxPrefix);

	const composition = buildRunOrchestrationComposition({
		harnessRuntime: execution.adapters.harnessRuntime,
		returnStatusTool: execution.adapters.returnStatusTool,
		// `actionTools` never changes mid-run, so a constant-returning closure is enough.
		actionTools: () => actionTools,
	});

	return {
		eventBus,
		orchestrationBoot,
		actions,
		agentWorkIntentRecorder,
		composition,
		adapterPool: execution.adapters.pool,
		workspace: execution.adapters.sandbox,
		sandboxBasePath: sandbox.path,
		async teardown() {
			execution.dispose();
			orchestrationBoot.dispose();
			await new Promise<void>((resolve, reject) => {
				httpServer.close((err: Error | undefined) => (err ? reject(err) : resolve()));
			});
			await sandbox.cleanup();
		},
	};
}

/**
 * The real `agent-execution` boot, exposing just the MCP bridge + return-
 * enforcement registry a real-binary hook-fire proof needs — no agent-
 * orchestration composition, no action list, no db. Every real-binary test
 * that proves a hook/route/registry loop end-to-end (never a session run)
 * uses this instead of hand-assembling its own bridge + registry stand-in.
 */
export interface LiveHarnessMcpServer {
	/** The server's own origin — `${serverUrl}/api/mcp/<token>` is the dialable MCP URL. */
	readonly serverUrl: string;
	readonly token: string;
	readonly enforcementReg: EnforcementRegistry;
	readonly sessionId: string;
	close(): Promise<void>;
}

/**
 * Boots the real `bootAgentExecution` MCP bridge + enforcement registry on a
 * random port, opens one bridge session for `sessionId`, and registers a
 * default enforcement entry (`gate.returned=false`, `forceCount=0`) — the
 * same starting state every real-binary proof needs before the binary's own
 * hook can fire against it.
 */
export async function setUpLiveHarnessMcpServer(sessionId: string): Promise<LiveHarnessMcpServer> {
	const port = await getFreePort();
	const serverUrl = `http://127.0.0.1:${port}`;
	const execution = await bootAgentExecution({ topology: "local", mcpBaseUrl: serverUrl });

	const bridgeApp = new Hono();
	const bridgeApi = new Hono();
	execution.mountMcpRouter(bridgeApi);
	bridgeApp.route("/api", bridgeApi);
	const httpServer = await new Promise<ReturnType<typeof serve>>((resolve) => {
		const server = serve({ fetch: bridgeApp.fetch, port }, () => resolve(server));
	});

	const { token } = await execution.adapters.harnessRuntime.openMcpBridge({
		sessionId,
		// No real tool ever gets called through this bridge — every real-binary
		// proof here exercises the hook/return-status transport, not a tool call.
		toolRegistry: {
			definitions: [],
			invoke: async () => ({ success: false, code: "NOT_FOUND", error: "none" }),
			toClaudeToolSpecs: () => [],
		},
	});

	const enforcementReg = execution.adapters.harnessRuntime.enforcementRegistry;
	enforcementReg.register(sessionId, { gate: { returned: false }, forceCount: 0, exempt: false });

	return {
		serverUrl,
		token,
		enforcementReg,
		sessionId,
		async close() {
			enforcementReg.unregister(sessionId);
			await execution.adapters.harnessRuntime.closeMcpBridge(token);
			execution.dispose();
			await new Promise<void>((resolve, reject) => {
				httpServer.close((err: Error | undefined) => (err ? reject(err) : resolve()));
			});
		},
	};
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
