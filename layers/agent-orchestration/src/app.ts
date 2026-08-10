/**
 * AU26 B1a (§D-B) — `agent-orchestration`'s own Hono app.
 *
 * The Layer that owns `sessions`, `explicit_session_starts`,
 * `agent_session_requests` and (AU26 E3) `service_connections` now serves their
 * HTTP surface itself. What it does
 * NOT do is own the middleware stack: cors / rate-limit / body-limit / auth /
 * fail-closed / `onError` / `notFound` are **Application-applied** to the `/api`
 * router both apps mount on. `createAuthMiddleware` legitimately reads
 * `@hyperidle/users` (a core-api Service), and only an Application may choose to
 * put another Layer's routes behind it — so this app declares boundaries with
 * `@hyperidle/http-middleware`'s `requireBoundary` and never imports core-api.
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

import { ServiceConnectionResolver } from "@hyperidle/connections";
import type { HyperIdleDb } from "@hyperidle/db";
import type { ActivityEntry } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import type { HarnessCapabilityReader } from "@hyperidle/harness-protocol";
import type { HyperIdleEnv } from "@hyperidle/http-middleware";
import { Hono } from "hono";
import { createAgentOrchestrationIntakeRoutes } from "./routes/agent-orchestration-intake.js";
import { createAgentOrchestrationSessionsRoutes } from "./routes/agent-orchestration-sessions.js";
import { createConnectionRoutes } from "./routes/connections.js";
import { createFilesystemRoutes } from "./routes/filesystems.js";
import { createOrchestrationSessionRoutes } from "./routes/sessions.js";

export interface AgentOrchestrationAppOptions {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	/** Reads the Layer's own `SessionActivityBuffer` — see `boot.ts`. */
	readonly getRecentActivity: (sessionId: string) => ReadonlyArray<ActivityEntry>;
	/**
	 * AU26 E4: cached harness descriptors, for `/connections`' inherited
	 * projection. Read-only and DB-free (`listCapabilityDescriptors()`), never a
	 * per-request probe. Absent → the inherited group is empty, exactly as it
	 * was when this route was core-hosted with no pool.
	 */
	readonly adapterPool?: HarnessCapabilityReader;
}

export function createAgentOrchestrationApp(
	options: AgentOrchestrationAppOptions,
): Hono<HyperIdleEnv> {
	const app = new Hono<HyperIdleEnv>();
	const { db, eventBus, getRecentActivity, adapterPool } = options;

	app.route("/sessions", createOrchestrationSessionRoutes(db, eventBus, getRecentActivity));
	app.route("/agent-orchestration", createAgentOrchestrationSessionsRoutes(db, getRecentActivity));
	// AU31 §3: the write side of `AgentOrchestrationPort`, mounted beside the
	// read routes above — same internal `/agent-orchestration` seam prefix.
	app.route("/agent-orchestration", createAgentOrchestrationIntakeRoutes(db, eventBus));
	// AU26 E4: `/api/connections` — the path is unchanged; only the host app is.
	app.route("/connections", createConnectionRoutes(db, adapterPool));
	// AU26 F2: `/api/filesystems` — same story. The reachability probe needs the
	// held-connection decrypt path, and `service_connections` is this Layer's own
	// table since E3, so the resolver is built HERE rather than handed down from
	// core-api's app the way it used to be.
	app.route("/filesystems", createFilesystemRoutes(db, new ServiceConnectionResolver(db)));

	return app;
}
