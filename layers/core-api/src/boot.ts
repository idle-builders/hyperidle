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
 * touch (`credentials`, `settings`, `users`, `conversation`) is core-api's own
 * in-layer service. Application-level construction of these was legal only by
 * accident (nothing stopped an Application from doing a Layer's own wiring);
 * under the closed boundary an Application may reach only a Layer's face, so
 * the wiring moved to the face it always belonged to:
 *   - the one-time credential migration + the production `DbCredentialResolver`
 *     (`create-server.ts:450-477` before this leaf);
 *   - the WS connection hub + its subscribe authorizer (`conversation`'s
 *     `findThread` wire is core-internal) and the WS route itself, when the
 *     Application supplies its Node-specific `upgradeWebSocket` adapter;
 *   - the work-state push gateway (task/bet forwarder onto the hub);
 *   - the upgrade-token store construction;
 *   - a `resolveModel` capability built from this Layer's own `settings` +
 *     `credentials` services (replaces the Application's `makeResolveModel`);
 *   - `resolveProvisioningOwnerUserId` — AU26 review C2's "the human whose
 *     held connections a spawn provisions" now reads `users` (core-api's own
 *     table) from INSIDE this boot instead of the Application importing
 *     `@hyperidle/users` directly; the boot hands the resolved capability out
 *     as a value, and the Application threads it into `bootAgentOrchestration`'s
 *     options exactly the way it already threads `resolveModel` and the
 *     execution adapters bundle — no Layer imports another.
 *
 * The boot RESULT exposes what the Application must pass onward
 * (`upgradeTokenStore`, `resolveModel`, `resolveProvisioningOwnerUserId`,
 * `wsHub`, `middleware`, `app`, `registerPreAuthRoutes`) — the Application
 * mediates every cross-face handoff, never a direct service import.
 */

import { findThread } from "@hyperidle/conversation";
import type { CredentialResolver } from "@hyperidle/credential-access";
import {
	decryptCredentialValue,
	encryptCredentialValue,
	resolveModel as resolveModelAgainstGateway,
} from "@hyperidle/credential-access";
import { DbCredentialResolver, readCredentials, writeCredential } from "@hyperidle/credentials";

import type { ModelTier, ResolvedModel } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import { migrateCredentialsToStore, readServerConfig } from "@hyperidle/settings";
import { createUpgradeTokenStore, listUsers, type UpgradeTokenStore } from "@hyperidle/users";
import type { Hono } from "hono";
import type { UpgradeWebSocket } from "hono/ws";
import { type ApiMiddlewareStack, createApiMiddlewareStack } from "./api-middleware-stack.js";
import {
	type AppOptions,
	createCoreApiApp,
	registerCoreApiPreAuthRoutes,
	takeAppDisposers,
} from "./app.js";
import { registerWsRoute } from "./routes/ws.js";
import { registerWorkStatePushGateway } from "./services/work-state-push-gateway.js";
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
	 * `@hyperidle/users`, a core-api Service), applied by the Application.
	 * A single instance: the rate limiter's buckets live in its closure.
	 */
	readonly middleware: ApiMiddlewareStack;
	/**
	 * This Layer's teardown, as a flat list the Application registers on its
	 * composed root app — NOT a nested `disposeApp` thunk (see `takeAppDisposers`).
	 */
	readonly disposers: ReadonlyArray<() => void>;
	/**
	 * AU21 §9 Increment 14d / AU31 §5.2: disposes the WS route (when
	 * `upgradeWebSocket` was supplied) and the work-state push gateway — kept
	 * SEPARATE from `disposers` so the Application can run it as its own
	 * named, awaited shutdown phase, same ordering `create-server.ts` used
	 * before this boot absorbed their construction.
	 */
	readonly disposeWebSocket: () => void;
	/**
	 * AU31 §5.2: this Layer's own WS connection hub — the topic space
	 * `conversations`/`work`/`thread:<id>` routes push onto directly. Exposed
	 * so the Application can pass it to `registerWebSocket` overrides in
	 * tests; production reaches it only through the WS route this boot wires
	 * itself when `upgradeWebSocket` is supplied.
	 */
	readonly wsHub: WsConnectionHub;
	/** The upgrade-token store `/api/auth/ws-token` mints from and the WS route consumes. Present whenever WS support is being wired. */
	readonly upgradeTokenStore: UpgradeTokenStore | null;
	/**
	 * AF7 §1: resolves `(tier, modelOverride?) => ResolvedModel | undefined`
	 * from this Layer's own `settings` (model gateway config) and
	 * `credentials` (the production resolver) — the poller drain's model
	 * resolution, same shape `create-server.ts`'s deleted `makeResolveModel`
	 * built. Present whenever `db` is provided.
	 */
	readonly resolveModel?: (
		tier: ModelTier,
		modelOverride?: { readonly modelId: string | null; readonly modelProvider: string | null },
	) => Promise<ResolvedModel | undefined>;
	/**
	 * AU26 review C2 / AU31 §5.2: the single human whose held connections a
	 * spawn provisions (oldest-row tiebreak). Reads `users` — core-api's own
	 * table — from inside this boot; the Application hands the resulting
	 * capability into `bootAgentOrchestration`'s options as a value. Present
	 * whenever `db` is provided.
	 */
	readonly resolveProvisioningOwnerUserId?: () => Promise<string | null>;
	/** The production credential resolver this boot constructed (or the caller's override) — exposed for the same reason `wsHub` is: AH1's single-resolver invariant test asserts `instanceof DbCredentialResolver` against it. */
	readonly credentialResolver?: CredentialResolver;
}

/**
 * AU26 review C2 (relocated, AU31 §5.2): the human whose held connections a
 * spawn provisions. AN2's deployment is single-founder
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

/**
 * AF7 §1: build the drain's `resolveModel(tier, modelOverride?)`, in-layer —
 * relocated verbatim from `create-server.ts`'s deleted `makeResolveModel`.
 */
function buildResolveModel(
	db: NonNullable<AppOptions["db"]>,
	credentialResolver: CredentialResolver,
): (
	tier: ModelTier,
	modelOverride?: { readonly modelId: string | null; readonly modelProvider: string | null },
) => Promise<ResolvedModel | undefined> {
	return async (tier, modelOverride) => {
		const cfg = await readServerConfig(db);
		if (modelOverride && modelOverride.modelProvider !== "openai-compatible") {
			return resolveModelAgainstGateway(
				{
					kind: "agent",
					modelId: modelOverride.modelId,
					modelProvider: modelOverride.modelProvider,
					tierFallback: tier,
				},
				cfg.modelGateway,
				credentialResolver,
			);
		}
		return resolveModelAgainstGateway({ kind: "tier", tier }, cfg.modelGateway, credentialResolver);
	};
}

export async function bootCoreApi(options?: CoreApiBootOptions): Promise<CoreApiBoot> {
	const sharedMode = options?.sharedMode ?? process.env.HYPERIDLE_SHARED_MODE === "true";
	const db = options?.db;

	// AH1 §4/§3: the one-time credential migration + the production resolver —
	// both core-api's own service (`credentials`), so both build here now
	// rather than in the Application. A caller-supplied `credentialResolver`
	// (tests) is respected as-is; production leaves it unset and gets the
	// real thing.
	let credentialResolver = options?.credentialResolver;
	if (db && !credentialResolver) {
		credentialResolver = new DbCredentialResolver(db);
		await migrateCredentialsToStore(
			db,
			{ encryptCredentialValue, decryptCredentialValue },
			{
				findByName: async (execDb, name) => (await readCredentials(execDb, { name }))[0],
				insert: async (execDb, values) =>
					writeCredential(execDb, values.name, {
						encryptedValue: values.encryptedValue,
						validationState: values.validationState,
						lastValidatedAt: values.lastValidatedAt,
						updatedAt: values.updatedAt,
					}),
			},
		);
	}

	// AU21 §6 Decision L4 / AU26 J3 / AU31 §5.2: the hub is built ONCE, here,
	// carrying core-api's own topics only (`thread:<id>`, `conversations`,
	// `work`). A caller-supplied `wsHub` (tests) is respected as-is.
	const wsHub =
		options?.wsHub instanceof WsConnectionHub
			? options.wsHub
			: db
				? new WsConnectionHub(
						createDbSubscribeAuthorizer(db, {
							conversation: { getThreadById: (execDb, id) => findThread(execDb, { id }) },
						}),
					)
				: new WsConnectionHub();

	const eventBus: EventBus | undefined = options?.eventBus;
	const workStatePushGatewayDispose =
		db && eventBus ? registerWorkStatePushGateway(eventBus, wsHub) : undefined;

	// S2-F01 / AU31 §5.2: build the production WS-route registrar from this
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

	// AF6/AU1 / AU31 §5.2: the routine scheduler's notification-preferences
	// read — built here (this Layer's own `settings`) and merged onto the
	// ctx the caller's `serviceBootstrap` receives, so an Application can
	// register the scheduler without importing `@hyperidle/settings` itself.
	const serviceBootstrap = options?.serviceBootstrap;
	const wrappedServiceBootstrap = serviceBootstrap
		? (ctx: {
				db: NonNullable<AppOptions["db"]>;
				eventBus: EventBus;
				agentOrchestration: NonNullable<AppOptions["agentOrchestration"]>;
			}) =>
				serviceBootstrap({
					...ctx,
					readAlertPreferences: async () => {
						const cfg = await readServerConfig(ctx.db);
						return {
							blockerAlerts: cfg.notifications.blockerAlerts,
							reviewAlerts: cfg.notifications.reviewAlerts,
							quietHoursEnabled: cfg.notifications.quietHoursEnabled,
							quietHoursStart: cfg.notifications.quietHoursStart,
							quietHoursEnd: cfg.notifications.quietHoursEnd,
						};
					},
				})
		: undefined;

	const layerOptions: CoreApiBootOptions = {
		...options,
		wsHub,
		...(credentialResolver ? { credentialResolver } : {}),
		...(registerWebSocket ? { registerWebSocket } : {}),
		...(wrappedServiceBootstrap ? { serviceBootstrap: wrappedServiceBootstrap } : {}),
	};

	// I2 review arch H-2/H-3: the store — and with it `/api/auth/ws-token` —
	// exists only when WS support is being wired.
	const tokenStore =
		options?.upgradeTokenStore ?? (registerWebSocket ? createUpgradeTokenStore() : null);

	const app = await createCoreApiApp({
		...layerOptions,
		...(tokenStore ? { upgradeTokenStore: tokenStore } : {}),
	});

	// AU21 §9 Increment 14d / AU31 §5.2: kept as its OWN phase, separate from
	// `disposers` — the Application's shutdown sequence disposes the socket +
	// its push forwarder as a distinct, named, awaited step
	// (`create-server.ts`'s "websocket" phase), same ordering it had before
	// this boot absorbed their construction.
	const disposeWebSocket = (): void => {
		wsRouteDispose?.();
		workStatePushGatewayDispose?.();
	};

	const disposers: Array<() => void> = [...takeAppDisposers(app)];

	return {
		app,
		registerPreAuthRoutes: (apiRouter) => {
			registerCoreApiPreAuthRoutes(apiRouter, layerOptions, tokenStore);
		},
		middleware: createApiMiddlewareStack({
			...(db ? { db } : {}),
			sharedMode,
			...(options?.authApiKey !== undefined ? { apiKey: options.authApiKey } : {}),
		}),
		disposers,
		disposeWebSocket,
		wsHub,
		upgradeTokenStore: tokenStore,
		...(db && credentialResolver
			? { resolveModel: buildResolveModel(db, credentialResolver) }
			: {}),
		...(db ? { resolveProvisioningOwnerUserId: resolveProvisioningOwnerUserIdFor(db) } : {}),
		...(credentialResolver ? { credentialResolver } : {}),
	};
}
