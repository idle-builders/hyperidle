/**
 * AU26 B1a (§D-B) — `agent-orchestration`'s own Hono app.
 *
 * The Layer that owns `sessions`, `explicit_session_starts` and
 * `agent_session_requests` now serves their HTTP surface itself. What it does
 * NOT do is own the middleware stack: cors / rate-limit / body-limit / auth /
 * fail-closed / `onError` / `notFound` are **Application-applied** to the `/api`
 * router both apps mount on. `createAuthMiddleware` legitimately reads
 * `@hyperidle/users` (a core-api Service), and only an Application may choose to
 * put another Layer's routes behind it — so this app declares boundaries with
 * `@hyperidle/shared/http`'s `requireBoundary` and never imports core-api.
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

import type { HyperIdleDb } from "@hyperidle/db";
import type { ActivityEntry, EventBus } from "@hyperidle/shared";
import type { HyperIdleEnv } from "@hyperidle/shared/http";
import { Hono } from "hono";
import { createAgentOrchestrationSessionsRoutes } from "./routes/agent-orchestration-sessions.js";
import { createOrchestrationSessionRoutes } from "./routes/sessions.js";

export interface AgentOrchestrationAppOptions {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	/** Reads the Layer's own `SessionActivityBuffer` — see `boot.ts`. */
	readonly getRecentActivity: (sessionId: string) => ReadonlyArray<ActivityEntry>;
}

export function createAgentOrchestrationApp(
	options: AgentOrchestrationAppOptions,
): Hono<HyperIdleEnv> {
	const app = new Hono<HyperIdleEnv>();
	const { db, eventBus, getRecentActivity } = options;

	app.route("/sessions", createOrchestrationSessionRoutes(db, eventBus, getRecentActivity));
	app.route("/agent-orchestration", createAgentOrchestrationSessionsRoutes(db, getRecentActivity));

	return app;
}
