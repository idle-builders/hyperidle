/**
 * AU26 B1a (§D-B) — `agent-orchestration`'s own Hono app.
 *
 * The Layer that owns `sessions`, `explicit_session_starts`,
 * `agent_session_requests` and (AU26 E3) `service_connections` now serves their
 * HTTP surface itself. What it does
 * NOT do is own the middleware stack: cors / rate-limit / body-limit / auth /
 * fail-closed / `onError` / `notFound` are **Application-applied** to the `/api`
 * router both apps mount on. `createAuthMiddleware` legitimately reads
 * `@hyperidle/user` (a core-api Service), and only an Application may choose to
 * put another Layer's routes behind it — so this app never imports core-api.
 *
 * Mounted at `/` on the Application's `/api` router, so every path string here
 * keeps its byte-identical public URL (§D-A rule 7).
 *
 * @lore AU26 B1a: the parent's middleware, context vars and `onError` DO apply
 * to a mounted sub-app, but its `notFound` does NOT — only the root's fires
 * (verified on the installed `hono@4.12.30`, `.pipeline/work/AU26/probes/
 * two-app-mount/`). This app therefore deliberately registers no `notFound` of
 * its own: an unknown `/api/*` path must fall through to the root's canonical
 * JSON `ApiErrorResponse` 404, never Hono's `text/plain` default (AC10).
 */

import {
	decryptCredentialValue,
	encryptCredentialValue,
	type InheritedReach,
	resolveHeldToken,
} from "@hyperidle/connections";
import type { HyperIdleDb } from "@hyperidle/db";
import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
import type { EventBus } from "@hyperidle/event-bus";
import type { RegisteredTool } from "@hyperidle/harness-protocol";
import { createSessionActions, type SessionActionsDeps } from "@hyperidle/run-orchestration";
import { Hono } from "hono";
import type { Action } from "./actions/action.js";
import { actionsAsTools } from "./actions/actions-as-tools.js";
import { createActionsRouter } from "./actions/actions-router.js";
import { createAgentOrchestrationIntakeRoutes } from "./routes/agent-orchestration-intake.js";
import { createAgentOrchestrationSessionsRoutes } from "./routes/agent-orchestration-sessions.js";
import { createConnectionRoutes } from "./routes/connections.js";
import { createFilesystemRoutes } from "./routes/filesystems.js";

export interface AgentOrchestrationAppOptions {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	/**
	 * The session module's own deps bag (`services/
	 * run-orchestration-composition.ts`'s `buildSessionActionsDeps`), which is
	 * what `/sessions/:id/activity`'s old `getRecentActivity` reader moved
	 * onto (`watch_session`'s own `activity` field).
	 */
	readonly sessionActionsDeps: SessionActionsDeps;
	/**
	 * AU36 D7: the connections domain's own reach cache, for `/connections`'
	 * inherited projection. Read-only and DB-free (`list()`), never a
	 * per-request probe. Absent → the inherited group is empty, exactly as it
	 * was when this route read no pool (kernel-only/bare test apps).
	 */
	readonly inheritedReach?: InheritedReach;
}

export interface AgentOrchestrationAppHandle {
	readonly app: Hono<HyperIdleEnv>;
	/** This Layer's own three session actions, MCP-projected. `bootAgentOrchestration` exposes this as its own `actionTools`. */
	readonly actionTools: readonly RegisteredTool<HyperIdleDb>[];
}

export function createAgentOrchestrationApp(
	options: AgentOrchestrationAppOptions,
): AgentOrchestrationAppHandle {
	const app = new Hono<HyperIdleEnv>();
	const { db, eventBus, sessionActionsDeps, inheritedReach } = options;
	// @lore token-cipher: the AES-256-GCM cipher used to be threaded in from
	// core-api's boot (`@hyperidle/credentials`, a foreign layer's Service).
	// It moved into this Layer's own `@hyperidle/connections` package when
	// `server_credentials` was deleted and connection tokens became its only
	// production consumer, so this Layer now owns it directly — no injection.
	const cipher = { encrypt: encryptCredentialValue, decrypt: decryptCredentialValue };

	// The session module: search_sessions/watch_session/stop_session,
	// mounted at `POST /actions/<name>` on this Layer's own app and projected
	// onto the MCP tool seam. Both layer apps sit on one `/api` router
	// (`composeApiApplication`), so `POST /api/actions/stop_session` resolves
	// here while `POST /api/actions/edit_task` resolves on core's own mount.
	const sessionActions = createSessionActions(sessionActionsDeps) as readonly Action[];
	app.route("/actions", createActionsRouter(sessionActions, { db, eventBus }));
	const actionTools = actionsAsTools(sessionActions);

	app.route("/agent-orchestration", createAgentOrchestrationSessionsRoutes(db));
	// AU31 §3: the write side of `AgentOrchestrationPort`, mounted beside the
	// read routes above — same internal `/agent-orchestration` seam prefix.
	// BC5 §6 (T4): the `folders`/`connections` families reuse the SAME
	// `inheritedReach`/`cipher` the public `/connections` route below is
	// wired with — one reach cache, one cipher, never a second copy.
	app.route(
		"/agent-orchestration",
		createAgentOrchestrationIntakeRoutes(db, eventBus, { inheritedReach, cipher }),
	);
	// AU26 E4: `/api/connections` — the path is unchanged; only the host app is.
	app.route("/connections", createConnectionRoutes(db, inheritedReach, cipher));
	// AU26 F2: `/api/filesystems` — same story. The reachability probe needs the
	// held-connection decrypt path, and `service_connections` is this Layer's own
	// table since E3, so the resolver is wired via cipher.decrypt → resolveHeldToken.
	const fileSystemsResolver = {
		resolve: (userId: string, connectionId: string) =>
			resolveHeldToken(db, userId, connectionId, cipher.decrypt),
	};
	app.route("/filesystems", createFilesystemRoutes(db, fileSystemsResolver));

	return { app, actionTools };
}
