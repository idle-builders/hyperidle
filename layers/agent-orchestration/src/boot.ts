import {
	createInheritedReach,
	decryptCredentialValue,
	type InheritedReach,
	listConnections,
	listWithholds,
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
import {
	listInjectedFilesystemsForProvisioning,
	updateFilesystemState,
} from "@hyperidle/filesystems";
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

export type ApplicationProvisionSessionDeps = Omit<
	ProvisionSessionDeps,
	"mounter" | "heldConnections" | "injectedFilesystems" | "serviceConnectionResolver"
>;

export interface AgentOrchestrationRuntimeOptions {
	readonly harnessRuntime: RunOrchestrationHarnessRuntimeAdapter;
	readonly returnStatusTool: RunOrchestrationReturnStatusToolAdapter;
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
	/** Test override only — intercepts writeback without a real seam. */
	readonly writeback?: RuntimeDeps["composition"]["writeback"];
	readonly reapers?: RuntimeDeps["composition"]["reapers"];
	/** This layer owns no user state; absent means no held connections are provisioned. */
	/** Whose held connections an agent's sessions get. */
	readonly resolveProvisioningOwnerUserId?: (agentId: string) => Promise<string | null>;
	/** Core-api action tools thunk — Application reassigns once this layer's own tools exist too; avoids construction cycle. */
	readonly actionTools?: () => readonly RegisteredTool<HyperIdleDb>[];
	/** Core's edit_document action, threaded like actionTools. Writeback binds directly — never open_document (a re-read must not count as a read). */
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
	/** WS upgrade adapter for worker registration. Absent → no worker route registered. */
	readonly upgradeWebSocket?: UpgradeWebSocket;
	/** Session activity push to browser. Absent → no push; gateway still subscribes and buffer fills. */
	readonly wsPush?: SessionActivityPush;
	/** Await initial inherited-reach probe before returning. Absent → cache empty until first redetect. */
	readonly probeInheritedReach?: boolean;
	/** Absent means "no runtime": the route surface and session-stream socket exist, but no poller starts (the shape every existing bare-app test fixture already relies on). */
	readonly runtime?: AgentOrchestrationRuntimeOptions;
}

export interface AgentOrchestrationBoot {
	readonly app: Hono<HyperIdleEnv>;
	/** This layer's session actions (search_sessions/watch_session/stop_session), MCP-projected. Application joins with core's actionTools. */
	readonly actionTools: readonly RegisteredTool<HyperIdleDb>[];
	/** Always built; Application wires `refresh` into core-api's onHarnessRedetect. */
	readonly inheritedReach: InheritedReach;
	readonly registerPreAuthRoutes: (apiRouter: Hono) => void;
	/** The one-shot session runner, bound to this boot's execution adapters and seam transport. Absent when `options.runtime` was not supplied. */
	readonly runSession?: (deps: ProvisionSessionDeps, spec: RunOptions) => Promise<RunResult>;
	/** Dispose run runtime before calling `dispose()` — the Application's shutdown must keep them as separate named phases. Absent when no runtime. */
	readonly disposeRuntime?: () => Promise<void>;
	/** Waits only for this boot's stopped lifecycle projection drain. */
	readonly joinLifecycleDrain: () => Promise<void>;
	/** Stops activity buffer, unsubscribes gateway, drops WS adapters. Does NOT dispose run runtime — call disposeRuntime() first. */
	readonly dispose: () => void;
	/** service_connections by auth source — stateless so Application can hand it to bootCoreApi without importing @hyperidle/connections. */
	readonly serviceConnectionsReader: {
		readonly listByAuthSource: (
			db: HyperIdleDb,
			authSource: string,
		) => Promise<ServiceConnectionRow[]>;
	};
	/** Provisioning ports built by this boot, exposed for integration tests to assert wiring. Present only when runtime was supplied. */
	readonly provisioning?: OrchestrationProvisioningReads;
}

/** Audited cast: recovers WorkerRegisterMessage from the narrowed seam type; design/no-unknown-cast bans double-assertion, not a named single-cast helper. */
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
 * Builds provisioning reads. mounter needs sandboxBasePath; heldConnections needs resolveProvisioningOwnerUserId — absent means no held connections.
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
	resolveProvisioningOwnerUserId: ((agentId: string) => Promise<string | null>) | undefined,
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
						listHeldForProvisioning: async (agentId: string) => {
							const ownerUserId = await resolveProvisioningOwnerUserId(agentId);
							if (!ownerUserId) return [];
							const rows = await listConnections(db, { userId: ownerUserId });
							const kept = await listWithholds(
								db,
								rows.map((r) => r.id),
							);
							return rows
								.filter((r) => (HELD_AUTH_SOURCES as readonly string[]).includes(r.authSource))
								.filter((r) => !(kept.get(r.id) ?? []).includes(agentId))
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
			markState: (id, state) => updateFilesystemState(db, id, state),
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
	const decrypt = decryptCredentialValue;

	const inheritedReach = createInheritedReach();
	if (probeInheritedReach) {
		await inheritedReach.refresh();
	}

	const activityBuffer = new SessionActivityBuffer(eventBus);
	activityBuffer.start();

	const disposeGateway = registerSessionActivityGateway(
		eventBus,
		wsPush ??
			(() => {
				// No wsPush bound (a bare test fixture) — no push happens.
			}),
	);

	let runRuntime: RuntimeHandle | undefined;
	let runSession:
		| ((deps: ProvisionSessionDeps, spec: RunOptions) => Promise<RunResult>)
		| undefined;
	let provisioningReads: OrchestrationProvisioningReads | undefined;
	if (runtime) {
		const composition = buildRunOrchestrationComposition({
			harnessRuntime: runtime.harnessRuntime,
			returnStatusTool: runtime.returnStatusTool,
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
