/**
 * AU26 B1a — `bootAgentOrchestration`: everything an Application needs to run
 * this Layer, in one call.
 *
 * The twin of `bootCoreApi`. An Application (`remote-server`, `desktop`, a test
 * harness) opens the db and the EventBus, boots both Layers, applies the
 * middleware stack and mounts both apps. B1b lifts that composition out of
 * `core-api`'s `createCoreApiApp` into the Application proper; at this
 * increment `createCoreApiApp` still receives this boot's result and does the
 * mounting, which is why `AgentOrchestrationBoot` is shaped as a mount handle
 * rather than a bare `Hono`.
 *
 * What this boot owns that core-api's used to:
 *   - the `SessionActivityBuffer` (AU31 §2.7: relocated in-Layer, this
 *     package's own `session-activity-buffer.js` — supersedes AU21 Decision
 *     E's `@hyperidle/agent-execution` placement) — the buffer's one REST
 *     reader and its one gateway reader are both on this side now, so
 *     core-api has no reason to instantiate it;
 *   - the session-activity gateway, which tees `session_started` /
 *     `session_ended` / `tool_call_recorded` onto the `session:<id>` WS topic;
 *   - **AU26 J3: the socket that topic is served on.** The `session:<id>` stream
 *     is wholly this Layer's now — its own `SessionStreamHub`, its own
 *     authorizer (an authenticated user + the run exists, read from this Layer's
 *     own `sessions` table), and its own route on the `/api` router. The
 *     Application no longer passes core-api's `WsConnectionHub` in as a
 *     broadcast sink; it passes only the runtime `upgradeWebSocket` adapter and
 *     the shared one-shot upgrade-token store, neither of which is a domain
 *     dependency. Core's socket keeps only core's own topics.
 *   - **AU31 §5.1: the run runtime itself.** `startRuntime` (poller/drain/
 *     watcher) used to be called by the Application directly
 *     (`applications/remote-server/src/create-server.ts`), importing the
 *     composition root by a deep subpath. This boot now starts it internally
 *     when `options.runtime` is supplied — the Application still owns the
 *     environment facts (`resolveModel`, `sandboxBasePath`, the writeback/
 *     reaper wiring, the worker-registration adapter pool) and the execution
 *     adapters bundle (`bootAgentExecution`'s `harnessRuntime`/
 *     `returnStatusTool`/`pool`/`createWorkerAdapter`), but never calls
 *     `startRuntime` itself. `options.runtime` is optional so a bare-app test
 *     fixture (`{db, eventBus}`, no runtime) keeps working unchanged — the
 *     route surface and the session-stream socket need no poller.
 */

import type { CoreApiTransport } from "@hyperidle/api-contract";
import type { HyperIdleDb } from "@hyperidle/db";
import type {
	RunOptions,
	RunResult,
	RuntimeDeps,
	RuntimeHandle,
} from "@hyperidle/run-orchestration";
import { startLifecycleProjectionDrain } from "@hyperidle/session-requests";
import type {
	EventBus,
	HarnessAdapter,
	HarnessCapabilityReader,
	ModelTier,
	ResolvedModel,
	WorkerRegisterMessage,
} from "@hyperidle/shared";
import type { HyperIdleEnv } from "@hyperidle/shared/http";
import type { Hono } from "hono";
import type { UpgradeWebSocket } from "hono/ws";
import { createAgentOrchestrationApp } from "./app.js";
import {
	registerSessionStreamRoute,
	type SessionStreamTokenStore,
} from "./routes/session-stream-ws.js";
import { queueDeps } from "./services/durable-agent-queue.js";
import {
	buildRunOrchestrationComposition,
	type ProvisionSessionDeps,
	type RunOrchestrationHarnessRuntimeAdapter,
	type RunOrchestrationReturnStatusToolAdapter,
} from "./services/run-orchestration-composition.js";
import { registerSessionActivityGateway } from "./services/session-activity-gateway.js";
import {
	createRunStreamSubscribeAuthorizer,
	SessionStreamHub,
} from "./services/session-stream-hub.js";
import { SessionActivityBuffer } from "./session-activity-buffer.js";

/**
 * AU31 §5.1/§2.4 — the run runtime's own environment, supplied by the
 * Application. `harnessRuntime`/`returnStatusTool`/`pool`/`createWorkerAdapter`
 * come straight from `bootAgentExecution`'s `adapters` bundle
 * (`layers/agent-execution/src/boot.ts`) — opaque, structurally-typed values
 * this Layer never imports by name (architecture.md §4's spelling law).
 * `coreApiTransport` is the seam's outbound client transport (§3.2): a
 * root-local binding closing over the composed app, filled once it exists —
 * absent (a test fixture with no seam-backed tool under test) falls back to
 * the composition's own `unconfiguredCoreApiTransport()`.
 */
export interface AgentOrchestrationRuntimeOptions {
	readonly harnessRuntime: RunOrchestrationHarnessRuntimeAdapter;
	readonly returnStatusTool: RunOrchestrationReturnStatusToolAdapter;
	readonly coreApiTransport?: CoreApiTransport;
	/** The session-provisioning deps `startRuntime`'s poller threads to every admitted session — same shape the Application built for the deleted direct `startRuntime` call. */
	readonly session: ProvisionSessionDeps;
	readonly sandboxBasePath?: string;
	readonly resolveModel?: (
		tier: ModelTier,
		modelOverride?: { readonly modelId: string | null; readonly modelProvider: string | null },
	) => Promise<ResolvedModel | undefined>;
	/** For worker WebSocket registration (`registerWorkerWebSocket`) — the local `AdapterPool` instance and its remote-adapter factory, both from the execution adapters bundle. Absent on a `remote-server`-shaped boot with no local pool of its own. */
	readonly worker?: {
		readonly pool: NonNullable<RuntimeDeps["composition"]["worker"]>["pool"];
		readonly createWorkerAdapter: (
			ws: unknown,
			registration: WorkerRegisterMessage,
		) => HarnessAdapter;
	};
	readonly writeback?: RuntimeDeps["composition"]["writeback"];
	readonly reapers?: RuntimeDeps["composition"]["reapers"];
}

export interface AgentOrchestrationBootOptions {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	/**
	 * AU26 J3: what an Application must supply for the live-run socket to be
	 * reachable over HTTP — the runtime's WS upgrade adapter and the one-shot
	 * upgrade-token store (the SAME store core's socket consumes, so
	 * `POST /api/auth/ws-token` mints for both). Absent — a kernel-only or
	 * in-process test app — and no route is registered; the hub and the gateway
	 * still exist, so a test can drive `hub.subscribe`/`broadcast` directly.
	 */
	readonly sessionStream?: {
		readonly upgradeWebSocket: UpgradeWebSocket;
		readonly upgradeTokens: SessionStreamTokenStore;
	};
	/**
	 * AU26 E4: cached harness descriptors for `/api/connections`' inherited
	 * projection. The Application already holds the pool; this Layer only reads
	 * the cache off it.
	 */
	readonly adapterPool?: HarnessCapabilityReader;
	/** AU31 §5.1 — absent means "no runtime": the route surface and session-stream socket exist, but no poller starts (the shape every existing bare-app test fixture already relies on). */
	readonly runtime?: AgentOrchestrationRuntimeOptions;
}

export interface AgentOrchestrationBoot {
	/** Mounted by the Application on its `/api` router, AFTER the auth middleware. */
	readonly app: Hono<HyperIdleEnv>;
	/** Registered by the Application on its `/api` router, BEFORE the auth middleware. */
	readonly registerPreAuthRoutes: (apiRouter: Hono) => void;
	/**
	 * AU26 J3: this Layer's live-run topic space. Exposed so an in-process test
	 * can subscribe/broadcast without a socket; production reaches it only
	 * through the registered route and the activity gateway.
	 */
	readonly sessionStreamHub: SessionStreamHub;
	/** AU31 §5.1 — the one-shot session runner, bound to this boot's execution adapters and seam transport. Absent when `options.runtime` was not supplied. */
	readonly runSession?: (deps: ProvisionSessionDeps, spec: RunOptions) => Promise<RunResult>;
	/**
	 * AU31 §5.1 — the run runtime's own disposer (poller/drain/watcher),
	 * exposed SEPARATELY from `dispose` rather than folded into it: the
	 * Application's own shutdown sequence (`create-server.ts`) disposes the
	 * run runtime as its own named, awaited phase BEFORE the rest of the
	 * composed app's teardown — the exact ordering it had before this boot
	 * absorbed `startRuntime` (§5.1). Absent when `options.runtime` was not
	 * supplied.
	 */
	readonly disposeRuntime?: () => Promise<void>;
	/** Stops the activity buffer, unsubscribes the gateway, drops WS adapters. Does NOT dispose the run runtime — call `disposeRuntime()` first, same ordering as before this boot absorbed `startRuntime`. */
	readonly dispose: () => void;
}

/** The ONE audited cast recovering `WorkerRegisterMessage` from `createWorkerIngress`'s own Mechanism-C-narrowed registration type — same idiom as the deleted `run-orchestration-composition.ts`'s own `widenWorkerRegistration` (`design/no-unknown-cast` bans the `X as unknown as T` double-assertion, not an audited single cast inside a named helper). */
function widenWorkerRegistration(registration: unknown): WorkerRegisterMessage {
	return registration as WorkerRegisterMessage;
}

/** Builds `runtimeDeps`'s `composition` override from the Application-supplied worker/writeback/reaper wiring — a plain helper so the `worker` branch's narrowing survives into the nested closure (a ternary spread inline loses it). */
function buildRuntimeComposition(
	runtime: AgentOrchestrationRuntimeOptions,
): RuntimeDeps["composition"] {
	const { worker, writeback, reapers } = runtime;
	return {
		...(worker
			? {
					worker: {
						pool: worker.pool,
						adapterFactory: {
							create: (ws: unknown, registration: unknown) =>
								worker.createWorkerAdapter(ws, widenWorkerRegistration(registration)),
						},
					},
				}
			: {}),
		...(writeback ? { writeback } : {}),
		...(reapers ? { reapers } : {}),
	} as RuntimeDeps["composition"];
}

export async function bootAgentOrchestration(
	options: AgentOrchestrationBootOptions,
): Promise<AgentOrchestrationBoot> {
	const { db, eventBus, sessionStream, adapterPool, runtime } = options;

	const activityBuffer = new SessionActivityBuffer(eventBus);
	activityBuffer.start();

	const sessionStreamHub = new SessionStreamHub(createRunStreamSubscribeAuthorizer(db));
	const disposeGateway = registerSessionActivityGateway(eventBus, sessionStreamHub);
	let disposeSocket: () => void = () => {};

	// AU31 B2 (§5, §12 lifecycle-drain cluster): relocated from `core-api`'s
	// `service-bootstrap.ts` — `startLifecycleProjectionDrain` claims/processes
	// rows straight off `agentLifecycleInbox`, this Layer's own table
	// (`session-requests`'s), so it belongs to this Layer's own boot, not
	// core's. `queueDeps` moved alongside it (same relocation).
	const disposeDrain = startLifecycleProjectionDrain(queueDeps(db));

	// AU31 §5.1: the run runtime — poller, drain, watcher — starts HERE now,
	// not in the Application. `options.runtime` absent (every existing
	// bare-app test fixture) means no poller: the route surface and the
	// session-stream socket work exactly as before.
	let runRuntime: RuntimeHandle | undefined;
	let runSession:
		| ((deps: ProvisionSessionDeps, spec: RunOptions) => Promise<RunResult>)
		| undefined;
	if (runtime) {
		const composition = buildRunOrchestrationComposition({
			harnessRuntime: runtime.harnessRuntime,
			returnStatusTool: runtime.returnStatusTool,
			coreApiTransport: runtime.coreApiTransport,
		});
		runSession = composition.runSession;
		runRuntime = await composition.startRuntime(
			composition.runtimeDeps(db, eventBus, {
				runtime: runtime.session,
				sandboxBasePath: runtime.sandboxBasePath,
				resolveModel: runtime.resolveModel,
				composition: buildRuntimeComposition(runtime),
			}),
		);
	}

	const app = createAgentOrchestrationApp({
		db,
		eventBus,
		getRecentActivity: (sessionId) => activityBuffer.getActivity(sessionId),
		...(adapterPool ? { adapterPool } : {}),
	});

	return {
		app,
		sessionStreamHub,
		...(runSession ? { runSession } : {}),
		...(runRuntime ? { disposeRuntime: () => runRuntime.dispose() } : {}),
		registerPreAuthRoutes: (apiRouter) => {
			if (runRuntime && sessionStream) {
				runRuntime.registerWorkerWebSocket(apiRouter, sessionStream.upgradeWebSocket);
			}
			if (sessionStream) {
				disposeSocket = registerSessionStreamRoute(
					apiRouter,
					sessionStream.upgradeTokens,
					sessionStream.upgradeWebSocket,
					sessionStreamHub,
				);
			}
		},
		dispose: () => {
			disposeSocket();
			disposeGateway();
			disposeDrain();
			activityBuffer.stop();
		},
	};
}
