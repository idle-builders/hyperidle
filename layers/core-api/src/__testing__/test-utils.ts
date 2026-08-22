import { decryptCredentialValue, encryptCredentialValue } from "@hyperidle/credentials";
import { appendFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import {
	type AgentOrchestrationBoot,
	bootAgentOrchestration,
} from "@hyperidle/agent-orchestration";
import type { AgentOrchestrationTransport } from "@hyperidle/api-contract";
import { registerFixtureOrchestrationCleanup } from "@hyperidle/db/test-fixtures";
import { API_ERROR_CODES } from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import { Hono } from "hono";
import type { AppOptions } from "../app.js";
import { registerAppDisposers } from "../app.js";
import { bootCoreApi } from "../boot.js";
import { health } from "../routes/health.js";
import {
	buildAgentOrchestrationPort,
	createInProcessAgentOrchestrationTransport,
} from "../services/agent-orchestration-port-composition.js";

const TRACE_FILE = process.env.VITEST_TRACE_FILE;

export interface TestAppOptions extends AppOptions {
	/** Explicit API key captured by this test app; never read from ambient env after construction. */
	authApiKey?: string;
	/**
	 * A pre-booted orchestration Layer. Omitted → this harness boots one itself
	 * (when a `db` is present), exactly as production does.
	 *
	 * @lore AU31 §3.2: renamed from `agentOrchestration` (now `AppOptions`'s
	 * own field name for the SEAM'S PORT, a different thing entirely — the
	 * Layer boot handle vs. the port a caller dials it through) to avoid the
	 * collision.
	 */
	agentOrchestrationBoot?: AgentOrchestrationBoot;
	/**
	 * AU44 batch2: AES-256-GCM cipher injected into the agent-orchestration Layer
	 * for connection token encrypt/decrypt. Sourced from `@hyperidle/credentials`
	 * at the Application layer; absent → connections route rejects token writes.
	 */
	cipher?: {
		readonly encrypt: (plaintext: string) => string;
		readonly decrypt: (ciphertext: string) => string | null;
	};
	/**
	 * Mount extra routes on the `/api` router at the exact point production's
	 * Application mounts the MCP bridge: after both Layers' pre-auth
	 * registrations, BEFORE `stack.auth`.
	 *
	 * @lore AU26 B1b x AU27: this hook used to be `AppOptions.registerMcpRoute`,
	 * a core-api Layer option. Mounting is an APPLICATION decision, so the Layer
	 * shed it — `create-server.ts` routes the bridge itself. A test harness IS an
	 * Application, so the hook belongs here instead of being dropped: an MCP
	 * client authenticates with the 64-char hex session token in the URL, not
	 * X-API-Key, so the route must sit in front of the auth middleware exactly as
	 * it does in production.
	 */
	registerPreAuthRoutes?: (apiRouter: Hono) => void;
}

/**
 * Build the SAME two-app composition production boots, for a test.
 *
 * @lore AU26 B1b: a test harness IS an Application, and this is the second (and
 * last) composition site in the repo — `applications/remote-server/src/create-server.ts`
 * is the first. The two must stay in step: one Hono root, one `/api` router, the
 * core-api middleware stack applied by the Application, core-api's pre-auth
 * routes then orchestration's, then auth + fail-closed, then BOTH Layer apps
 * mounted at `/`. §D-C accepts this duplication explicitly: the real Application
 * duplication is two, not seven — the three `web/scripts/*-test-server.ts`
 * harnesses and `desktop` all go through `createServer`.
 *
 * @lore AU26 B1b (AC9): the canonical JSON 404 lives on the ROOT app. Hono does
 * not apply a parent's `notFound` to a mounted sub-app — only the root's fires.
 */
export async function createTestApp(options?: TestAppOptions): Promise<Hono> {
	const t0 = performance.now();
	// The two Layers MUST share one EventBus instance — the activity buffer and
	// the gateway subscribe to the same stream the core routes emit on.
	const eventBus = options?.eventBus ?? new EventBus();

	// AU31 §3.2 clause 4 — the construction cycle: the port's transport must
	// dial the COMPOSED app (the one carrying the `/api` prefix), which does
	// not exist until both Layers have booted and been mounted below. Closed
	// by a root-local binding, not a module variable: the arrow closes over
	// `composedApp`, filled once the composed app exists at the end of this
	// function. Any real HTTP call happens strictly after that (route
	// handlers only READ the port's methods when a request arrives, never at
	// construction time), so this is safe.
	let realTransport: AgentOrchestrationTransport | undefined;
	const transport: AgentOrchestrationTransport = async (req) => {
		if (!realTransport) {
			throw new Error(
				"AgentOrchestrationPort transport called before the composed app was built " +
					"(createTestApp's construction cycle is not yet closed).",
			);
		}
		return realTransport(req);
	};
	const agentOrchestrationPort = buildAgentOrchestrationPort(transport);

	// AU36 D4/D5: boot the orchestration Layer FIRST (when not pre-booted) so
	// its `inheritedReach.refresh` can be wired into core-api's
	// `onHarnessRedetect` — the same two-moment wiring the production
	// Applications build (no deferred binding needed here: unlike the
	// Applications, this composition site boots orchestration before
	// `bootCoreApi`).
	const agentOrchestration =
		options?.agentOrchestrationBoot ??
		(options?.db
			? await bootAgentOrchestration({
					db: options.db,
					eventBus,
					cipher: options.cipher ?? {
						encrypt: encryptCredentialValue,
						decrypt: decryptCredentialValue,
					},
				})
			: undefined);
	if (options?.db && agentOrchestration) {
		registerFixtureOrchestrationCleanup(options.db, () => {
			agentOrchestration.dispose();
			return agentOrchestration.joinLifecycleDrain();
		});
	}

	const layerOptions: TestAppOptions = {
		...options,
		agentOrchestration: agentOrchestrationPort,
		...(options?.db ? { eventBus } : {}),
		...(agentOrchestration
			? { onHarnessRedetect: () => agentOrchestration.inheritedReach.refresh() }
			: {}),
	};
	const coreApi = await bootCoreApi(layerOptions);

	const app = new Hono();
	app.route("/", health);

	const api = new Hono();
	const stack = coreApi.middleware;
	api.use("*", stack.cors);
	api.onError(stack.errorHandler);
	coreApi.registerPreAuthRoutes(api);
	agentOrchestration?.registerPreAuthRoutes(api);
	options?.registerPreAuthRoutes?.(api);
	api.use("*", stack.auth);
	api.route("/", coreApi.app);
	if (agentOrchestration) api.route("/", agentOrchestration.app);
	app.route("/api", api);

	app.notFound((c) => {
		if (c.req.path.startsWith("/api")) {
			return c.json({ error: "Not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}
		return c.text("404 Not Found", 404);
	});

	registerAppDisposers(app, [
		...coreApi.disposers,
		...(agentOrchestration ? [agentOrchestration.dispose] : []),
	]);
	// Close the construction cycle — every request from here on resolves.
	const inProcessTransport = createInProcessAgentOrchestrationTransport(app);
	realTransport = options?.authApiKey
		? async (request) => {
				const headers = new Headers(request.headers);
				headers.set("X-API-Key", options.authApiKey as string);
				return inProcessTransport(new Request(request, { headers }));
			}
		: inProcessTransport;

	if (TRACE_FILE) {
		const ms = Math.round((performance.now() - t0) * 10) / 10;
		try {
			appendFileSync(
				TRACE_FILE,
				`${JSON.stringify({ ts: Date.now(), pid: process.pid, event: "createTestApp", ms })}\n`,
			);
		} catch {}
	}
	return app;
}
