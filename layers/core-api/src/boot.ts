import type { HyperIdleDb } from "@hyperidle/db";
import { getDocument } from "@hyperidle/document";
import type {
	ActionResult,
	DocumentRow,
	DocumentView,
	EditDocumentInput,
	SearchDocumentsInput,
} from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import { getPluginMcpContributions } from "@hyperidle/settings";
import { findThread } from "@hyperidle/thread";
import {
	connectionOwnerFor,
	createUpgradeTokenStore,
	listUsers,
	type UpgradeTokenStore,
} from "@hyperidle/user";
import type { Hono } from "hono";
import type { UpgradeWebSocket } from "hono/ws";
import type { ActionContext } from "./actions/action.js";
import { type ApiMiddlewareStack, createApiMiddlewareStack } from "./api-middleware-stack.js";
import {
	type AppOptions,
	createCoreApiApp,
	registerCoreApiPreAuthRoutes,
	takeAppActions,
	takeAppActionTools,
	takeAppDisposers,
	takeAppDocumentRunners,
} from "./app.js";
import { registerWsRoute } from "./routes/ws.js";
import { WsConnectionHub } from "./ws-connection-hub.js";
import { createDbSubscribeAuthorizer } from "./ws-subscribe-authorizer.js";

export interface CoreApiBootOptions extends AppOptions {
	/** Explicit auth key for a composition root that must not depend on ambient env. */
	readonly authApiKey?: string;
	/**
	 * The Application's Node-specific WS-upgrade adapter (from
	 * `@hono/node-server`). When present — and `registerWebSocket` was not
	 * itself overridden (tests may still inject their own stub) — this boot
	 * wires the WS route onto its own `wsHub` internally.
	 */
	readonly upgradeWebSocket?: UpgradeWebSocket;
}

export interface CoreApiBoot {
	readonly app: Hono;
	readonly registerPreAuthRoutes: (apiRouter: Hono) => void;
	/** A single instance — the rate limiter's buckets live in its closure. */
	readonly middleware: ApiMiddlewareStack;
	/** As a flat list — NOT a nested `disposeApp` thunk (see `takeAppDisposers`). */
	readonly disposers: ReadonlyArray<() => void>;
	/** Kept separate from `disposers` so the Application runs it as its own named, awaited shutdown phase. */
	readonly disposeWebSocket: () => void;
	readonly wsHub: WsConnectionHub;
	/** Present whenever WS support is being wired. */
	readonly upgradeTokenStore: UpgradeTokenStore | null;
	/** Present whenever `db` is provided. */
	readonly resolveProvisioningOwnerUserId?: (agentId: string) => Promise<string | null>;
	readonly pluginMcpContributions?: {
		getContributions(teamId: string | null): Promise<
			readonly {
				readonly key: string;
				readonly defaultValueJson: string;
				readonly installPath: string | null;
			}[]
		>;
	};
	/** Present whenever `db` is provided. */
	readonly actionTools: ReadonlyArray<
		import("@hyperidle/harness-protocol").RegisteredTool<HyperIdleDb>
	>;
	readonly editDocument: (
		caller: {
			readonly actor: string;
			readonly sessionId: string;
			readonly taskId: string | null;
			readonly threadId: string | null;
		},
		input: EditDocumentInput,
	) => Promise<ActionResult<DocumentView>>;
	readonly searchDocuments: (
		caller: { readonly actor: string },
		input: SearchDocumentsInput,
	) => Promise<ActionResult<readonly DocumentRow[]>>;
	/**
	 * Call any registered action in-process as a specific actor — used by the
	 * remote-server integration tests to drive multi-actor scenarios without an
	 * HTTP actor-override header. Present whenever `db` is provided.
	 */
	readonly callActionAs?: (
		actionName: string,
		body: Record<string, unknown>,
		actorId: string,
	) => Promise<{
		readonly ok: boolean;
		readonly data?: unknown;
		readonly problems?: ReadonlyArray<{ readonly code: string }>;
	}>;
	/**
	 * Mint a WebSocket upgrade token for a specific actor — used by the
	 * remote-server integration tests to connect WebSocket clients as a
	 * non-default user. Present whenever WS support was wired.
	 */
	readonly mintWsTokenFor?: (actorId: string) => string;
}

function resolveProvisioningOwnerUserIdFor(
	db: NonNullable<AppOptions["db"]>,
): (agentId: string) => Promise<string | null> {
	return (agentId) => connectionOwnerFor(db, agentId);
}

export async function bootCoreApi(options?: CoreApiBootOptions): Promise<CoreApiBoot> {
	const db = options?.db;

	const wsHub =
		options?.wsHub instanceof WsConnectionHub
			? options.wsHub
			: db
				? new WsConnectionHub(
						createDbSubscribeAuthorizer(db, {
							conversation: { getThreadById: (execDb, id) => findThread(execDb, { id }) },
							document: {
								getForSubscribe: async (execDb, id) => (await getDocument(execDb, id)) ?? undefined,
							},
							users: {
								listOwnedBy: (execDb, ownerId) => listUsers(execDb, { ownerUserId: ownerId }),
							},
						}),
					)
				: new WsConnectionHub();

	let wsRouteDispose: (() => void) | null = null;
	const upgradeWebSocket = options?.upgradeWebSocket;
	const registerWebSocket =
		options?.registerWebSocket ??
		(upgradeWebSocket
			? (apiRouter: Hono, tokenStore: UpgradeTokenStore) => {
					wsRouteDispose = registerWsRoute(apiRouter, tokenStore, upgradeWebSocket, wsHub);
				}
			: undefined);

	const layerOptions: CoreApiBootOptions = {
		...options,
		wsHub,
		...(registerWebSocket ? { registerWebSocket } : {}),
		...(options?.serviceBootstrap ? { serviceBootstrap: options.serviceBootstrap } : {}),
	};

	// Exists only when WS support is being wired.
	const tokenStore =
		options?.upgradeTokenStore ?? (registerWebSocket ? createUpgradeTokenStore() : null);

	const app = await createCoreApiApp({
		...layerOptions,
		...(tokenStore ? { upgradeTokenStore: tokenStore } : {}),
	});

	const disposeWebSocket = (): void => {
		wsRouteDispose?.();
	};

	const disposers: Array<() => void> = [...takeAppDisposers(app)];
	const actionTools = takeAppActionTools(app) ?? [];
	const rawActions = takeAppActions(app);

	const documentRunners = takeAppDocumentRunners(app);
	const documentRunnerEventBus = options?.eventBus ?? new EventBus();
	const editDocument: CoreApiBoot["editDocument"] = documentRunners
		? (caller, input) =>
				documentRunners.editDocument(
					{
						actor: caller.actor,
						db: db as HyperIdleDb,
						eventBus: documentRunnerEventBus,
						now: new Date().toISOString(),
						caller: {
							sessionId: caller.sessionId,
							taskId: caller.taskId,
							threadId: caller.threadId,
						},
					},
					input,
				)
		: () => {
				throw new Error(
					"CoreApiBoot.editDocument: no db was provided at boot — the composed document actions were never built.",
				);
			};
	const searchDocuments: CoreApiBoot["searchDocuments"] = documentRunners
		? (caller, input) =>
				documentRunners.searchDocuments(
					{
						actor: caller.actor,
						db: db as HyperIdleDb,
						eventBus: documentRunnerEventBus,
						now: new Date().toISOString(),
					},
					input,
				)
		: () => {
				throw new Error(
					"CoreApiBoot.searchDocuments: no db was provided at boot — the composed document actions were never built.",
				);
			};

	const callActionEventBus = options?.eventBus ?? new EventBus();
	const callActionAs: CoreApiBoot["callActionAs"] =
		rawActions && db
			? async (actionName, body, actorId) => {
					const action = rawActions.find((a) => a.declaration.name === actionName);
					if (!action) throw new Error(`callActionAs: no "${actionName}" action`);
					const ctx: ActionContext = {
						actor: actorId,
						db: db as HyperIdleDb,
						eventBus: callActionEventBus,
						now: new Date().toISOString(),
					};
					const result = await action.run(ctx, body);
					return result.ok
						? { ok: true, data: result.data }
						: { ok: false, problems: result.problems };
				}
			: undefined;

	const mintWsTokenFor: CoreApiBoot["mintWsTokenFor"] = tokenStore
		? (actorId) => tokenStore.issue(actorId).token
		: undefined;

	return {
		app,
		registerPreAuthRoutes: (apiRouter) => {
			registerCoreApiPreAuthRoutes(apiRouter, layerOptions, tokenStore);
		},
		middleware: createApiMiddlewareStack({
			...(db ? { db } : {}),
			...(options?.authApiKey !== undefined ? { apiKey: options.authApiKey } : {}),
		}),
		disposers,
		disposeWebSocket,
		actionTools,
		editDocument,
		searchDocuments,
		wsHub,
		upgradeTokenStore: tokenStore,
		...(callActionAs ? { callActionAs } : {}),
		...(mintWsTokenFor ? { mintWsTokenFor } : {}),
		...(db ? { resolveProvisioningOwnerUserId: resolveProvisioningOwnerUserIdFor(db) } : {}),
		...(db
			? {
					pluginMcpContributions: {
						getContributions: (teamId: string | null) => getPluginMcpContributions(db, teamId),
					},
				}
			: {}),
	};
}
