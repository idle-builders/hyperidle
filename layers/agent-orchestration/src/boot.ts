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
 *     `session_ended` / `tool_call_recorded` onto the `session:<id>` topic as
 *     a content-free nudge;
 *   - **AU26 J3, superseded: the browser holds ONE socket, core-api's.** This
 *     Layer never sees `WsConnectionHub` or any other core-api transport —
 *     the Application binds `options.wsPush` to
 *     `coreApi.wsHub.broadcast(topic, JSON.stringify(envelope))`, byte-
 *     identical to core's own action-layer binding (`core-api/src/app.ts`),
 *     and hands this boot only that one narrow function. Session content
 *     stays this Layer's own — `wsPush` carries a nudge, never the event.
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
import {
	createInheritedReach,
	decryptCredentialValue,
	type InheritedReach,
	listConnections,
	resolveHeldToken,
} from "@hyperidle/connections";
import type { HyperIdleDb, ServiceConnectionRow } from "@hyperidle/db";
import {
	type ActionResult,
	type DocumentRow,
	type DocumentView,
	type EditDocumentInput,
	HELD_AUTH_SOURCES,
	type SearchDocumentsInput,
} from "@hyperidle/domain-model";
import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
import type { EventBus } from "@hyperidle/event-bus";
import { listInjectedFilesystemsForProvisioning } from "@hyperidle/filesystems";
import type {
	HarnessAdapter,
	RegisteredTool,
	WorkerRegisterMessage,
} from "@hyperidle/harness-protocol";
import type {
	HeldConnectionsReaderPort,
	InjectedFilesystemsReaderPort,
	RunOptions,
	RunResult,
	RuntimeDeps,
	RuntimeHandle,
} from "@hyperidle/run-orchestration";
import { RegistryFilesystemMounter } from "@hyperidle/run-orchestration";
import type { Hono } from "hono";
import type { UpgradeWebSocket } from "hono/ws";
import { createAgentOrchestrationApp } from "./app.js";
import { createGitRunner } from "./git-runner.js";
import {
	buildRunOrchestrationComposition,
	buildSessionActionsDeps,
	type ProvisionSessionDeps,
	type RunOrchestrationHarnessRuntimeAdapter,
	type RunOrchestrationReturnStatusToolAdapter,
} from "./services/run-orchestration-composition.js";
import {
	registerSessionActivityGateway,
	type SessionActivityPush,
} from "./services/session-activity-gateway.js";
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
/**
 * AU31 §5.1: the four provisioning reads `bootAgentExecution`'s twin never
 * owned — `mounter`, `heldConnections`, `injectedFilesystems`,
 * `serviceConnectionResolver` — are built INSIDE this boot now (`connections`,
 * `filesystems`, `filesystem-mounting` are all this Layer's own services), so
 * the Application-supplied session slice no longer carries them.
 */
export type ApplicationProvisionSessionDeps = Omit<
	ProvisionSessionDeps,
	"mounter" | "heldConnections" | "injectedFilesystems" | "serviceConnectionResolver"
>;

export interface AgentOrchestrationRuntimeOptions {
	readonly harnessRuntime: RunOrchestrationHarnessRuntimeAdapter;
	readonly returnStatusTool: RunOrchestrationReturnStatusToolAdapter;
	readonly coreApiTransport?: CoreApiTransport;
	/** The session-provisioning deps `startRuntime`'s poller threads to every admitted session — same shape the Application built for the deleted direct `startRuntime` call, minus the four provisioning reads this boot now builds itself (§5.1). */
	readonly session: ApplicationProvisionSessionDeps;
	readonly sandboxBasePath?: string;
	/** For worker WebSocket registration (`registerWorkerWebSocket`) — the local `AdapterPool` instance and its remote-adapter factory, both from the execution adapters bundle. Absent on a `remote-server`-shaped boot with no local pool of its own. */
	readonly worker?: {
		readonly pool: NonNullable<RuntimeDeps["composition"]["worker"]>["pool"];
		readonly createWorkerAdapter: (
			ws: unknown,
			registration: WorkerRegisterMessage,
		) => HarnessAdapter;
	};
	/**
	 * AU31 §2.7: no longer built by the Application — `run-orchestration-
	 * composition.ts`'s `runtimeDeps` defaults `writeback.knowledge` to a
	 * `CoreApiPort`-backed port over `coreApiTransport` above. This field
	 * survives only as a test override (a fixture that wants to intercept the
	 * writeback write without a real seam).
	 */
	readonly writeback?: RuntimeDeps["composition"]["writeback"];
	readonly reapers?: RuntimeDeps["composition"]["reapers"];
	/**
	 * AU26 review C2 / AU31 §5.1/§5.2: the Application's `bootCoreApi`-sourced
	 * capability resolving the single human whose held connections a spawn
	 * provisions — this Layer reads zero core-api state, so it can never
	 * resolve an owner itself (`@hyperidle/users` is core-api's own service).
	 * Absent means no held connections are ever provisioned (the same
	 * observable outcome as today's empty-rows case).
	 */
	readonly resolveProvisioningOwnerUserId?: () => Promise<string | null>;
	/**
	 * §7/§5 — core-api's composed action list (`CoreApiBoot.
	 * actionTools`), projected onto the MCP tool seam, as a THUNK — the
	 * Application's own `createServer` reassigns the value it closes over
	 * once THIS boot's own `actionTools` exist too (a cycle otherwise: this
	 * Layer's sessions must be handed a list that contains this Layer's own
	 * tools). This Layer may not import `core-api` directly, so the
	 * Application threads the value in — "one composed list, built once",
	 * never a second construction site.
	 */
	readonly actionTools?: () => readonly RegisteredTool<HyperIdleDb>[];
	/**
	 * §8.4 — core's composed `edit_document`/`search_documents` actions
	 * (`CoreApiBoot.editDocument`/`searchDocuments`), threaded through exactly
	 * like `actionTools` above. The writeback processor's document port binds
	 * directly to these two values — never `open_document` (§6.7: a writeback
	 * re-read must never count as a read), and never a second HTTP hop
	 * through the deleted `CoreApiPort.knowledge` seam.
	 */
	readonly editDocument?: (
		caller: {
			readonly actor: string;
			readonly sessionId: string;
			readonly taskId: string | null;
			readonly threadId: string | null;
		},
		input: EditDocumentInput,
	) => Promise<ActionResult<DocumentView>>;
	readonly searchDocuments?: (
		caller: { readonly actor: string },
		input: SearchDocumentsInput,
	) => Promise<ActionResult<readonly DocumentRow[]>>;
}

export interface AgentOrchestrationBootOptions {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	/**
	 * The runtime's WS upgrade adapter — needed ONLY for worker WebSocket
	 * registration (`registerWorkerWebSocket`) now that the live-run stream
	 * itself rides core-api's socket (`wsPush` below). Absent — a kernel-only
	 * or in-process test app, or a `remote-server`-shaped boot with no local
	 * worker pool — and no worker route is registered.
	 */
	readonly upgradeWebSocket?: UpgradeWebSocket;
	/**
	 * AU26 J3, superseded: the one narrow function this Layer's live-run
	 * stream reaches the browser through — bound by the Application to
	 * `coreApi.wsHub.broadcast(topic, JSON.stringify(envelope))`, the exact
	 * binding core's own actions use (`core-api/src/app.ts`). Absent means no
	 * push happens — the gateway still subscribes and the buffer still fills,
	 * so a bare test fixture with no socket at all keeps working.
	 */
	readonly wsPush?: SessionActivityPush;
	/**
	 * AU36 D4: await the initial inherited-reach probe before returning, so
	 * facts are cached by serve time (exactly as when `createLocalAdapterPool`
	 * awaited discovery). Absent → the cache exists but stays empty until the
	 * first redetect (the `disabled`-topology behavior — D5's unconditional
	 * redetect refresh populates it there, as today).
	 */
	readonly probeInheritedReach?: boolean;
	/** AU31 §5.1 — absent means "no runtime": the route surface and session-stream socket exist, but no poller starts (the shape every existing bare-app test fixture already relies on). */
	readonly runtime?: AgentOrchestrationRuntimeOptions;
}

export interface AgentOrchestrationBoot {
	/** Mounted by the Application on its `/api` router, AFTER the auth middleware. */
	readonly app: Hono<HyperIdleEnv>;
	/**
	 * §5/§7 — this Layer's OWN three session actions
	 * (`search_sessions`/`watch_session`/`stop_session`), MCP-projected. Each
	 * application's `createServer` joins this with `coreApi.actionTools` into
	 * `ServerHandle.actionTools` — the HTTP door needs no join (both layer
	 * apps mount `/actions` on the one `/api` router already).
	 */
	readonly actionTools: readonly RegisteredTool<HyperIdleDb>[];
	/**
	 * AU36 D4/D5: this Layer's own inherited-reach cache. Always built; the
	 * Application wires `inheritedReach.refresh` into core-api's
	 * `onHarnessRedetect` (the redetect moment) and chooses whether boot awaits
	 * the initial probe (`probeInheritedReach`).
	 */
	readonly inheritedReach: InheritedReach;
	/** Registered by the Application on its `/api` router, BEFORE the auth middleware. */
	readonly registerPreAuthRoutes: (apiRouter: Hono) => void;
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
	/** Waits only for this boot's stopped lifecycle projection drain. */
	readonly joinLifecycleDrain: () => Promise<void>;
	/** Stops the activity buffer, unsubscribes the gateway, drops WS adapters. Does NOT dispose the run runtime — call `disposeRuntime()` first, same ordering as before this boot absorbed `startRuntime`. */
	readonly dispose: () => void;
	/**
	 * AU31 §5.1/§5.2: this Layer's own `service_connections` read, by auth
	 * source — the second, display-only consumer of the connections record
	 * (`settings`' boot-time MCP plugin seed). Stateless (takes its own `db`
	 * argument, same shape `settings`' `BackfillLegacyConfigurationDeps.
	 * serviceConnections` already expects) so the Application can hand it
	 * straight to `bootCoreApi`'s deferred configuration backfill without
	 * importing `@hyperidle/connections` itself.
	 */
	readonly serviceConnectionsReader: {
		readonly listByAuthSource: (
			db: HyperIdleDb,
			authSource: string,
		) => Promise<ServiceConnectionRow[]>;
	};
	/**
	 * AU26 review C1/C2 / AU31 §5.1: the three session-provisioning ports this
	 * boot now builds itself, exposed for the same reason the Application used
	 * to expose them on `ServerHandle` — so the production wiring is
	 * assertable functionally, against a real DB, without an indirect
	 * observable effect (`server-factory.provisioning-wiring.integration.test.ts`'s
	 * whole reason for existing: a wrong-arity resolver silently provisioned
	 * nothing in production for months, and no test caught it because every
	 * provisioning test hand-built its own port). Present only when
	 * `options.runtime` was supplied.
	 */
	readonly provisioning?: OrchestrationProvisioningReads;
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

/**
 * AU31 §5.1: builds this Layer's own provisioning reads — `mounter` (via
 * `filesystem-mounting`), `heldConnections` (via `connections`),
 * `injectedFilesystems` (via `filesystems`), `serviceConnectionResolver`
 * (via `connections`) — all in-layer now, off the same `db` handle this boot
 * already holds. Merged UNDER the Application-supplied session slice so a
 * test fixture can still override any of the four explicitly.
 *
 * `mounter` is built only when `sandboxBasePath` is present (the same
 * graceful no-op `ProvisionSessionDeps.mounter` already gives when absent);
 * `heldConnections` is built only when
 * `resolveProvisioningOwnerUserId` is supplied — absent means no held
 * connections are ever provisioned, matching today's empty-rows outcome for
 * a request emitted before onboarding.
 */
interface OrchestrationProvisioningReads {
	readonly mounter?: RegistryFilesystemMounter;
	readonly heldConnections?: HeldConnectionsReaderPort;
	readonly injectedFilesystems: InjectedFilesystemsReaderPort;
	readonly serviceConnectionResolver: {
		resolve(userId: string, connectionId: string): Promise<string | null>;
	};
}

function buildProvisioningReads(
	db: HyperIdleDb,
	sandboxBasePath: string | undefined,
	resolveProvisioningOwnerUserId: (() => Promise<string | null>) | undefined,
	decrypt: (ciphertext: string) => string | null,
): OrchestrationProvisioningReads {
	return {
		...(sandboxBasePath
			? {
					mounter: new RegistryFilesystemMounter({
						gitRunnerFactory: (repoPath: string) => createGitRunner(repoPath),
					}),
				}
			: {}),
		...(resolveProvisioningOwnerUserId
			? {
					heldConnections: {
						listHeldForProvisioning: async () => {
							const ownerUserId = await resolveProvisioningOwnerUserId();
							if (!ownerUserId) return [];
							// @lore AU44 batch2: listHeldConnectionsForProvisioning deleted; inline
							// listConnections with the same filter (userId + held authSources).
							const rows = await listConnections(db, { userId: ownerUserId });
							return rows
								.filter((r) => (HELD_AUTH_SOURCES as readonly string[]).includes(r.authSource))
								.map((row) => ({
									id: row.id,
									userId: row.userId,
									service: row.service,
									authSource: row.authSource as (typeof HELD_AUTH_SOURCES)[number],
									serverUrl: row.serverUrl ?? null,
								}));
						},
					},
				}
			: {}),
		injectedFilesystems: {
			listInjectedForProvisioning: (agentId: string) =>
				listInjectedFilesystemsForProvisioning(db, agentId),
		},
		serviceConnectionResolver: {
			resolve: (userId: string, connectionId: string) =>
				resolveHeldToken(db, userId, connectionId, decrypt),
		},
	};
}

export async function bootAgentOrchestration(
	options: AgentOrchestrationBootOptions,
): Promise<AgentOrchestrationBoot> {
	const { db, eventBus, upgradeWebSocket, wsPush, probeInheritedReach, runtime } = options;
	// @lore token-cipher: the decrypt half used to arrive as an injected
	// `cipher` option, sourced from core-api's `@hyperidle/credentials`. That
	// package is deleted with `server_credentials`; this Layer's own
	// `@hyperidle/connections` now owns the cipher outright.
	const decrypt = decryptCredentialValue;

	// AU36 D4: the reach cache is ALWAYS built; `probeInheritedReach` only
	// decides whether boot awaits the initial probe (refresh never rejects, so
	// the awaited probe cannot fail boot — worst case an empty inherited group).
	const inheritedReach = createInheritedReach();
	if (probeInheritedReach) {
		await inheritedReach.refresh();
	}

	const activityBuffer = new SessionActivityBuffer(eventBus);
	activityBuffer.start();

	// AU26 J3, superseded: the gateway pushes straight through the
	// Application-bound `wsPush` — absent means no push happens (a bare test
	// fixture), never a hub this Layer would have to own.
	const disposeGateway = registerSessionActivityGateway(eventBus, wsPush ?? (() => {}));

	// AU31 §5.1: the run runtime — poller, drain, watcher — starts HERE now,
	// not in the Application. `options.runtime` absent (every existing
	// bare-app test fixture) means no poller: the route surface works exactly
	// as before.
	let runRuntime: RuntimeHandle | undefined;
	let runSession:
		| ((deps: ProvisionSessionDeps, spec: RunOptions) => Promise<RunResult>)
		| undefined;
	let provisioningReads: OrchestrationProvisioningReads | undefined;
	if (runtime) {
		const composition = buildRunOrchestrationComposition({
			harnessRuntime: runtime.harnessRuntime,
			returnStatusTool: runtime.returnStatusTool,
			coreApiTransport: runtime.coreApiTransport,
			actionTools: runtime.actionTools,
			editDocument: runtime.editDocument,
			searchDocuments: runtime.searchDocuments,
		});
		runSession = composition.runSession;
		provisioningReads = buildProvisioningReads(
			db,
			runtime.sandboxBasePath,
			runtime.resolveProvisioningOwnerUserId,
			decrypt,
		);
		runRuntime = await composition.startRuntime(
			composition.runtimeDeps(db, eventBus, {
				runtime: { ...provisioningReads, ...runtime.session } as ProvisionSessionDeps,
				sandboxBasePath: runtime.sandboxBasePath,
				composition: buildRuntimeComposition(runtime),
			}),
		);
	}

	// §2 — the session module's own deps bag: `sessions.list`/`getById` are
	// this Layer's own accessors, `stop` is `stopSessionRun` already bound to
	// `db`/`eventBus`/`sessionRunRegistry.abort`, `activity` is this boot's own
	// `SessionActivityBuffer` reader (what `/sessions/:id/activity` used to
	// read before that route was deleted).
	const sessionActionsDeps = buildSessionActionsDeps(db, eventBus, (sessionId) =>
		activityBuffer.getActivity(sessionId),
	);
	const { app, actionTools } = createAgentOrchestrationApp({
		db,
		eventBus,
		sessionActionsDeps,
		inheritedReach,
	});

	return {
		app,
		actionTools,
		inheritedReach,
		...(runSession ? { runSession } : {}),
		...(runRuntime ? { disposeRuntime: () => runRuntime.dispose() } : {}),
		registerPreAuthRoutes: (apiRouter) => {
			if (runRuntime && upgradeWebSocket) {
				runRuntime.registerWorkerWebSocket(apiRouter, upgradeWebSocket);
			}
		},
		dispose: () => {
			disposeGateway();
			activityBuffer.stop();
		},
		joinLifecycleDrain: () => Promise.resolve(),
		serviceConnectionsReader: {
			listByAuthSource: (execDb, authSource) => listConnections(execDb, { authSource }),
		},
		...(provisioningReads ? { provisioning: provisioningReads } : {}),
	};
}
