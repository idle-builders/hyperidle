/**
 * Shared setup for core-api's real-agent (live-harness) integration tests
 * (`subscription-wake-live-harness`, `thread-turn-live-harness`,
 * `document-tools-live-harness`, `real-harness-return-enforcement-realbinary`)
 * — each drives a real installed harness binary and only differs in the
 * trigger call and the effect it asserts. One copy here instead of several.
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
	type AgentRunner,
	actionToolsThroughDoor,
	bootAgentOrchestration,
	createAgentRunner,
	createCoreDoor,
} from "@hyperidle/agent-orchestration";
import type { AgentOrchestrationTransport } from "@hyperidle/api-contract";
import type { HyperIdleDb } from "@hyperidle/db";
import type { ActionResult } from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import type { EnforcementRegistry } from "@hyperidle/harness-registry";
import {
	buildCleanEnv,
	createHarnessSandbox,
	type HarnessSandbox,
} from "@hyperidle/harness-registry/test-fixtures";
import type { SupportedHarnessName } from "@hyperidle/harness-registry/test-utils";
import { findSessionById } from "@hyperidle/run-orchestration";
import { agentSessionRequests, type RunnerDb } from "@hyperidle/runner-db";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { expect, vi } from "vitest";
import type { Action, ActionContext } from "../actions/action.js";
import { buildCoreActions } from "../actions/compose.js";
import { disposeApp } from "../app.js";
import { bootCoreApi } from "../boot.js";
import { composeApiApplication } from "../compose-api-application.js";
import { registerAgentLayerServices, registerCoreDomainServices } from "../service-bootstrap.js";
import {
	buildAgentOrchestrationPort,
	createInProcessAgentOrchestrationTransport,
} from "../services/agent-orchestration-port-composition.js";

export { buildCleanEnv, createHarnessSandbox, type HarnessSandbox };

/** Test-vocabulary harness name -> the exact `agent_run_config.harness_type` `createLocalAdapterPool` registers under. */
export const HARNESS_TYPE: Record<SupportedHarnessName, string> = {
	claude: "claude-code",
	codex: "codex",
	opencode: "opencode",
	"cursor-agent": "cursor-agent",
};

export function runnerFor<I, O>(actions: readonly Action[], name: string) {
	const found = actions.find((a) => a.declaration.name === name);
	if (!found) throw new Error(`no "${name}" action`);
	return found.run as (ctx: ActionContext, input: I) => Promise<ActionResult<O>>;
}

/** An OS-assigned free port — `bootAgentExecution({ mcpBaseUrl })` must know the origin before the bridge exists. */
export function getFreePort(): Promise<number> {
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
	/** The runner for the person whose computer this is — start it explicitly in the test after seeding. */
	readonly runner: AgentRunner;
	/** Stops the runner, drains in-flight sessions, tears down all runtime components. */
	teardown(): Promise<void>;
}

/** The server's own seam calls carry the deployment key read from the environment. */
const LIVE_HARNESS_TEAM_KEY = "live-harness-test-team-key";

/**
 * Boots the full live-harness composition: core, agent orchestration with the
 * real `agent-execution` runtime (adapter pool, MCP bridge, return
 * enforcement), the person's runner, and the HTTP door. The runner is exposed
 * for the test to start explicitly after seeding — call `runner.start()` only
 * after `giveUserKey(db, personId, personKey)` for the person this runner
 * belongs to.
 */
export async function setUpLiveHarnessRun(
	db: HyperIdleDb,
	runnerDb: RunnerDb,
	sandboxPrefix: string,
	personKey: string,
): Promise<LiveHarnessRun> {
	vi.stubEnv("HYPERIDLE_API_KEY", LIVE_HARNESS_TEAM_KEY);
	const sandbox = createHarnessSandbox(sandboxPrefix);
	vi.stubEnv("HYPERIDLE_SPACES_DIR", sandbox.path);
	const eventBus = new EventBus();

	// Deferred transport so the door and agent-orchestration port resolve to the composed app after it is built.
	let transport: AgentOrchestrationTransport | undefined;
	const agentOrchestration = buildAgentOrchestrationPort((req) => {
		if (!transport) throw new Error("called before the app was built");
		return transport(req);
	});

	const coreApi = await bootCoreApi({
		db,
		eventBus,
		agentOrchestration,
		serviceBootstrap: (ctx) => [
			...registerCoreDomainServices({ ...ctx, canProvision: true }),
			...registerAgentLayerServices({ ...ctx, canProvision: true }),
		],
	});

	let appFetch: ((req: Request) => Promise<Response>) | undefined;
	const door = createCoreDoor((req) => {
		if (!appFetch) throw new Error("called before the app was built");
		return appFetch(req);
	}, "http://hyperidle.local/api");

	const runner = createAgentRunner({
		db: runnerDb,
		eventBus,
		door,
		personKey: () => personKey,
		subscribeInbox: (agentId, onNudge) => {
			const client = { send: () => onNudge() };
			coreApi.wsHub.addClient(client, agentId);
			void coreApi.wsHub.subscribe(client, `user:${agentId}`);
			return () => coreApi.wsHub.removeClient(client);
		},
		sweepMs: 60_000,
	});

	const coreTools = actionToolsThroughDoor(coreApi.actionCatalog, door, runner.keyFor);

	// Real MCP bridge server for harness connections.
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

	// Boot orchestration with the real runtime — sessions run automatically once the runner queues them.
	const orchestrationBoot = await bootAgentOrchestration({
		db,
		runnerDb,
		eventBus,
		runtime: {
			harnessRuntime: execution.adapters.harnessRuntime,
			returnStatusTool: execution.adapters.returnStatusTool,
			actionTools: () => [...coreTools, ...orchestrationBoot.actionTools],
			editDocument: coreApi.editDocument,
			searchDocuments: coreApi.searchDocuments,
			session: {
				db: runnerDb,
				eventBus,
				adapterPool: execution.adapters.pool,
				pluginMcpContributions: coreApi.pluginMcpContributions,
			},
		},
	});

	// In-process actions for the human (founder) door — same agentOrchestration port as the app.
	// The server's live nudge, so a row reaches the runner at once — as in production.
	const actions = buildCoreActions({
		agentOrchestration,
		wsPush: (topic, envelope) => coreApi.wsHub.broadcast(topic, JSON.stringify(envelope)),
	});

	const app = composeApiApplication({
		middleware: coreApi.middleware,
		preAuthRegistrars: [coreApi.registerPreAuthRoutes],
		apps: [coreApi.app, orchestrationBoot.app],
	});
	transport = createInProcessAgentOrchestrationTransport(app);
	appFetch = (req) => Promise.resolve(app.fetch(req));

	return {
		eventBus,
		orchestrationBoot,
		actions,
		runner,
		async teardown() {
			await runner.stop();
			// Let any sessions still in-flight finish before tearing down the runtime.
			const deadline = Date.now() + 10_000;
			while (Date.now() < deadline) {
				const open = await runnerDb
					.select({ id: agentSessionRequests.id })
					.from(agentSessionRequests)
					.where(inArray(agentSessionRequests.status, ["pending", "claimed", "running"]));
				if (open.length === 0) break;
				await new Promise((r) => setTimeout(r, 25));
			}
			await orchestrationBoot.disposeRuntime?.();
			orchestrationBoot.dispose();
			await orchestrationBoot.joinLifecycleDrain();
			execution.dispose();
			disposeApp(app);
			for (const dispose of coreApi.disposers) dispose();
			await new Promise<void>((resolve, reject) => {
				httpServer.close((err: Error | undefined) => (err ? reject(err) : resolve()));
			});
			await sandbox.cleanup();
			vi.unstubAllEnvs();
		},
	};
}

/**
 * Polls until the most recent session request for `agentId` reaches a terminal
 * state, asserts it completed successfully, and returns its `sessionId` for
 * further row checks. Throws with the error code/message when the session
 * failed instead of completing.
 */
export async function waitForSessionCompleted(
	runnerDb: RunnerDb,
	agentId: string,
	harness: SupportedHarnessName,
	timeoutMs = 30_000,
): Promise<string> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const [req] = await runnerDb
			.select()
			.from(agentSessionRequests)
			.where(
				and(
					eq(agentSessionRequests.agentId, agentId),
					inArray(agentSessionRequests.status, ["completed", "failed", "cancelled"]),
				),
			);
		if (req) {
			if (req.status !== "completed") {
				throw new Error(
					`session on ${harness} did not complete: status=${req.status} ` +
						`errorCode=${req.errorCode ?? "none"} errorMessage=${req.errorMessage ?? "none"}`,
				);
			}
			if (!req.sessionId) {
				throw new Error(`session request for ${harness} has no sessionId`);
			}
			return req.sessionId;
		}
		if (Date.now() > deadline) {
			throw new Error(`no terminal session for ${harness} agent ${agentId} within ${timeoutMs}ms`);
		}
		await new Promise((r) => setTimeout(r, 100));
	}
}

/**
 * Polls until `probe` returns a defined value, then returns it. Useful for
 * waiting for the agent's real effect (a reply, an edited document, etc.)
 * before asserting on it.
 */
export async function waitForEffect<T>(
	what: string,
	probe: () => Promise<T | undefined>,
	timeoutMs = 120_000,
): Promise<T> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const found = await probe();
		if (found !== undefined) return found;
		if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
		await new Promise((r) => setTimeout(r, 200));
	}
}

/** Asserts the session row for `sessionId` is `done` and `completed`. */
export async function assertSessionRowDone(
	runnerDb: RunnerDb,
	sessionId: string,
	harness: SupportedHarnessName,
): Promise<void> {
	const sessionRow = await findSessionById(runnerDb, sessionId);
	expect(
		sessionRow?.state,
		`session row for ${harness} (session ${sessionId}) was not marked done`,
	).toBe("done");
	expect(
		sessionRow?.outcome,
		`session row for ${harness} (session ${sessionId}) was not marked completed`,
	).toBe("completed");
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
