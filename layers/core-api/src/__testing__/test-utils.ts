import { appendFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import {
	type AgentOrchestrationBoot,
	bootAgentOrchestration,
} from "@hyperidle/agent-orchestration";
import type { HyperIdleDb } from "@hyperidle/db";
import { API_ERROR_CODES, EventBus } from "@hyperidle/shared";
import { Hono } from "hono";
import type { AppOptions } from "../app.js";
import { registerAppDisposers } from "../app.js";
import { bootCoreApi } from "../boot.js";
import { health } from "../routes/health.js";
import {
	createInProcessAgentOrchestrationTransport,
	registerAgentOrchestrationTransport,
} from "../services/agent-orchestration-port-composition.js";

const TRACE_FILE = process.env.VITEST_TRACE_FILE;

export interface TestAppOptions extends AppOptions {
	/**
	 * A pre-booted orchestration Layer. Omitted → this harness boots one itself
	 * (when a `db` is present), exactly as production does.
	 */
	agentOrchestration?: AgentOrchestrationBoot;
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
	const layerOptions: AppOptions = {
		...options,
		...(options?.db ? { eventBus } : {}),
	};
	const agentOrchestration =
		options?.agentOrchestration ??
		(options?.db ? bootAgentOrchestration({ db: options.db, eventBus }) : undefined);
	const coreApi = await bootCoreApi(layerOptions);

	const app = new Hono();
	app.route("/", health);

	const api = new Hono();
	const stack = coreApi.middleware;
	api.use("*", stack.cors);
	api.onError(stack.errorHandler);
	api.use("*", stack.rateLimit);
	api.use("*", stack.bodyLimit);
	coreApi.registerPreAuthRoutes(api);
	agentOrchestration?.registerPreAuthRoutes(api);
	options?.registerPreAuthRoutes?.(api);
	api.use("*", stack.auth);
	api.use("*", stack.failClosed);
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
	registerAgentOrchestrationTransport(createInProcessAgentOrchestrationTransport(app));

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

export interface TestAppWithDeps {
	app: Hono;
	db: HyperIdleDb;
	eventBus: EventBus;
}
