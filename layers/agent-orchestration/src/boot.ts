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
 *     `session_ended` / `tool_call_recorded` onto the `session:<id>` WS topic;
 *   - **AU26 J3: the socket that topic is served on.** The `session:<id>` stream
 *     is wholly this Layer's now — its own `SessionStreamHub`, its own
 *     authorizer (an authenticated user + the run exists, read from this Layer's
 *     own `sessions` table), and its own route on the `/api` router. The
 *     Application no longer passes core-api's `WsConnectionHub` in as a
 *     broadcast sink; it passes only the runtime `upgradeWebSocket` adapter and
 *     the shared one-shot upgrade-token store, neither of which is a domain
 *     dependency. Core's socket keeps only core's own topics.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus, HarnessCapabilityReader } from "@hyperidle/shared";
import type { HyperIdleEnv } from "@hyperidle/shared/http";
import type { Hono } from "hono";
import type { UpgradeWebSocket } from "hono/ws";
import { createAgentOrchestrationApp } from "./app.js";
import {
	registerSessionStreamRoute,
	type SessionStreamTokenStore,
} from "./routes/session-stream-ws.js";
import { SessionActivityBuffer } from "./session-activity-buffer.js";
import { registerSessionActivityGateway } from "./services/session-activity-gateway.js";
import {
	createRunStreamSubscribeAuthorizer,
	SessionStreamHub,
} from "./services/session-stream-hub.js";

export interface AgentOrchestrationBootOptions {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	/**
	 * AU26 J3: what an Application must supply for the live-run socket to be
	 * reachable over HTTP — the runtime's WS upgrade adapter and the one-shot
	 * upgrade-token store (the SAME store core's socket consumes, so
	 * `POST /api/auth/ws-token` mints for both). Absent — a kernel-only or
	 * in-process test app — and no route is registered; the hub and the gateway
	 * still exist, so a test can drive `hub.subscribe`/`broadcast` directly.
	 */
	readonly sessionStream?: {
		readonly upgradeWebSocket: UpgradeWebSocket;
		readonly upgradeTokens: SessionStreamTokenStore;
	};
	/**
	 * The worker WebSocket upgrader. Registered on the `/api` router BEFORE the
	 * auth middleware: workers authenticate with `HYPERIDLE_WORKER_TOKEN` on the
	 * query string, not a user API key.
	 *
	 * @lore AU26 B1a: this used to be `AppOptions.registerWorkerWebSocket` on
	 * core-api's `createApp` — a core-api-shaped hook for an orchestration-owned
	 * socket. It rides this boot now, so core-api's app knows only that the other
	 * Layer has pre-auth routes, not what they are.
	 */
	readonly registerWorkerWebSocket?: (apiRouter: Hono) => void;
	/**
	 * AU26 E4: cached harness descriptors for `/api/connections`' inherited
	 * projection. The Application already holds the pool; this Layer only reads
	 * the cache off it.
	 */
	readonly adapterPool?: HarnessCapabilityReader;
}

export interface AgentOrchestrationBoot {
	/** Mounted by the Application on its `/api` router, AFTER the auth middleware. */
	readonly app: Hono<HyperIdleEnv>;
	/** Registered by the Application on its `/api` router, BEFORE the auth middleware. */
	readonly registerPreAuthRoutes: (apiRouter: Hono) => void;
	/**
	 * AU26 J3: this Layer's live-run topic space. Exposed so an in-process test
	 * can subscribe/broadcast without a socket; production reaches it only
	 * through the registered route and the activity gateway.
	 */
	readonly sessionStreamHub: SessionStreamHub;
	/** Stops the activity buffer, unsubscribes the gateway, drops WS adapters. */
	readonly dispose: () => void;
}

export function bootAgentOrchestration(
	options: AgentOrchestrationBootOptions,
): AgentOrchestrationBoot {
	const { db, eventBus, sessionStream, registerWorkerWebSocket, adapterPool } = options;

	const activityBuffer = new SessionActivityBuffer(eventBus);
	activityBuffer.start();

	const sessionStreamHub = new SessionStreamHub(createRunStreamSubscribeAuthorizer(db));
	const disposeGateway = registerSessionActivityGateway(eventBus, sessionStreamHub);
	let disposeSocket: () => void = () => {};

	const app = createAgentOrchestrationApp({
		db,
		eventBus,
		getRecentActivity: (sessionId) => activityBuffer.getActivity(sessionId),
		...(adapterPool ? { adapterPool } : {}),
	});

	return {
		app,
		sessionStreamHub,
		registerPreAuthRoutes: (apiRouter) => {
			registerWorkerWebSocket?.(apiRouter);
			if (sessionStream) {
				disposeSocket = registerSessionStreamRoute(
					apiRouter,
					sessionStream.upgradeTokens,
					sessionStream.upgradeWebSocket,
					sessionStreamHub,
				);
			}
		},
		dispose: () => {
			disposeSocket();
			disposeGateway();
			activityBuffer.stop();
		},
	};
}
