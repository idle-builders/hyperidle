/**
 * AU26 B1b (§D-C) — the `remote-server` **Application**'s composition root.
 *
 * This is the real Application: it opens the DB, builds the `EventBus`, the WS
 * connection hub and the MCP bridge, boots BOTH Layers (`bootCoreApi` +
 * `bootAgentOrchestration`), applies the `/api` middleware stack, mounts both
 * Layer apps onto ONE Hono instance behind ONE listener, and disposes
 * everything.
 *
 * @lore AU26 B1b: this function used to live in `layers/core-api/src/server-factory.ts`
 * — a `core-api` file that mounted `agent-orchestration`'s app, which is the
 * same smell one level up. `runtime-simplification.md:159-164` says only an
 * Application may choose to put another Layer's routes behind core-api's auth
 * stack, so the choice moved to the Application that makes it. `desktop` and the
 * three `layers/core-ui/scripts/*-test-server.ts` harnesses import it from here;
 * `core-api` keeps its Layer-composition half in `service-bootstrap.ts`.
 *
 * @lore AU26 B1b (AC9/AC10, the Hono `notFound` trap): the two Layer apps mount
 * on the SAME `/api` router, so every path string keeps its byte-identical
 * public URL (§D-A rule 7). Hono applies a parent's middleware, context vars and
 * `onError` to a mounted sub-app but NOT its `notFound` — only the ROOT app's
 * fires (verified on the installed `hono@4.12.30`,
 * `.pipeline/work/AU26/probes/two-app-mount/`). The canonical JSON 404 for an
 * unknown `/api/*` path therefore MUST be declared on the root app below; a
 * "fix" that pushes it onto the `/api` sub-app turns every unknown `/api/*`
 * into Hono's `text/plain` default.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type ServerType, serve, upgradeWebSocket } from "@hono/node-server";
import { bootAgentOrchestration } from "@hyperidle/agent-orchestration";
import { readAgentRunConfigs } from "@hyperidle/agent-run-config";
import {
	listConnections,
	listHeldConnectionsForProvisioning,
	ServiceConnectionResolver,
} from "@hyperidle/connections";
import { findThread } from "@hyperidle/conversation";
import { disposeApp, registerAppDisposers } from "@hyperidle/core-api/app";
import { bootCoreApi } from "@hyperidle/core-api/boot";
import { health } from "@hyperidle/core-api/routes/health";
import { registerWsRoute } from "@hyperidle/core-api/routes/ws";
import {
	DEFAULT_REAPER_STALE_AFTER_MS,
	registerAgentLayerServices,
	registerCoreDomainServices,
} from "@hyperidle/core-api/service-bootstrap";
import {
	createInProcessAgentOrchestrationTransport,
	registerAgentOrchestrationTransport,
} from "@hyperidle/core-api/services/agent-orchestration-port-composition";
import {
	createInProcessCoreApiTransport,
	registerCoreApiTransport,
} from "@hyperidle/core-api/services/core-api-port-composition";
import {
	runtimeDeps as buildRunRuntimeDeps,
	type ProvisionSessionDeps,
	startRuntime,
} from "@hyperidle/core-api/services/run-orchestration-composition";
import { registerWorkStatePushGateway } from "@hyperidle/core-api/services/work-state-push-gateway";
import { WsConnectionHub } from "@hyperidle/core-api/ws-connection-hub";
import { createDbSubscribeAuthorizer } from "@hyperidle/core-api/ws-subscribe-authorizer";
import {
	type CredentialResolver,
	DbCredentialResolver,
	readCredentials,
	writeCredential,
} from "@hyperidle/credentials";
import { createPgliteDb, createPostgresDb, type DbHandle, type HyperIdleDb } from "@hyperidle/db";
import { RegistryFilesystemMounter } from "@hyperidle/filesystem-mounting";
import { listInjectedFilesystemsForProvisioning } from "@hyperidle/filesystems";
import {
	type AdapterPool,
	createReturnEnforcement,
	type SandboxAdapter,
} from "@hyperidle/harness-registry";
import { createMcpToolBridge } from "@hyperidle/harness-registry/mcp";
import {
	create as createKnowledgeItem,
	recordConflict as recordWritebackConflict,
	update as updateKnowledgeItem,
	VersionConflictError,
} from "@hyperidle/knowledge";
import { listRoutines } from "@hyperidle/routine";
import type { RuntimeDeps } from "@hyperidle/run-orchestration";
import {
	backfillConfigurationDefaults,
	migrateCredentialsToStore,
	readServerConfig,
} from "@hyperidle/settings";
import {
	API_ERROR_CODES,
	EventBus,
	type ModelTier,
	type ResolvedModel,
	resolveModel,
	resolveProfile,
} from "@hyperidle/shared";
import { decryptCredentialValue, encryptCredentialValue } from "@hyperidle/shared/crypto";
import { createGitRunner } from "@hyperidle/shared/git";
import { createUpgradeTokenStore, listUsers } from "@hyperidle/users";
import { Hono } from "hono";
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
import { WebSocketServer } from "ws";

/**
 * AF7 §1: build the drain's `resolveModel(tier, modelOverride?)`. The HTTP path
 * resolves models in sessions-routes via resolveModelTier; the poller drain (no
 * request context) needs the same resolution. Reuses the server config + the
 * production credential resolver. When resolution fails (missing credential),
 * the drain treats it as unrecoverable-per-request — correct.
 *
 * @lore AU27 Increment 6 (Decision 4, C11) x AU26 G1: `modelOverride` is the
 * target agent's `modelId`/`modelProvider`, applied uniformly for all six kinds,
 * not assistant-only. AU27 read it off the emit-time `agentConfig` bake because
 * the columns lived on `users`; AU26 relocated them into `agent_run_config`, an
 * agent-orchestration-owned table, so `start-runtime.ts`'s drain reads them LIVE
 * through `ports.agentRunConfig` and passes them here — same value, same
 * uniformity, one turn fresher.
 * `resolveModel({kind:"agent"})` sets `agentPath: true`, and `resolveProvider`'s
 * `openai-compatible` case THROWS `UnsupportedAgentProviderError` when
 * `agentPath` is set — `openai-compatible` is a real, user-selectable per-agent
 * provider (Settings → Agents), so an unguarded agent-path request would throw
 * outside `runClaimedRequest` (feeding the unbounded re-claim loop plan.md
 * accepts as out-of-scope) for any agent configured that way. The guard: request
 * `{kind:"agent"}` only when the override's provider is NOT `openai-compatible`;
 * otherwise fall back to `{kind:"tier"}` — such an agent then runs on its tier,
 * strictly better than throwing the turn out entirely. A `modelId`-less override
 * (or no override at all) already falls through to the tier inside
 * `resolveModel` itself, so this guard only ever narrows the agent path, never
 * widens it.
 */
function makeResolveModel(
	db: HyperIdleDb,
	credentialResolver: CredentialResolver,
): (
	tier: string,
	modelOverride?: { readonly modelId: string | null; readonly modelProvider: string | null },
) => Promise<ResolvedModel | undefined> {
	return async (
		tier: string,
		modelOverride?: { readonly modelId: string | null; readonly modelProvider: string | null },
	): Promise<ResolvedModel | undefined> => {
		const cfg = await readServerConfig(db);
		if (modelOverride && modelOverride.modelProvider !== "openai-compatible") {
			return resolveModel(
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
		return resolveModel(
			{ kind: "tier", tier: tier as ModelTier },
			cfg.modelGateway,
			credentialResolver,
		);
	};
}

/**
 * AU26 review C2 — the human whose held connections a spawn provisions.
 *
 * AN2's deployment is single-founder (`docs/architecture/authorization-model.md:32`):
 * one human owns the deployment's connections, and every agent it runs
 * provisions that human's tokens. This is the Application's call to make —
 * `agent-orchestration` reads zero core-api state, so it can never resolve an
 * owner itself, and AU21 K1's dead helper resolved exactly this same "the
 * single human" before it was deleted (it fell back to a hardcoded founder-id
 * sentinel; no row means no connections either, since `service_connections.userId`
 * references `users`, so the sentinel is dropped and `null` returned instead).
 *
 * Deterministic under more than one human — oldest row, id as tiebreak — so a
 * shared-mode deployment (`HYPERIDLE_SHARED_MODE` + invite codes) provisions
 * the founder's connections and never a later member's, rather than whichever
 * row the planner happened to return first. Carrying a per-SESSION owner on the
 * request is the multi-tenancy step, not this one.
 */
async function resolveProvisioningOwnerUserId(db: HyperIdleDb): Promise<string | null> {
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
}

/**
 * AF7 §1 / §14.3: test-only dependency overrides for `createServer`.
 *
 * @lore AU19 Increment 5 (item 2): `adapterPool`/`workspaceAdapter` were
 * OPTIONAL through Increment 4 — `packages/server` (the pre-AU19 composition
 * root) defaulted them internally via `createLocalAdapterPool()` +
 * `isServerProfile ? DisabledSandboxAdapter : LocalSandboxAdapter`, a runtime
 * `HYPERIDLE_PROFILE` env-var branch inside the ONE shared binary. That
 * defaulting made the concrete `HarnessPort` adapter a runtime toggle, not a
 * structural (tsc-enforceable) one — exactly what §12 Increment 5 item 2
 * (founder ruling `97b8728b`) requires fixing. Both fields are now REQUIRED:
 * `@hyperidle/core-api` (this Layer's composition barrel) no longer imports
 * `LocalSandboxAdapter`/`DisabledSandboxAdapter`/`createLocalAdapterPool` at
 * all — each Application (`desktop`, `remote-server`) constructs its own
 * concrete adapter/pool in its own bootstrap file and injects it here. Every
 * real call site already passed these explicitly (verified repo-wide before
 * this change — only the two zero-deps production entrypoints,
 * `packages/server/src/index.ts` and `applications/desktop/src/boot-server.ts`,
 * relied on the internal default; both are now Application bootstrap code
 * that supplies the concrete value itself, see `applications/remote-server/src/index.ts`
 * and `applications/desktop/src/boot-server.ts`).
 */
export interface CreateServerDeps {
	readonly db?: HyperIdleDb;
	readonly adapterPool: AdapterPool;
	readonly workspaceAdapter: SandboxAdapter;
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
 * `credentialResolver` is exposed so integration tests can assert the
 * production wiring is `instanceof DbCredentialResolver` (AH1 invariant).
 *
 * @lore N1: B1 (reviewer): do NOT use `as http.Server` cast. Use ServerType
 * directly — `.close()` exists on all union members.
 * @lore AH1 §3: credentialResolver is in ServerHandle so the single-resolver
 * invariant test can assert `instanceof DbCredentialResolver` without relying
 * on indirect observable effects. This is the correct scope: the test must
 * fail if someone reverts the wiring to EnvCredentialResolver.
 */
/**
 * The three session-provisioning ports this composition root hands the run
 * runtime, exposed for the same reason `credentialResolver` is (AH1 §3).
 *
 * @lore AU26 review C1: the WHOLE bug class this work package uncovered lives
 * in these three fields. `serviceConnectionResolver` was wired to a
 * `CredentialResolver` — `resolve(name)` where `resolve(userId, connectionId)`
 * was expected — and AN2 provisioning silently provisioned nothing in
 * production for months. Nothing failed: not `tsc` (an `as` cast on the deps
 * literal erased the shape), not a test (every provisioning proof hand-built
 * its own port and called the read function directly, never going through
 * `createServer`). Two things close that: the literal below is now TYPED, not
 * cast, so a wrong-arity resolver is a compile error; and these ports are on
 * the handle so
 * `core-api/src/__tests__/server-factory.provisioning-wiring.integration.test.ts`
 * can assert the production wiring is the real implementations, functionally,
 * against a real DB.
 */
export interface ProvisioningWiring {
	readonly serviceConnectionResolver: NonNullable<
		NonNullable<RuntimeDeps["runtime"]>["serviceConnectionResolver"]
	>;
	readonly heldConnections: NonNullable<NonNullable<RuntimeDeps["runtime"]>["heldConnections"]>;
	readonly injectedFilesystems: NonNullable<
		NonNullable<RuntimeDeps["runtime"]>["injectedFilesystems"]
	>;
}

export interface ServerHandle {
	readonly httpServer: ServerType;
	readonly dispose: () => Promise<void>;
	readonly credentialResolver: CredentialResolver;
	readonly provisioning: ProvisioningWiring;
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
 * Create a Node-compatible server with the full domain app + WebSocket support.
 *
 * Uses `@hono/node-server` (which runs under both Node and Bun via Node
 * compatibility shims). Replaces the previous Bun-native serve API.
 *
 * Reads the DB path from `DATABASE_URL` (falling back to `./hyperidle.db`),
 * builds a fresh `EventBus`, and wires them into `createApp`. The WebSocket
 * route is registered via the `registerWebSocket` hook on `AppOptions` so the
 * production boot path and integration tests share a single `createApp`.
 *
 * Pass port 0 for a random available port (useful in tests).
 *
 * @lore PGlite migration: production DB uses resolveProfile() to pick the
 * connection factory — `createPgliteDb` for laptop profile (embedded WASM
 * Postgres), `createPostgresDb` for vps/cloud (postgres-js). DATABASE_URL
 * env var overrides the profile default.
 *
 * @lore I1 S1-S5: the previous `createFullApp` factory mounted only
 * `/health`, `/api/health`, and `/api/ws` — every domain route returned 404
 * in production. Converging on `createApp` is the fix; any future divergence
 * would re-introduce the same bug.
 */
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
	let dbHandle: DbHandle | null = null;
	let db: HyperIdleDb;
	if (deps.db) {
		db = deps.db;
	} else {
		const profile = resolveProfile({ env: process.env });
		const rawDbUrl = process.env.DATABASE_URL ?? profile.dbUrlDefault;
		const dbUrl = profile.dbDriver === "pglite" ? resolvePglitePath(rawDbUrl) : rawDbUrl;
		if (profile.dbDriver === "pglite") {
			dbHandle = await createPgliteDb(dbUrl);
		} else {
			dbHandle = createPostgresDb(dbUrl);
		}
		db = dbHandle.db;
	}
	const eventBus = new EventBus();
	// AU9: reconciliation is awaited; runtime readiness means no recoverable intent
	// was left stranded by a previous process death.

	// AH1 §3: DbCredentialResolver is the sole production resolver.
	// @lore AH1 §3: EnvCredentialResolver is retained ONLY for tools/eval (CI-secret
	// env key, no DB). Production always uses DbCredentialResolver. The single-resolver
	// invariant is tested in server-factory.resolver.test.ts via
	// `handle.credentialResolver instanceof DbCredentialResolver` — the resolver is
	// exposed on ServerHandle so the test can assert the production wiring directly.
	// @lore AU20 Am4: getServerSecret removed from barrel (cipher-owns-key pattern).
	// Boot warning now checks env directly instead of calling getServerSecret().
	const hasSecret = Boolean(process.env.HYPERIDLE_CREDENTIAL_KEY ?? process.env.HYPERIDLE_API_KEY);
	if (!hasSecret) {
		// @lore AH1 §6: Boot is non-fatal but we log a warning so misconfigured deployments
		// are visible. The write boundary (PUT /api/credentials) rejects loudly (500
		// MISSING_ROOT_SECRET). console.warn is intentional here — the observability adapter
		// is not yet constructed at this point in the boot sequence.
		// biome-ignore lint/suspicious/noConsole: intentional boot-time warning before observability adapter is constructed
		console.warn(
			"[HyperIdle] No HYPERIDLE_CREDENTIAL_KEY/HYPERIDLE_API_KEY set — credential writes will be refused (MISSING_ROOT_SECRET). Agents cannot resolve keys until a secret is configured.",
		);
	}
	const credentialResolver: CredentialResolver = new DbCredentialResolver(db);

	// AH1 §4: Run the one-time credential migration at boot.
	// Relocates legacy server_config blob apiKeys → server_credentials.
	// Seeds anthropic_api_key from env if the DB slot is absent.
	// No-op when already migrated. Non-fatal: migration skips if no root secret.
	// @lore AU19 Increment 1h: `settings`' `SettingsCredentialCipher`/
	// `SettingsCredentialStore` ports (Mechanism C) wired here — both to
	// `@hyperidle/connections`' real exports now that `connections` has
	// migrated (closes the Inc-1f interim wiring; see `@hyperidle/settings`'
	// `ports.ts` top-level `@lore`), zero behavior change.
	// @lore AU20 Am4: cipher is now no-arg (encryptCredentialValue/decryptCredentialValue
	// read the root secret internally). Store adapts to the new collapsed write API:
	// writeCredential with encryptedValue present = upsert path.
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
	// AU2: Project existing first-party behavior into the editable configuration
	// model on production boot. This keeps registered tools, builtin harness
	// metadata, and legacy rows queryable through the new resolver without moving
	// runtime ownership away from existing services.
	// @lore AU19 Increment 1f/1i + Increment 5 item 4 (connections sub-item):
	// `settings`' `RoutineReader`/`SettingsUserDirectory`/
	// `ServiceConnectionsReader` ports (Mechanism C) wired here — `users` to
	// the real `@hyperidle/users` exports (already migrated), `routine` to
	// `@hyperidle/routine`'s real `listRoutines` export (closed Increment 1i —
	// no more interim `routine-service.ts` indirection), `serviceConnections`
	// to `@hyperidle/connections`' real `listServiceConnectionsByAuthSource`
	// export (closes the Increment 1h `ServiceConnectionsReader` interim —
	// see `@hyperidle/settings`' `ports.ts`). All ordinary downward
	// core-api→core-api edges, zero behavior change.
	// @lore AU20 Am4: listServiceConnectionsByAuthSource removed from barrel; adapt
	// to listConnections(db, { authSource }) to satisfy ServiceConnectionsReader port.
	// @lore AU26 E2/E4: `settings`' `ServiceConnectionsReader` is the SECOND
	// consumer of the connections record, and it is a display-only boot-time
	// projection (the MCP plugin seed) with no operational dependence — so the
	// port stays and only its implementation moved Layer, wired here by the
	// Application. It does not cost `service_connections` its "exactly one
	// Service importer" property: a port is a structural interface, not an
	// import, and `settings` never sees the table.
	await backfillConfigurationDefaults(db, {
		users: { listUsersByKind: (db, kind) => listUsers(db, { kind }) },
		routines: { listRoutines },
		serviceConnections: {
			listByAuthSource: (execDb, authSource) => listConnections(execDb, { authSource }),
		},
		// AU26 G1 (§D-L): the six run-config fields the projection carries now
		// live in `agent_run_config`; the Layer wires their owner's batched read.
		agentRunConfig: { readAgentRunConfigs },
	});
	// @lore AU19 Increment 5 (item 2): `adapterPool`/`workspaceAdapter` are now
	// REQUIRED, Application-supplied deps (see `CreateServerDeps`'s top `@lore`)
	// — this Layer no longer constructs a concrete `SandboxAdapter`/`AdapterPool`
	// itself, and no longer branches on `HYPERIDLE_PROFILE` at runtime. Which
	// concrete adapter to inject is each Application's own choice (`desktop`:
	// `LocalSandboxAdapter` + `createLocalAdapterPool()`; `remote-server`: an
	// empty pool + `DisabledSandboxAdapter` — see each package's bootstrap file).
	const { adapterPool, workspaceAdapter } = deps;
	const sandboxBasePath =
		deps.sandboxBasePath ??
		process.env.HYPERIDLE_WORKSPACES_DIR ??
		path.join(os.tmpdir(), "hyperidle-workspaces");

	// AO2: Build the production filesystem mounter. capturesDir lives alongside the
	// sandboxBasePath so captures survive server restarts.
	const capturesDir = path.join(sandboxBasePath, ".ao2-captures");
	fs.mkdirSync(capturesDir, { recursive: true });
	const mounter = new RegistryFilesystemMounter({
		gitRunnerFactory: (repoPath: string) => createGitRunner(repoPath),
		capturesDir,
		db,
	});

	// AU19 Increment 3f: register the capture-writeback subscriber — the
	// §10.3 line 517 EventBus inversion for `filesystems ⚠ capture-writeback`.
	// `@hyperidle/filesystems`' `file-watcher.ts` emits
	// `sandbox_writeback_changes_detected`; this subscriber drives
	// `processWriteback` off it. The `knowledge` port's `update` wraps the
	// real `@hyperidle/knowledge` `update()` (which THROWS `VersionConflictError`)
	// into the port's discriminated `CaptureWritebackUpdateResult` — the one
	// place both `@hyperidle/knowledge` and the port type are legally
	// importable together (see `@hyperidle/capture-writeback`'s `ports.ts`
	// top `@lore`).
	const writebackDeps: NonNullable<RuntimeDeps["composition"]["writeback"]> = {
		db,
		knowledge: {
			create: createKnowledgeItem,
			async update(execDb, id, patch, expectedVersion) {
				try {
					const item = await updateKnowledgeItem(execDb, id, patch, expectedVersion);
					return { ok: true, item };
				} catch (err) {
					if (err instanceof VersionConflictError) {
						return { ok: false, currentVersion: err.currentVersion };
					}
					throw err;
				}
			},
			recordConflict: recordWritebackConflict,
		},
	};

	// X2: Create the MCP bridge registry that maps session tokens to transport instances.
	const enforcementRegistry = createReturnEnforcement();
	const mcpBridgeRegistry = createMcpToolBridge({ enforcement: enforcementRegistry });
	const mcpBaseUrl = `http://localhost:${port}`;
	// @lore AU19 Increment 3c: `runtime` is built as its own variable (not an
	// inline literal in the `bootAgentLayer` call) so it type-checks against
	// `bootAgentLayer`'s Mechanism-C-narrowed `RunOrchestrationProvisionDeps`
	// (only `db`/`eventBus`/`onHarnessStarted` declared) without an excess-
	// property error — the extra fields (`adapterPool`, `workspace`, …) still
	// flow through unchanged at runtime, only assigned via a variable rather
	// than a fresh literal (TS excess-property-check applies to literals, not
	// variable references). See `run-orchestration`'s `ports.ts` top `@lore`.
	// @lore AU26 E3: `serviceConnectionResolver` was wired to
	// `credentialResolver` here — a `CredentialResolver`, whose `resolve(name)`
	// takes ONE argument. The provisioner calls `resolve(userId, connectionId)`,
	// so every held-connection lookup in production was really a
	// `server_credentials` lookup keyed by a user id, always missing, always
	// silently skipped: AN2 provisioning never actually provisioned anything. The
	// blanket `as ProvisionSessionDeps` on the deps literal is what hid the arity
	// mismatch from `tsc`.
	//
	// @lore AU26 review C1: the three provisioning ports are TYPED now
	// (`ProvisioningWiring`) instead of riding inside that cast, so the same
	// mis-wiring is a compile error — and they are exposed on `ServerHandle` so
	// `server-factory.provisioning-wiring.integration.test.ts` can assert the
	// production wiring is the real implementations against a real DB.
	const provisioning: ProvisioningWiring = {
		serviceConnectionResolver: new ServiceConnectionResolver(db),
		// @lore AU26 E3: the spawn-time held-connection read, live and
		// in-layer. Replaces AU21 K1's emit-time bake, so a connection added
		// between an intent's emit and its drain reaches the sandbox (AC1(c)).
		//
		// @lore AU26 review C2: scoped to ONE owning human. The owner is resolved
		// HERE, at the Application, and handed down — orchestration reads zero
		// core-api state, so it must never look `users` up itself (AU21 AC#2).
		// Resolved per call, not once at boot: the human row is created during
		// onboarding, long after this composition runs.
		heldConnections: {
			listHeldForProvisioning: async () => {
				const ownerUserId = await resolveProvisioningOwnerUserId(db);
				if (!ownerUserId) return [];
				return listHeldConnectionsForProvisioning(db, ownerUserId);
			},
		},
		// @lore AU26 F2: the spawn-time injected-filesystem read, live and
		// in-layer — the twin of `heldConnections` above. Replaces AU21 §9
		// Increment 12's emit-time bake, so a filesystem assigned to the agent
		// between an intent's emit and its drain is actually mounted.
		injectedFilesystems: {
			listInjectedForProvisioning: (agentId: string) =>
				listInjectedFilesystemsForProvisioning(db, agentId),
		},
	};
	const runtimeDeps = {
		db,
		eventBus,
		adapterPool,
		workspace: workspaceAdapter,
		mcpBridgeRegistry,
		mcpBaseUrl,
		...provisioning,
		mounter,
		// The cast is narrowed to what it always really meant: this literal is the
		// PARTIAL runtime slice `buildRunRuntimeDeps` deep-merges with the
		// production provisioner/context ports. It no longer erases the shape of
		// the provisioning ports — `provisioning` is checked before it is spread.
	} as ProvisionSessionDeps;
	const runRuntime = await startRuntime(
		buildRunRuntimeDeps(db, eventBus, {
			runtime: runtimeDeps,
			sandboxBasePath,
			resolveModel: makeResolveModel(db, credentialResolver),
			// The assistant flows through this same durable poller like every
			// other kind — no second execution entry.
			// runtimeDeps deep-merges this partial override with its production
			// context/provisioner ports; do not replace context with a fake object.
			composition: {
				writeback: writebackDeps,
				reapers: {
					sandboxes: { sandboxBasePath },
					routines: { staleAfterMs: DEFAULT_REAPER_STALE_AFTER_MS },
				},
			} as RuntimeDeps["composition"],
		}),
	);

	// Posting a message records the `assistant_turn` intent
	// (`routes/threads.ts`), and this same `startRuntime` poller (wired
	// above) drains it like every other kind's intent — one wiring path.
	let wsDispose: (() => void) | null = null;

	// @lore AU26 J3: the one-shot WS upgrade-token store is the Application's
	// now, because TWO sockets consume it — core-api's `/api/ws` and
	// `agent-orchestration`'s `/api/agent-orchestration/ws`. It is pure
	// in-memory infrastructure with no domain of its own; the Application
	// creating it is what lets the second Layer have a socket without importing
	// core-api. `POST /api/auth/ws-token` (core-api) still mints every token.
	const upgradeTokenStore = createUpgradeTokenStore();

	// AU21 §6 Decision L4 / §9 Increment 14d: the hub is built ONCE, here,
	// and shared between (a) the WS route wired below in `registerWebSocket` and
	// (b) every core-api route/service that pushes domain data directly
	// (`createThreadRoutes`'s per-thread + conversations-list pushes via
	// `wsHub`, `work-state-push-gateway.ts`'s task/bet forwarder) — one topic
	// space, one transport instance.
	//
	// @lore AU26 J3: this hub now carries core-api's OWN topics only
	// (`thread:<id>`, `conversations`, `work`). The `session:<id>` stream moved
	// to `agent-orchestration`'s own socket and its own hub, so the session
	// activity gateway is no longer wired to this one, and
	// `createDbSubscribeAuthorizer`'s deps bundle shrank from four edges to
	// one — `users`/`org`/`work` existed only to serve the session branch.
	const wsHub = new WsConnectionHub(
		createDbSubscribeAuthorizer(db, {
			conversation: { getThreadById: (db, id) => findThread(db, { id }) },
		}),
	);
	// The "work" topic forwarder: task_state_changed/bet_state_changed
	// already carry the changed data (`toState`), so a thin EventBus-driven
	// forwarder suffices — same shape as `session-activity-gateway.ts`'s (c)
	// concern, registered once here rather than per-request.
	const workStatePushGatewayDispose = registerWorkStatePushGateway(eventBus, wsHub);

	// @lore S2-F01: the worker WS route is registered BEFORE the auth middleware
	// so remote workers can authenticate via HYPERIDLE_WORKER_TOKEN on the query
	// string without a user API key. It rides `bootAgentOrchestration`'s
	// `registerPreAuthRoutes` now — the socket is `run-orchestration`'s, so the
	// hook belongs to that Layer's boot rather than to core-api's `AppOptions`.
	const agentOrchestration = bootAgentOrchestration({
		db,
		eventBus,
		// AU26 J3: the Layer serves its own `session:<id>` socket at
		// `/api/agent-orchestration/ws`. The Application supplies only the
		// runtime's upgrade adapter and the SHARED one-shot token store — the
		// same instance core's socket consumes, so `POST /api/auth/ws-token`
		// mints for both. Neither is a domain dependency, and no `broadcast`
		// sink is handed down any more: the session-activity gateway tees into
		// the Layer's own hub now.
		sessionStream: { upgradeWebSocket, upgradeTokens: upgradeTokenStore },
		// AU26 E4: `/api/connections`' inherited projection reads this pool's
		// cached descriptors. Same pool core-api already holds; the Layer only
		// gets the read.
		adapterPool,
		registerWorkerWebSocket: (apiRouter) => {
			runRuntime.registerWorkerWebSocket(apiRouter, upgradeWebSocket);
		},
	});

	const coreApi = await bootCoreApi({
		db,
		eventBus,
		wsHub,
		upgradeTokenStore,
		serviceBootstrap: (ctx) => {
			// AF6/AU1: production boots the routine scheduler at the default
			// 30s cadence. Runtime deps are present, so generic routine fires
			// enter through AgentSessionRequest instead of stub sessions.
			const readAlertPreferences = async () => {
				const cfg = await readServerConfig(db);
				return {
					blockerAlerts: cfg.notifications.blockerAlerts,
					reviewAlerts: cfg.notifications.reviewAlerts,
					quietHoursEnabled: cfg.notifications.quietHoursEnabled,
					quietHoursStart: cfg.notifications.quietHoursStart,
					quietHoursEnd: cfg.notifications.quietHoursEnd,
				};
			};
			// AF7 §1: feed the task dispatcher's injection seam. Without it the
			// dispatcher never registers and a ready task never gets a session
			// (Z8-004). The TaskDispatcherDeps fields already exist.
			const dispatcherDeps = {
				adapterPool,
				workspace: workspaceAdapter,
				sandboxBasePath,
				resolveModel: makeResolveModel(db, credentialResolver),
				mcpBridgeRegistry,
				mcpBaseUrl,
				// AO2: pass the production mounter so routine-dispatched sessions mount.
				mounter,
			};
			// AU11: two owners register independently — core domain services
			// (knowledge/notifications/policy/routine-scheduler) then agent-owned
			// services (builtin-routine handlers/dispatcher/reapers).
			return [
				...registerCoreDomainServices({ ...ctx, readAlertPreferences, dispatcherDeps }),
				...registerAgentLayerServices({ ...ctx, dispatcherDeps }),
			];
		},
		adapterPool,
		workspaceAdapter,
		sandboxBasePath,
		credentialResolver,
		mcpBridgeRegistry,
		mcpBaseUrl,
		// AO2: wire the production mounter so session-route and routine-route sessions mount.
		mounter,
		registerWebSocket: (apiRouter, tokenStore) => {
			// L1 step9 (Adv-C1): production WS subscribe must enforce participant
			// authz on `thread:<id>` topics — already baked into `wsHub` above.
			// @lore AU26 B1a: the session-activity gateway used to be registered
			// here too. It moved into `bootAgentOrchestration` — it is the owning
			// Layer's own live tee of `session_started`/`session_ended`/
			// `tool_call_recorded`.
			// @lore AU26 J3: and now so has the socket it tees onto. This one
			// carries core-api's own topics only; `agent-orchestration` registers
			// its `session:<id>` socket in its own `registerPreAuthRoutes`.
			wsDispose = registerWsRoute(apiRouter, tokenStore, upgradeWebSocket, wsHub);
		},
	});

	// ----- AU26 B1b (§D-B): the Application's own composition -----
	//
	// ONE Hono instance, ONE `/api` router, ONE listener. The middleware stack is
	// built by `core-api` (its auth reads `@hyperidle/users`) but APPLIED here,
	// and only then are BOTH Layer apps mounted behind it. That ordering is the
	// whole point: registration order is what puts a route in front of or behind
	// the auth middleware — `createAuthMiddleware` has no path allow-list.
	const app = new Hono();
	// Backward-compat: /health without auth, outside the /api tree.
	app.route("/", health);

	const api = new Hono();
	const stack = coreApi.middleware;
	api.use("*", stack.cors);
	api.onError(stack.errorHandler);
	// I2 R1-R5/R4: rate limit + body cap BEFORE auth, so an unauthenticated flood
	// is throttled without ever touching the database.
	api.use("*", stack.rateLimit);
	api.use("*", stack.bodyLimit);

	// Pre-auth: core-api's public health/setup/claim routes and the user WS
	// upgrade; then the OTHER Layer's own pre-auth routes (the worker WS upgrade
	// — workers authenticate with HYPERIDLE_WORKER_TOKEN on the query string).
	coreApi.registerPreAuthRoutes(api);
	agentOrchestration.registerPreAuthRoutes(api);
	// @lore X2: MCP route registered BEFORE auth middleware — MCP clients
	// authenticate via the 64-char hex session token in the URL, not X-API-Key.
	// AL6 CRIT-1: the bridge's router carries the enforcement registry so the
	// /return-status sub-path resolves token → sessionId → entry → forceMessage.
	api.route("/", mcpBridgeRegistry.router);

	// M3 A3 / AF11: auth, then the fail-closed boundary assertion. Everything
	// mounted after this line is authenticated — including the mounted Layer apps.
	api.use("*", stack.auth);
	api.use("*", stack.failClosed);

	// The two Layer apps, at the SAME prefix, at their unchanged path strings.
	api.route("/", coreApi.app);
	api.route("/", agentOrchestration.app);

	app.route("/api", api);

	// The ONLY `notFound` that fires for a mounted sub-app is the root's — see
	// this module's header. An unknown `/api/*` path must answer with the
	// canonical `ApiErrorResponse` JSON, never Hono's `text/plain` default (AC9).
	app.notFound((c) => {
		if (c.req.path.startsWith("/api")) {
			return c.json({ error: "Not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}
		return c.text("404 Not Found", 404);
	});

	// Both Layers' teardown rides the composed app's disposer bag, so a single
	// `disposeApp(app)` tears the whole composition down.
	registerAppDisposers(app, [...coreApi.disposers, agentOrchestration.dispose]);

	// AU21 §9 Increment 6 (Decision D): the in-process `AgentOrchestrationPort`
	// transport is registered against the COMPOSED app — its seam URLs are
	// `/api/agent-orchestration/...`, so it needs the instance that carries the
	// `/api` prefix, not either Layer's bare route table.
	registerAgentOrchestrationTransport(createInProcessAgentOrchestrationTransport(app));

	// AU21 §9 Increment 1: register the boot-time in-process CoreApiPort
	// transport — `tool-handlers-bindings.ts`'s `coreApi` accessor (currently
	// only `create_bet`) reads it via `getRegisteredCoreApiTransport()` on
	// every call. Colocated boot uses `app.fetch` directly; a split/remote
	// topology would register `createNetworkCoreApiTransport(baseUrl)`
	// instead — same call site, per architecture.md §6 Decision A.
	registerCoreApiTransport(createInProcessCoreApiTransport(app));

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

			await runPhase("run-runtime", () => runRuntime.dispose());
			await runPhase("app-domain", () => disposeApp(app));
			await runPhase("websocket", () => {
				const disposeWebSocket = wsDispose;
				wsDispose = null;
				disposeWebSocket?.();
				// @lore AU26 B1a: the session-activity gateway is torn down by the
				// `app-domain` phase above — `bootAgentOrchestration`'s `dispose`
				// rides `disposeApp`'s disposer bag, so the owning Layer's teardown
				// travels with the app it was mounted into.
				workStatePushGatewayDispose();
			});
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

	return { httpServer, dispose, credentialResolver, provisioning };
}
