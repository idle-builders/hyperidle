import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootAgentOrchestration } from "@hyperidle/agent-orchestration";
import type { AgentOrchestrationPort, AgentOrchestrationTransport } from "@hyperidle/api-contract";
import type { HyperIdleDb } from "@hyperidle/db";
import {
	type DbFixtures,
	test as dbTest,
	registerFixtureOrchestrationCleanup,
} from "@hyperidle/db/test-fixtures";
import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
import { EventBus } from "@hyperidle/event-bus";
import type { Hono } from "hono";
import { buildCoreActions } from "../actions/compose.js";
import { disposeApp } from "../app.js";
import { buildAgentOrchestrationPort } from "../services/agent-orchestration-port-composition.js";
import type { SendMessageRunFn } from "../services/agent-run-admission-reactions.js";
import { registerAgentRunAdmissionReactions } from "../services/agent-run-admission-reactions.js";
import { registerTestRoutes } from "./test-routes.js";
import { createTestApp } from "./test-utils.js";

let nextFixtureAppId = 0;

/**
 * AU31 §3.2 clause 6 — the service-lane fixture's transport: dials
 * agent-orchestration's OWN bare app directly (never the composed core +
 * orchestration `/api` app with its middleware stack), so a reaction test
 * asserts a real effect on a real database through the real route, with no
 * `app` fixture needed. The part that bites: this app mounts its seam routes
 * at `/agent-orchestration/...` with NO `/api` prefix
 * (`layers/agent-orchestration/src/app.ts`) — the prefix is added only by the
 * application's `/api` router, and the port client always issues
 * `/api/agent-orchestration/...` (`SEAM_PLACEHOLDER_BASE_URL`). A transport
 * bound straight to the bare app therefore 404s unless the `/api` prefix is
 * stripped first — which is what this does. Deliberately skips the
 * middleware stack (auth, fail-closed) the production transport goes
 * through: this fixture transport proves the route's effect, not the door's
 * authentication.
 */
function createFixtureAgentOrchestrationTransport(
	app: Hono<HyperIdleEnv>,
): AgentOrchestrationTransport {
	return async (req: Request) => {
		const url = new URL(req.url);
		const strippedPath = url.pathname.replace(/^\/api/, "");
		const target = new URL(`${strippedPath}${url.search}`, url.origin);
		const hasBody = req.method !== "GET" && req.method !== "HEAD";
		const body = hasBody ? await req.text() : undefined;
		return app.fetch(new Request(target, { method: req.method, headers: req.headers, body }));
	};
}

export interface IntegrationFixtures extends DbFixtures {
	app: Hono;
	/** Send a request without the fixture's default API key for auth rejection tests. */
	requestWithoutAuth: Hono["request"];
	eventBus: EventBus;
	/**
	 * AU31 §3.2 — a real `AgentOrchestrationPort` over a throwaway
	 * `bootAgentOrchestration({db, eventBus})`, for any test that needs to call
	 * production code requiring the seam's port WITHOUT needing the full `app`
	 * fixture.
	 */
	agentOrchestration: AgentOrchestrationPort;
	/**
	 * BA9d D12: a per-test app instance with a temp `pluginsBaseDir` set,
	 * so `installPlugin` persists files to disk and skills can be restored.
	 * Use instead of `app` in tests that need to exercise the restore route.
	 */
	pluginsApp: Hono;
}

export function withoutServiceTestAuth(
	transport: (request: Request) => Response | Promise<Response>,
): (request: Request) => Promise<Response> {
	return (request) => {
		const headers = new Headers(request.headers);
		headers.set("X-HyperIdle-Test-Without-Auth", "true");
		return Promise.resolve(transport(new Request(request, { headers })));
	};
}

export async function createServiceTestApp(
	db: HyperIdleDb,
	eventBus: EventBus,
	pluginsBaseDir?: string,
): Promise<{ app: Hono; authApiKey: string }> {
	const authApiKey = `hyperidle-service-test-${++nextFixtureAppId}`;
	const app = await createTestApp({
		db,
		eventBus,
		authApiKey,
		registerExtraRoutes: registerTestRoutes,
		pluginsBaseDir,
	});
	const rawFetch = app.fetch.bind(app);
	// @lore The shared service fixture owns authentication explicitly. Its app
	// must remain valid when another isolate:false file changes process.env.
	app.fetch = (request, env, executionCtx) => {
		const headers = new Headers(request.headers);
		const omitDefaultAuth = headers.has("X-HyperIdle-Test-Without-Auth");
		headers.delete("X-HyperIdle-Test-Without-Auth");
		if (!omitDefaultAuth) headers.set("X-API-Key", authApiKey);
		return rawFetch(new Request(request, { headers }), env, executionCtx);
	};
	return { app, authApiKey };
}

export const test = dbTest.extend<Omit<IntegrationFixtures, keyof DbFixtures>>({
	// @lore AU21 Increment 3 Wave 0: core-api's `agent_run_admission_failed`
	// reactions are wired here. Production wires the SAME registration inside
	// `registerCoreDomainServices` (`server-factory.ts`), reached only via
	// `createServer`'s `serviceBootstrap` — the plain `createApp` this
	// fixture's `app` below builds does NOT invoke that bootstrap, so wiring
	// it here (rather than requiring every test to call
	// `registerAgentRunAdmissionReactions` by hand) is what lets a bare `{ db, eventBus }` test observe the real
	// reaction without booting the whole app. `registerAgentRunAdmissionReactions`'s
	// per-eventBus-instance idempotency guard means this is still safe even if
	// a future change makes `createServer`'s boot path reachable from a test
	// sharing the same eventBus instance.
	//
	// @lore BC3 architecture.md §5 B5: the assistant-thread pin reaction and
	// the B‴ coherence re-bake trigger are DELETED — the wake rule
	// (`@hyperidle/thread`'s `agentsToWake`) replaces both.
	//
	// @lore AU31 §3.2 clause 6: this fixture builds its OWN `AgentOrchestrationPort`
	// over a throwaway `bootAgentOrchestration({db, eventBus})` — the seam's
	// backing surface only, never the composed core+orchestration `/api` app —
	// so a reaction test asserts a real effect through the real route without
	// needing an `app` fixture. This is what makes wave A's reaction lane
	// testable at all: the module-level transport singleton it replaces could
	// not be reached from a bare `{db, eventBus}` fixture (a reaction test
	// requesting no `app` would resolve some OTHER test's stale registration,
	// or throw).
	eventBus: async ({ db }, use) => {
		const eventBus = new EventBus();
		const orchestrationBoot = await bootAgentOrchestration({
			db,
			eventBus,
		});
		registerFixtureOrchestrationCleanup(db, () => {
			orchestrationBoot.dispose();
			return orchestrationBoot.joinLifecycleDrain();
		});
		const agentOrchestration: AgentOrchestrationPort = buildAgentOrchestrationPort(
			createFixtureAgentOrchestrationTransport(orchestrationBoot.app),
		);
		// The never-silent-net reaction posts through send_message — this
		// fixture's own throwaway action bag, same shape
		// `service-bootstrap.integration.test.ts` builds.
		const fixtureActions = buildCoreActions({
			agentOrchestration,
			agentWorkIntentRecorder: async () => ({ id: "noop", idempotencyKey: "noop" }),
			reviewVerdictRecorder: async () => ({ status: "not_a_review_session" }),
		});
		const sendMessageAction = fixtureActions.find((a) => a.declaration.name === "send_message");
		if (!sendMessageAction) {
			throw new Error("buildCoreActions did not produce send_message");
		}
		const unregister = registerAgentRunAdmissionReactions(db, eventBus, {
			sendMessage: sendMessageAction.run as SendMessageRunFn,
		});
		await use(eventBus);
		unregister();
		orchestrationBoot.dispose();
	},
	// AU31 §3.2 — an independent throwaway boot (not shared with the
	// `eventBus` fixture's own): cheap wiring, no I/O, and keeps this fixture
	// usable whether or not a test also requests `eventBus`/`app`.
	agentOrchestration: async ({ db, eventBus }, use) => {
		const orchestrationBoot = await bootAgentOrchestration({
			db,
			eventBus,
		});
		registerFixtureOrchestrationCleanup(db, () => {
			orchestrationBoot.dispose();
			return orchestrationBoot.joinLifecycleDrain();
		});
		const port = buildAgentOrchestrationPort(
			createFixtureAgentOrchestrationTransport(orchestrationBoot.app),
		);
		await use(port);
		orchestrationBoot.dispose();
	},
	// @lore AU26 B1b: the fixture is an Application — it delegates to
	// `createTestApp`, the single test-harness composition site, which boots BOTH
	// Layers, applies the middleware stack and mounts both apps on one `/api`
	// router exactly as `remote-server`'s `createServer` does. Without the second
	// Layer the four `/api/sessions` routes that moved onto agent-orchestration's
	// app would 404 for every fixture-based test. Both Layers' teardown rides
	// `disposeApp`'s bag.
	app: async ({ db, eventBus }, use) => {
		// @lore AU28: the middleware-exercising routes (/protected-test, /test-validate,
		// /test-error) are mounted from here — the development world registering into
		// production. `app.ts` no longer imports them.
		const { app } = await createServiceTestApp(db, eventBus);
		await use(app);
		disposeApp(app);
	},
	requestWithoutAuth: async ({ app }, use) => {
		await use((input, requestInit, env, executionCtx) => {
			const headers = new Headers(requestInit?.headers);
			headers.set("X-HyperIdle-Test-Without-Auth", "true");
			return app.request(input, { ...requestInit, headers }, env, executionCtx);
		});
	},
	// @lore BA9d D12: per-test app with a temp pluginsBaseDir so install_path
	// is recorded and skill restore (route /contributions/restore, kind=skill)
	// can re-read from disk. Not shared across the worker: each test gets its
	// own temp dir so concurrent tests don't collide on file paths.
	pluginsApp: async ({ db, eventBus }, use) => {
		const pluginsBaseDir = join(
			tmpdir(),
			`plugins-fixture-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);
		mkdirSync(pluginsBaseDir, { recursive: true });
		const { app } = await createServiceTestApp(db, eventBus, pluginsBaseDir);
		await use(app);
		disposeApp(app);
		try {
			rmSync(pluginsBaseDir, { recursive: true, force: true });
		} catch {}
	},
});

export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
