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
 *   - the `SessionActivityBuffer` (`@hyperidle/agent-execution`) — the buffer's
 *     one REST reader and its one gateway reader are both on this side now, so
 *     core-api has no reason to instantiate it;
 *   - the session-activity gateway, which tees `session_started` /
 *     `session_ended` / `tool_call_recorded` onto the `session:<id>` WS topic.
 *     The socket itself stays on core-api's hub (§D-E: its subscribe authorizer
 *     touches `threads` + `users` + `team_members` as well as `sessions`, a
 *     two-sided table set), so the Application injects the hub's one-method
 *     `{ broadcast }` surface here rather than this Layer owning a listener.
 */

import { SessionActivityBuffer } from "@hyperidle/agent-execution";
import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import type { HyperIdleEnv } from "@hyperidle/shared/http";
import type { Hono } from "hono";
import { createAgentOrchestrationApp } from "./app.js";
import {
	registerSessionActivityGateway,
	type SessionActivityBroadcastTarget,
} from "./services/session-activity-gateway.js";

export interface AgentOrchestrationBootOptions {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	/**
	 * The Application's WS broadcast sink (core-api's `WsConnectionHub`). When
	 * absent — a kernel-only or chrome test app — no gateway is registered and
	 * nothing else changes.
	 */
	readonly broadcast?: SessionActivityBroadcastTarget;
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
}

export interface AgentOrchestrationBoot {
	/** Mounted by the Application on its `/api` router, AFTER the auth middleware. */
	readonly app: Hono<HyperIdleEnv>;
	/** Registered by the Application on its `/api` router, BEFORE the auth middleware. */
	readonly registerPreAuthRoutes: (apiRouter: Hono) => void;
	/** Stops the activity buffer and unsubscribes the gateway. */
	readonly dispose: () => void;
}

export function bootAgentOrchestration(
	options: AgentOrchestrationBootOptions,
): AgentOrchestrationBoot {
	const { db, eventBus, broadcast, registerWorkerWebSocket } = options;

	const activityBuffer = new SessionActivityBuffer(eventBus);
	activityBuffer.start();

	const disposeGateway = broadcast
		? registerSessionActivityGateway(eventBus, broadcast)
		: (): void => {};

	const app = createAgentOrchestrationApp({
		db,
		eventBus,
		getRecentActivity: (sessionId) => activityBuffer.getActivity(sessionId),
	});

	return {
		app,
		registerPreAuthRoutes: (apiRouter) => {
			registerWorkerWebSocket?.(apiRouter);
		},
		dispose: () => {
			disposeGateway();
			activityBuffer.stop();
		},
	};
}
