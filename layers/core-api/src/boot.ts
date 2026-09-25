/**
 * AU26 B1a/B1b — `bootCoreApi`: everything an Application needs to run the
 * `core-api` Layer, in one call. The twin of `bootAgentOrchestration`.
 *
 * An Application opens the db and the EventBus, boots both Layers, applies the
 * middleware stack to ONE `/api` router, mounts both Layer apps onto it behind
 * that stack, and disposes both.
 *
 * @lore AU26 B1b: this boot used to own the `/api` router, the middleware stack
 * and the mounting of the OTHER Layer's app — a core-api file deciding that
 * `agent-orchestration`'s routes sit behind core-api's auth. That decision is an
 * Application's alone (`runtime-simplification.md:159-164`), so it moved out to
 * `applications/remote-server/src/create-server.ts` (production) and
 * `test-utils.ts`'s `createTestApp` (the test harness Application). What this
 * boot returns is core-api's own route table, its own pre-auth registrar, and
 * the middleware stack — handed out, not installed.
 *
 * @lore AU31 §5.2: this boot now absorbs core's remaining SELF-composition —
 * pieces that were built by the Application even though every dependency they
 * touch (`settings`, `users`, `conversation`) is core-api's own in-layer
 * service. Application-level construction of these was legal only by
 * accident (nothing stopped an Application from doing a Layer's own wiring);
 * under the closed boundary an Application may reach only a Layer's face, so
 * the wiring moved to the face it always belonged to:
 *   - the WS connection hub + its subscribe authorizer (`conversation`'s
 *     `findThread` wire is core-internal) and the WS route itself, when the
 *     Application supplies its Node-specific `upgradeWebSocket` adapter;
 *   - the work-state push gateway (task/bet forwarder onto the hub);
 *   - the upgrade-token store construction;
 *   - `resolveProvisioningOwnerUserId` — AU26 review C2's "the human whose
 *     held connections a spawn provisions" now reads `users` (core-api's own
 *     table) from INSIDE this boot instead of the Application importing
 *     `@hyperidle/user` directly; the boot hands the resolved capability out
 *     as a value, and the Application threads it into `bootAgentOrchestration`'s
 *     options exactly the way it already threads the execution adapters
 *     bundle — no Layer imports another.
 *
 * The boot RESULT exposes what the Application must pass onward
 * (`upgradeTokenStore`, `resolveProvisioningOwnerUserId`, `wsHub`,
 * `middleware`, `app`, `registerPreAuthRoutes`) — the Application mediates
 * every cross-face handoff, never a direct service import.
 */

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
	createUpgradeTokenStore,
	findUser,
	listUsers,
	type UpgradeTokenStore,
} from "@hyperidle/user";
import type { Hono } from "hono";
import type { UpgradeWebSocket } from "hono/ws";
import { type ApiMiddlewareStack, createApiMiddlewareStack } from "./api-middleware-stack.js";
import {
	type AppOptions,
	createCoreApiApp,
	registerCoreApiPreAuthRoutes,
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
	/** Mounted by the Application at `/` on its `/api` router, AFTER the stack. */
	readonly app: Hono;
	/**
	 * Registered by the Application on its `/api` router, BEFORE the auth
	 * middleware: `GET /health`, the first-run `POST /users` setup route, the
	 * shared-mode invite claim, and (when `upgradeWebSocket` was supplied) the
	 * user WebSocket upgrade.
	 */
	readonly registerPreAuthRoutes: (apiRouter: Hono) => void;
	/**
	 * The `/api` middleware stack — built here (`createAuthMiddleware` reads
	 * `@hyperidle/user`, a core-api Service), applied by the Application.
	 * A single instance: the rate limiter's buckets live in its closure.
	 */
	readonly middleware: ApiMiddlewareStack;
	/**
	 * This Layer's teardown, as a flat list the Application registers on its
	 * composed root app — NOT a nested `disposeApp` thunk (see `takeAppDisposers`).
	 */
	readonly disposers: ReadonlyArray<() => void>;
	/**
	 * Disposes the WS route (when
	 * `upgradeWebSocket` was supplied) and the work-state push gateway — kept
	 * SEPARATE from `disposers` so the Application can run it as its own
	 * named, awaited shutdown phase, same ordering `create-server.ts` used
	 * before this boot absorbed their construction.
	 */
	readonly disposeWebSocket: () => void;
	/**
	 * This Layer's own WS connection hub — the topic space
	 * `conversations`/`work`/`thread:<id>` routes push onto directly. Exposed
	 * so the Application can pass it to `registerWebSocket` overrides in
	 * tests; production reaches it only through the WS route this boot wires
	 * itself when `upgradeWebSocket` is supplied.
	 */
	readonly wsHub: WsConnectionHub;
	/** The upgrade-token store `/api/auth/ws-token` mints from and the WS route consumes. Present whenever WS support is being wired. */
	readonly upgradeTokenStore: UpgradeTokenStore | null;
	/**
	 * The single human whose held connections a
	 * spawn provisions (oldest-row tiebreak). Reads `users` — core-api's own
	 * table — from inside this boot; the Application hands the resulting
	 * capability into `bootAgentOrchestration`'s options as a value. Present
	 * whenever `db` is provided.
	 */
	readonly resolveProvisioningOwnerUserId?: () => Promise<string | null>;
	/**
	 * BA9b: plugin MCP contributions port — exposes the per-team merged
	 * plugin MCP configuration to the provisioner without a direct settings →
	 * run-orchestration import. The Application threads this into
	 * `runtimeSessionDeps.pluginMcpContributions`. Present whenever `db` is
	 * provided.
	 *
	 * @lore BA9b: typed inline (not importing from @hyperidle/run-orchestration)
	 * so core-api's boot stays boundary-clean. Structural compatibility with
	 * PluginMcpContributionsPort is checked at the assignment site in create-server.ts.
	 */
	readonly pluginMcpContributions?: {
		getContributions(teamId: string | null): Promise<
			readonly {
				readonly key: string;
				readonly defaultValueJson: string;
				readonly installPath: string | null;
			}[]
		>;
	};
	/**
	 * §7 — the composed action list, projected onto the MCP tool seam.
	 * `bootAgentOrchestration` threads this into its own tool provider
	 * (`buildToolRegistry`/`toolsForRole`) so an action is registered on the
	 * MCP server and reachable from the CLI in the same composition pass —
	 * "one composed list, built once", never a second construction site.
	 * Present whenever `db` is provided.
	 */
	readonly actionTools: ReadonlyArray<
		import("@hyperidle/harness-protocol").RegisteredTool<HyperIdleDb>
	>;
	/**
	 * §8.4 — the composed `edit_document`/`search_documents` actions, exposed
	 * as two locked-shape functions the writeback processor binds directly
	 * (never `open_document` — a writeback re-read must never count as a
	 * read, §6.7, and never a second HTTP hop through the deleted
	 * `CoreApiPort.knowledge` seam). `bootAgentOrchestration` threads both
	 * through exactly like `actionTools`. Present whenever `db` is provided.
	 */
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
}

/**
 * The human whose held connections a
 * spawn provisions. A deployment is single-founder
 * (`docs/architecture/authorization-model.md:32`) — one human owns the
 * deployment's connections, and every agent it runs provisions that human's
 * tokens. Deterministic under more than one human — oldest row, id as
 * tiebreak — so a shared-mode deployment provisions the founder's connections
 * and never a later member's.
 */
function resolveProvisioningOwnerUserIdFor(
	db: NonNullable<AppOptions["db"]>,
): () => Promise<string | null> {
	return async () => {
		const humans = await listUsers(db, { kind: "human" });
		let owner: (typeof humans)[number] | undefined;
		for (const human of humans) {
			if (!owner) {
				owner = human;
				continue;
			}
			if (human.createdAt < owner.createdAt) owner = human;
			else if (human.createdAt === owner.createdAt && human.id < owner.id) owner = human;
		}
		return owner?.id ?? null;
	};
}

// @lore A `buildResolveModel` stood here, answering "(tier, override) -> which
// provider, which model, which key" out of the model gateway and the credential
// store. Its answer reached a session as `resolvedModel`, and only the built-in
// adapter ever called the API it described. Every harness authenticates itself
// now, so the gateway, its credentials and this builder are gone.

export async function bootCoreApi(options?: CoreApiBootOptions): Promise<CoreApiBoot> {
	const db = options?.db;

	// The hub is built ONCE, here,
	// carrying core-api's own topics only (`thread:<id>`, `conversations`).
	// A caller-supplied `wsHub` (tests) is respected as-is.
	const wsHub =
		options?.wsHub instanceof WsConnectionHub
			? options.wsHub
			: db
				? new WsConnectionHub(
						createDbSubscribeAuthorizer(db, {
							conversation: { getThreadById: (execDb, id) => findThread(execDb, { id }) },
							// architecture.md §7: the `document:<id>` subscribe-authz edge —
							// `document`'s own row read, plus the same `users` subject
							// resolution `document-actions.ts`'s `resolveViewer` does.
							document: {
								getForSubscribe: async (execDb, id) => (await getDocument(execDb, id)) ?? undefined,
							},
							users: {
								getUserById: (execDb, id) => findUser(execDb, { id }),
								listOwnedBy: (execDb, ownerId) => listUsers(execDb, { ownerUserId: ownerId }),
							},
						}),
					)
				: new WsConnectionHub();

	// Build the production WS-route registrar from this
	// boot's OWN `wsHub`, when the Application supplied its Node-specific
	// `upgradeWebSocket` adapter and did not itself override `registerWebSocket`
	// (a test harness may still stub the hook to just activate the token
	// store — see `app.auth-route-conditional.integration.test.ts`).
	let wsRouteDispose: (() => void) | null = null;
	const upgradeWebSocket = options?.upgradeWebSocket;
	const registerWebSocket =
		options?.registerWebSocket ??
		(upgradeWebSocket
			? (apiRouter: Hono, tokenStore: UpgradeTokenStore) => {
					wsRouteDispose = registerWsRoute(apiRouter, tokenStore, upgradeWebSocket, wsHub);
				}
			: undefined);

	// @lore AU44 batch 4: wrappedServiceBootstrap removed — it only existed to
	// inject readAlertPreferences (blockerAlerts/reviewAlerts/quietHours) from
	// server_config into installNotifications via the dispatcher. The dispatcher
	// is deleted; installNotifications no longer takes readAlertPreferences.
	const layerOptions: CoreApiBootOptions = {
		...options,
		wsHub,
		...(registerWebSocket ? { registerWebSocket } : {}),
		...(options?.serviceBootstrap ? { serviceBootstrap: options.serviceBootstrap } : {}),
	};

	// I2 review arch H-2/H-3: the store — and with it `/api/auth/ws-token` —
	// exists only when WS support is being wired.
	const tokenStore =
		options?.upgradeTokenStore ?? (registerWebSocket ? createUpgradeTokenStore() : null);

	const app = await createCoreApiApp({
		...layerOptions,
		...(tokenStore ? { upgradeTokenStore: tokenStore } : {}),
	});

	// Kept as its OWN phase, separate from
	// `disposers` — the Application's shutdown sequence disposes the socket
	// as a distinct, named, awaited step (`create-server.ts`'s "websocket"
	// phase), same ordering it had before this boot absorbed its construction.
	const disposeWebSocket = (): void => {
		wsRouteDispose?.();
	};

	const disposers: Array<() => void> = [...takeAppDisposers(app)];
	const actionTools = takeAppActionTools(app) ?? [];

	// §8.4: the raw `edit_document`/`search_documents` runners this boot's own
	// `app` just built, adapted from the door's `(ctx: ActionContext, input)`
	// shape onto the locked `(caller, input)` shape `CoreApiBoot` promises —
	// `db`/`eventBus` are bound HERE, once, matching `actionTools`'s own "one
	// composed list, built once" (§7). `ctx.eventBus` is never actually read
	// by either document runner (`document-actions.ts` reaches the event bus
	// only through its own injected `wsPush`, never `ctx.eventBus`), so a
	// fresh fallback instance when the caller supplied none is harmless — the
	// same fallback `createCoreApiApp` itself uses internally when building
	// the SAME actions.
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
