/**
 * AU26 B1b (§D-C) — the `remote-server` **Application**'s composition root.
 *
 * This is the real Application: it opens the DB, builds the `EventBus`, boots
 * all three Layer faces (`bootAgentExecution` → `bootCoreApi` →
 * `bootAgentOrchestration`), mounts them behind ONE middleware stack on ONE
 * Hono instance, and disposes everything.
 *
 * @lore AU31 §5.3: this file used to construct every Layer's internals
 * itself — the MCP bridge, the WS connection hub, the credential migration,
 * the provisioning ports (`connections`/`filesystems`/`filesystem-mounting`),
 * the knowledge-writeback wiring — twelve `@hyperidle/<service>` imports deep
 * into Layers this Application does not own. Every one of those now lives
 * inside the Layer boot that owns the dependency (`bootAgentExecution` owns
 * the harness/MCP content, `bootCoreApi` owns credentials/settings/users/
 * conversation, `bootAgentOrchestration` owns connections/filesystems/
 * filesystem-mounting/knowledge-writeback-over-the-seam) — this file now
 * composes three layer FACES and nothing deeper. The Hono mount recipe
 * (middleware ordering, the `notFound` trap, pre-auth vs auth ordering) is
 * `@hyperidle/http-middleware`'s `composeApiApplication` — a layer-blind helper,
 * not a fourth composition package (AU26 ruling, upheld).
 *
 * @lore AU26 B1b (AC9/AC10, the Hono `notFound` trap): the two Layer apps mount
 * on the SAME `/api` router, so every path string keeps its byte-identical
 * public URL (§D-A rule 7). Hono applies a parent's middleware, context vars and
 * `onError` to a mounted sub-app but NOT its `notFound` — only the ROOT app's
 * fires (verified on the installed `hono@4.12.30`,
 * `.pipeline/work/AU26/probes/two-app-mount/`). `composeApiApplication` builds
 * the canonical JSON 404 on the root app for exactly this reason.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type ServerType, serve, upgradeWebSocket } from "@hono/node-server";
import { bootAgentExecution } from "@hyperidle/agent-execution";
import {
	type ApplicationProvisionSessionDeps,
	bootAgentOrchestration,
	createInProcessCoreApiTransport,
	type RunOrchestrationHarnessRuntimeAdapter,
	type RunOrchestrationReturnStatusToolAdapter,
} from "@hyperidle/agent-orchestration";
import {
	buildAgentOrchestrationPort,
	composeApiApplication,
	createInProcessAgentOrchestrationTransport,
	DEFAULT_REAPER_STALE_AFTER_MS,
	health,
	registerAgentLayerServices,
	registerCoreDomainServices,
} from "@hyperidle/core-api";
import { disposeApp, registerAppDisposers } from "@hyperidle/core-api/app";
import { bootCoreApi, type CoreApiBoot } from "@hyperidle/core-api/boot";
import { createPgliteDb, createPostgresDb, type DbHandle, type HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import { WebSocketServer } from "ws";
import { resolveProfile } from "./profiles.js";
// @lore AU26: `ws` ships NO type declarations of its own, so `@types/ws` is a
// hard requirement wherever `ws` is imported — it lives in this package's
// devDependencies alongside the `ws` runtime dependency. When this import moved
// here from `core-api/src/server-factory.ts`, only `ws` came across and
// `@types/ws` was dropped; that broke TWO things at once, because
// `@types/ws/index.d.ts` opens with `/// <reference types="node" />` and was
// silently the only thing pulling `@types/node` into core-api's program.
// Never rely on a triple-slash reference inside a third-party `.d.ts` to supply
// node types — declare `@types/node` + `"types": ["node"]` per package instead.
// It reproduces only on a clean `npm ci` tree; stale local `dist/` +
// `.tsbuildinfo` mask it, which is why it passed locally and failed in CI.

/**
 * AU19 Increment 5 (item 2) / AU31 §6: which shape of execution face this
 * composition wants — `"local"` (in-process CLI harness discovery + a real
 * local sandbox, `desktop`'s shape) or `"disabled"` (an empty pool, populated
 * only by remote workers registering over the worker WS route,
 * `remote-server`'s shape). Replaces the pre-AU31 shape where an Application
 * constructed its own concrete `AdapterPool`/`SandboxAdapter` and injected
 * them here — `bootAgentExecution` now owns that construction (§6).
 */
export interface CreateServerDeps {
	readonly db?: HyperIdleDb;
	readonly topology: "local" | "disabled";
	readonly sandboxBasePath?: string;
	/**
	 * Interface to bind the listening socket to. Omitted → `@hono/node-server`
	 * binds EVERY interface, which is what the hosted deployment needs (the
	 * container must be reachable from its ingress).
	 *
	 * @lore Exposure is a property of the Application, not of this factory, so
	 * it is a parameter rather than a runtime env branch. `desktop` embeds this
	 * server in the Electron shell and passes `127.0.0.1`: S-9.2 promises the
	 * desktop app is not reachable from the local network, and until this field
	 * existed that promise was false — the embedded server bound `::`, so any
	 * machine on the same café/office LAN could reach a laptop's team data.
	 * `remote-server` deliberately leaves this undefined. Both sides are pinned
	 * by `src/__tests__/server-bind-address.integration.test.ts`.
	 */
	readonly hostname?: string;
	/**
	 * Test-only escape hatch: a pre-built execution face, used instead of
	 * calling `bootAgentExecution({ topology, mcpBaseUrl })` internally — same
	 * idiom as `test-utils.ts`'s `TestAppOptions.agentOrchestrationBoot`. Lets
	 * a harness-facing integration test inject a pool with tuned adapter
	 * options (e.g. `maxIterations`/`maxOutputTokens` for a fast, deterministic
	 * real-LLM call) that `topology` alone cannot express. `topology` is
	 * ignored when this is supplied.
	 */
	readonly agentExecutionBoot?: Awaited<ReturnType<typeof bootAgentExecution>>;
}

/**
 * Handle returned from `createServer` so callers can shut the server down
 * cleanly in tests + graceful shutdown.
 *
 * `httpServer` is typed as `ServerType` from @hono/node-server (which is
 * `http.Server | Http2Server | Http2SecureServer`). In practice, since we
 * do not pass HTTP/2 options to `serve()`, the runtime value is always
 * `http.Server`. We store `ServerType` to avoid an unsafe `as http.Server`
 * cast — `.close()` exists on all union members.
 *
 * @lore N1: B1 (reviewer): do NOT use `as http.Server` cast. Use ServerType
 * directly — `.close()` exists on all union members.
 *
 * @lore BC3 thread-ws-e2e: `actionTools` is exposed so an integration test
 * can invoke the real `send_message` MCP tool door (`actionsAsTools`'s
 * handler, the exact registry `bootAgentOrchestration`'s runtime threads a
 * live session's tool calls through) against THIS composition's own
 * db/wsHub, not a second throwaway boot whose hub would have zero connected
 * clients.
 */
export interface ServerHandle {
	readonly httpServer: ServerType;
	readonly dispose: () => Promise<void>;
	readonly actionTools: CoreApiBoot["actionTools"];
}

const MIME_TYPES: Record<string, string> = {
	".html": "text/html",
	".js": "application/javascript",
	".css": "text/css",
	".json": "application/json",
	".png": "image/png",
	".jpg": "image/jpeg",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".woff2": "font/woff2",
	".woff": "font/woff",
};

/**
 * Create a fetch handler that serves static files from a directory,
 * falling back to the Hono app for /api routes and to index.html for
 * SPA client-side routing.
 */
function createStaticHandler(
	dir: string,
	appFetch: (req: Request, env?: unknown) => Response | Promise<Response>,
): (req: Request, env?: unknown) => Response | Promise<Response> {
	const indexPath = path.join(dir, "index.html");

	return (req: Request, env?: unknown): Response | Promise<Response> => {
		const url = new URL(req.url);

		// /api routes (including WebSocket upgrades at /api/ws) go to the Hono app.
		// env must be forwarded — @hono/node-server passes WebSocket bindings via env.
		if (url.pathname.startsWith("/api")) {
			return appFetch(req, env);
		}

		// Try to serve exact file
		const filePath = path.join(dir, url.pathname);
		if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
			const ext = path.extname(filePath);
			return new Response(fs.readFileSync(filePath), {
				headers: { "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream" },
			});
		}

		// SPA fallback: serve index.html
		return new Response(fs.readFileSync(indexPath), {
			headers: { "Content-Type": "text/html" },
		});
	};
}

/**
 * Resolve a PGlite data directory path to an absolute path.
 * If the path is already absolute or is the special `:memory:` value, return
 * it unchanged. Otherwise resolve it relative to the repo root so that
 * `"./hyperidle-pg"` always points to `<repo-root>/hyperidle-pg` regardless
 * of the process CWD (which differs between `npm run dev` and direct Node
 * invocations).
 *
 * @lore CWD-mismatch: `npm run dev` starts the server from
 * `packages/server/` (workspace CWD), so a raw `"./hyperidle-pg"` resolves
 * to `packages/server/hyperidle-pg` — not the repo-root DB created by
 * `npm run setup`. We compute the repo root as 3 directories above this
 * file (`packages/server/src/server-factory.ts`).
 */
function resolvePglitePath(rawPath: string): string {
	if (rawPath === ":memory:" || path.isAbsolute(rawPath)) {
		return rawPath;
	}
	// import.meta.url → file:///…/packages/server/src/server-factory.ts
	// repoRoot        → file:///…/ (3 levels up)
	const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
	return path.resolve(repoRoot, rawPath);
}

export async function createServer(port: number, deps: CreateServerDeps): Promise<ServerHandle> {
	// AF7 §1: when a test injects `deps.db`, use the migrated fixture DB and do NOT
	// construct/own a throwaway DB. Production passes nothing → real DB + close.
	//
	// @lore AU31 §8 overlap 1 (AU29's own db:util handoff): `resolveProfile` and
	// this whole DB-open block are AU29's — kept byte-for-byte. AU31 leaves the
	// `application → db:util [import]` key untouched; it neither clears nor adds
	// a site under it.
	let dbHandle: DbHandle | null = null;
	let db: HyperIdleDb;
	// @lore BA9g: where installed plugin files live, beside the database. Nothing
	// set this before — `app.ts` documented it as "production wiring passes the
	// platform config dir" and no Application ever did, so `plugins.install_path`
	// was null on every real install. Two features were dead as a result: restore
	// answered NO_INSTALL_PATH forever, and `mergePluginMcpContributions` skips
	// any plugin without an install path, so a plugin's MCP servers never reached
	// a session. Both only worked in tests, which pass a temp dir.
	let pluginsBaseDir: string | undefined;
	if (deps.db) {
		db = deps.db;
	} else {
		const profile = resolveProfile(process.env);
		const rawDbUrl = process.env.DATABASE_URL ?? profile.dbUrlDefault;
		const dbUrl = profile.dbDriver === "pglite" ? resolvePglitePath(rawDbUrl) : rawDbUrl;
		if (profile.dbDriver === "pglite") {
			dbHandle = await createPgliteDb(dbUrl);
		} else {
			dbHandle = createPostgresDb(dbUrl);
		}
		db = dbHandle.db;
		// NOT "plugins": beside a dev checkout's database that is the repo's own
		// plugin SOURCE directory, and install `rmSync`s the destination before
		// copying — so installing would delete the sources it was built from.
		pluginsBaseDir = path.join(path.dirname(dbUrl), "installed-plugins");
	}
	const eventBus = new EventBus();

	const hasSecret = Boolean(process.env.HYPERIDLE_CREDENTIAL_KEY ?? process.env.HYPERIDLE_API_KEY);
	if (!hasSecret) {
		// @lore AH1 §6, corrected by the server_credentials deletion: Boot is
		// non-fatal but we log a warning so misconfigured deployments are
		// visible. The write boundary is now POST /api/connections (a held
		// token's encrypt step throws MISSING_ROOT_SECRET without a secret) —
		// the same cipher the deleted /api/credentials route used to guard.
		// console.warn is intentional here — the observability adapter is not
		// yet constructed at this point in the boot sequence.
		// biome-ignore lint/suspicious/noConsole: intentional boot-time warning before observability adapter is constructed
		console.warn(
			"[HyperIdle] No HYPERIDLE_CREDENTIAL_KEY/HYPERIDLE_API_KEY set — connection token writes will be refused (MISSING_ROOT_SECRET) until a secret is configured.",
		);
	}

	const sandboxBasePath =
		deps.sandboxBasePath ??
		process.env.HYPERIDLE_WORKSPACES_DIR ??
		path.join(os.tmpdir(), "hyperidle-workspaces");
	const mcpBaseUrl = `http://localhost:${port}`;

	// §6: the execution Layer's real boot — owns the adapter pool, the sandbox
	// adapter, the return-enforcement registry, the MCP bridge + router, and
	// harness-environment provisioning.
	const agentExecution =
		deps.agentExecutionBoot ?? (await bootAgentExecution({ topology: deps.topology, mcpBaseUrl }));

	// @lore AU31 §3.2 clause 4: the construction cycle — both seam transports
	// must dial the COMPOSED app (the one carrying the `/api` prefix), which
	// does not exist until every Layer has booted and been mounted below.
	// Closed by root-local bindings, not module variables. No route handler
	// calls a port before then (they only read it when a real request
	// arrives; both ports' methods are lazy), so this is safe.
	// @lore AU31 §3.2: the transport TYPE is derived from the layer face
	// function's own signature (`ReturnType<typeof createInProcessCoreApiTransport>`
	// / `Parameters<typeof buildAgentOrchestrationPort>[0]`) rather than
	// imported by name from `@hyperidle/api-contract` — an application may not
	// name a framework contract package directly (governance `crossing-import`,
	// api-contract's reach is `["layer"]`); it reaches the type only through
	// the LAYER export it already legally imports.
	let realCoreApiTransport: ReturnType<typeof createInProcessCoreApiTransport> | undefined;
	const coreApiTransport: ReturnType<typeof createInProcessCoreApiTransport> = async (req) => {
		if (!realCoreApiTransport) {
			throw new Error("CoreApiPort transport called before the composed app was built.");
		}
		return realCoreApiTransport(req);
	};
	let realAgentOrchestrationTransport:
		| Parameters<typeof buildAgentOrchestrationPort>[0]
		| undefined;
	const agentOrchestrationTransport: Parameters<typeof buildAgentOrchestrationPort>[0] = async (
		req,
	) => {
		if (!realAgentOrchestrationTransport) {
			throw new Error("AgentOrchestrationPort transport called before the composed app was built.");
		}
		return realAgentOrchestrationTransport(req);
	};
	const agentOrchestrationPort = buildAgentOrchestrationPort(agentOrchestrationTransport);

	// @lore AU36 D5: same deferred-binding idiom as the transports above —
	// `bootCoreApi` runs BEFORE `bootAgentOrchestration`, so the redetect
	// callback closes over a binding filled once the orchestration boot (and
	// thus its `inheritedReach`) exists. Any real redetect happens strictly
	// after that (route handlers only run on the composed app).
	let realInheritedReachRefresh: (() => Promise<void>) | undefined;
	const onHarnessRedetect: () => Promise<void> = () => {
		if (!realInheritedReachRefresh) {
			throw new Error("onHarnessRedetect called before the composed app was built.");
		}
		return realInheritedReachRefresh();
	};

	const coreApi = await bootCoreApi({
		db,
		eventBus,
		agentOrchestration: agentOrchestrationPort,
		upgradeWebSocket,
		adapterPool: agentExecution.adapters.pool,
		onHarnessRedetect,
		...(pluginsBaseDir ? { pluginsBaseDir } : {}),
		serviceBootstrap: (ctx) => {
			// AF6/AU1: production boots the routine scheduler at the default
			// 30s cadence. Runtime deps are present, so generic routine fires
			// enter through AgentSessionRequest instead of stub sessions.
			// `ctx.readAlertPreferences` is `bootCoreApi`'s own capability
			// (§5.2) — this Application no longer imports `@hyperidle/settings`
			// to build it.
			// AF7 §1: `canProvision: true` is the whole presence signal the task
			// dispatcher's injection seam needs (§2.4/[P4] — the deleted
			// harness-typed `dispatcherDeps` bundle carried no other live read;
			// `service-bootstrap.ts:68` records that `Boolean(ctx.dispatcherDeps)`
			// was only ever a stand-in for this same boolean).
			// AU11: two owners register independently — core domain services
			// (knowledge/notifications/policy/routine-scheduler) then agent-owned
			// services (builtin-routine handlers/dispatcher/reapers).
			return [
				...registerCoreDomainServices({ ...ctx, canProvision: true }),
				...registerAgentLayerServices({ ...ctx, canProvision: true }),
			];
		},
	});

	const harnessRuntimeAdapter: RunOrchestrationHarnessRuntimeAdapter =
		agentExecution.adapters.harnessRuntime;
	const returnStatusToolAdapter: RunOrchestrationReturnStatusToolAdapter = {
		forRegistry: (registry) => agentExecution.adapters.returnStatusTool.forRegistry(registry),
	};

	const runtimeSessionDeps = {
		db,
		eventBus,
		adapterPool: agentExecution.adapters.pool,
		workspace: agentExecution.adapters.sandbox,
		pluginMcpContributions: coreApi.pluginMcpContributions,
	} satisfies ApplicationProvisionSessionDeps;

	// §5.1: the run runtime (poller/drain/watcher) starts INSIDE this boot —
	// this Application no longer calls `startRuntime` itself, and no longer
	// builds the provisioning reads (`connections`/`filesystems`/
	// `filesystem-mounting`) or the knowledge-writeback port — all three are
	// in-layer for `bootAgentOrchestration` now (§5.1/§2.7).
	// §5: the join. `actionTools` starts as core's own list; the
	// thunk below lets `bootAgentOrchestration` build every session's tool
	// registry lazily, per session, off whatever this binding currently holds
	// — so a session admitted AFTER the reassignment three lines down sees
	// both layers' actions, and no earlier session exists yet to have seen
	// the narrower list.
	let actionTools = coreApi.actionTools;
	const agentOrchestration = await bootAgentOrchestration({
		db,
		eventBus,
		// AU26 J3, superseded: `upgradeWebSocket` here is ONLY for worker
		// WebSocket registration now — the live-run stream itself reaches the
		// browser through `wsPush` below, on core's own socket.
		upgradeWebSocket,
		// Byte-identical to core's own action-layer binding (`core-api/src/app.ts`).
		wsPush: (topic, envelope) => coreApi.wsHub.broadcast(topic, JSON.stringify(envelope)),
		// AU36 D4: a `local`-topology deployment probes at boot; a `disabled`
		// one keeps today's behavior — no boot probe, redetect populates (D5).
		probeInheritedReach: deps.topology === "local",
		runtime: {
			harnessRuntime: harnessRuntimeAdapter,
			returnStatusTool: returnStatusToolAdapter,
			coreApiTransport,
			// §7/§5 — one composed list, built once: core-api's actions, projected
			// onto this Layer's own MCP tool seam, as a thunk (see above).
			actionTools: () => actionTools,
			// §8.4 — the writeback processor's document port, bound straight to
			// core's composed `edit_document`/`search_documents` values, threaded
			// through exactly like `actionTools` above.
			editDocument: coreApi.editDocument,
			searchDocuments: coreApi.searchDocuments,
			session: runtimeSessionDeps,
			sandboxBasePath,
			worker: {
				pool: agentExecution.adapters.pool,
				// @lore AU31/AU34: passed straight through (not re-wrapped with a
				// named `WorkerRegisterMessage` parameter annotation) — an
				// Application has no declared reach to `@hyperidle/harness-protocol`
				// (governance `crossing-import`); the function value already carries
				// that type, so forwarding it structurally needs no import.
				createWorkerAdapter: agentExecution.adapters.createWorkerAdapter,
			},
			reapers: {
				sandboxes: { sandboxBasePath },
				routines: { staleAfterMs: DEFAULT_REAPER_STALE_AFTER_MS },
			},
			resolveProvisioningOwnerUserId: coreApi.resolveProvisioningOwnerUserId,
		},
	});
	// §5: close the join — every session from here on sees both
	// layers' actions through the thunk above.
	actionTools = [...coreApi.actionTools, ...agentOrchestration.actionTools];
	// AU36 D5: close the deferred binding — redetect now reaches the reach cache.
	realInheritedReachRefresh = () => agentOrchestration.inheritedReach.refresh();

	// ----- AU26 B1b (§D-B) / AU31 §5.3: the Application's own composition -----
	//
	// ONE Hono instance, ONE `/api` router, ONE listener, every Layer face
	// mounted behind the SAME auth boundary — built by the layer-blind
	// `composeApiApplication` helper (`@hyperidle/http-middleware`) so this
	// Application and `desktop`'s own composition root cannot silently drift
	// apart on the ordering that makes the boundary real.
	const app = composeApiApplication({
		middleware: coreApi.middleware,
		preAuthRegistrars: [
			coreApi.registerPreAuthRoutes,
			agentOrchestration.registerPreAuthRoutes,
			agentExecution.mountMcpRouter,
		],
		apps: [coreApi.app, agentOrchestration.app],
	});
	// Backward-compat: /health without auth, outside the /api tree.
	app.route("/", health);

	// AU31 §3.2 clause 4: close the construction cycle — the in-process
	// transports (need the COMPOSED app, since their seam URLs carry the
	// `/api` prefix) can only be built now that `app` exists. The ports built
	// above (before either Layer booted) already resolve every subsequent
	// request through them.
	realAgentOrchestrationTransport = createInProcessAgentOrchestrationTransport(app);
	realCoreApiTransport = createInProcessCoreApiTransport(app);

	// Both Layers' + the execution face's teardown ride the composed app's
	// disposer bag, so a single `disposeApp(app)` tears the whole composition
	// down as one named "app-domain" phase (below) — same shape the pre-§5.3
	// composition used, `agentExecution.dispose` (currently a no-op — see its
	// own doc comment) joining it for the same reason.
	registerAppDisposers(app, [
		...coreApi.disposers,
		agentOrchestration.dispose,
		agentExecution.dispose,
	]);

	// Serve built frontend when HYPERIDLE_STATIC_DIR is set.
	// The SPA falls back to index.html for client-side routing.
	const staticDir = process.env.HYPERIDLE_STATIC_DIR;
	let resolvedStaticDir: string | null = null;
	if (staticDir) {
		resolvedStaticDir = path.resolve(staticDir);
		if (!fs.existsSync(path.join(resolvedStaticDir, "index.html"))) {
			resolvedStaticDir = null;
		}
	}

	const appFetch = app.fetch;
	const staticFetch = resolvedStaticDir
		? createStaticHandler(resolvedStaticDir, appFetch)
		: appFetch;

	// Create the WebSocketServer with noServer: true — @hono/node-server
	// handles the upgrade event internally and delegates to this wss instance.
	const wss = new WebSocketServer({ noServer: true });

	// `hostname` undefined → serve() binds all interfaces (the hosted default).
	// `desktop` passes 127.0.0.1 so the embedded server is loopback-only (S-9.2).
	const httpServer = serve({
		fetch: staticFetch,
		port,
		...(deps.hostname === undefined ? {} : { hostname: deps.hostname }),
		websocket: { server: wss },
	});

	// @lore Binding is only synchronous when NO hostname is given. `net.Server`
	// routes `listen(port, host)` through `dns.lookup()` — even for a literal
	// `127.0.0.1` — so with a hostname the socket is still unbound when `serve()`
	// returns, and `httpServer.address()` is null. Every caller already assumes
	// otherwise: desktop calls `getPort(handle)` the moment `startServer()`
	// resolves, and would have thrown "Server not listening on a port". So the
	// factory awaits `listening` before handing back the handle — the promise it
	// already returns now means what callers read it to mean.
	await new Promise<void>((resolve, reject) => {
		if (httpServer.listening) {
			resolve();
			return;
		}
		// Declarations, not consts: each handler removes the other, so neither
		// can be in its temporal dead zone when the first event fires.
		function settle(error?: Error): void {
			httpServer.removeListener("listening", onListening);
			httpServer.removeListener("error", onFailure);
			if (error) reject(error);
			else resolve();
		}
		function onListening(): void {
			settle();
		}
		function onFailure(error: Error): void {
			settle(error);
		}
		httpServer.once("listening", onListening);
		httpServer.once("error", onFailure);
	});

	let disposePromise: Promise<void> | null = null;
	const dispose = (): Promise<void> => {
		if (disposePromise) return disposePromise;
		disposePromise = (async () => {
			const failures: Array<{ phase: string; cause: unknown }> = [];
			const runPhase = async (phase: string, cleanup: () => void | Promise<void>) => {
				try {
					await cleanup();
				} catch (cause) {
					failures.push({ phase, cause });
				}
			};

			await runPhase("run-runtime", () => agentOrchestration.disposeRuntime?.());
			await runPhase("app-domain", () => disposeApp(app));
			await runPhase("websocket", () => coreApi.disposeWebSocket());
			await runPhase(
				"http",
				() =>
					new Promise<void>((resolve, reject) => {
						httpServer.close((error?: Error) => {
							if (error) reject(error);
							else resolve();
						});
					}),
			);
			if (dbHandle) {
				await runPhase("owned-db", () => dbHandle.close());
			}

			if (failures.length > 0) {
				throw new AggregateError(failures, "Server disposal failed");
			}
		})();
		return disposePromise;
	};

	return {
		httpServer,
		dispose,
		// §5: the joined list — what the seam test drives as "the agent".
		actionTools,
	};
}
