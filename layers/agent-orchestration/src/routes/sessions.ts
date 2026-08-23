/**
 * AU26 B1a (§D-A's `sessions-routes.ts` split) — the four `/api/sessions` registrations that moved off
 * core-api's app onto agent-orchestration's own.
 *
 * `GET /`, `GET /starts/:startId`, `GET /:id/activity` and `PATCH /:id` all
 * touch only tables this Layer owns (`sessions`, `explicit_session_starts`,
 * `agent_session_requests`) plus the in-process run registry and the relocated
 * activity buffer, so §D-A rule 2 puts them here. **`POST /api/sessions` did
 * NOT move** — its handler gates on `tasks` and bakes `users`/`server_config`,
 * a two-sided table set, and §D-A rule 3 gives a two-sided route exactly one
 * legal host (core-api). It stays in `core-api/src/routes/sessions-routes.ts`.
 *
 * **The path strings are unchanged** (§D-A rule 7): both apps mount on the same
 * `/api` router, so a route changes host app while keeping its URL byte-
 * identical — which is what makes AU26's "zero `layers/core-ui` diff" reachable.
 * The cost is that a duplicate `method + path` across the two apps would
 * resolve silently by registration order; AC10's route-table collision
 * assertion closes it (`two-app-mount-session-routes.integration.test.ts`).
 *
 * @lore AU26 B1a: `GET /:id/activity` DROPS the `AgentOrchestrationPort`
 * indirection it carried in core-api (`sessions-routes.ts:536-539` at HEAD).
 * The buffer is in-layer for orchestration, so the port hop was pure overhead
 * once the route landed on the owning side. The response shape is unchanged —
 * `useSessionActivity.test.tsx` stays green.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { HyperIdleEnv } from "@hyperidle/domain-model";
import { type ActivityEntry, API_ERROR_CODES } from "@hyperidle/domain-model";
import { findSessionById, listSessions } from "@hyperidle/run-orchestration";
import { Hono } from "hono";

/**
 * The four moved `/api/sessions` registrations, on agent-orchestration's app.
 *
 * @param getRecentActivity - reads the `SessionActivityBuffer` this Layer's own
 *   boot owns and starts (`boot.ts`). In-layer, so no port hop.
 */
export function createOrchestrationSessionRoutes(
	db: HyperIdleDb,
	getRecentActivity: (sessionId: string) => ReadonlyArray<ActivityEntry>,
): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// GET / — List sessions with optional filtering by task_id, state.
	// @lore I6: replaces the bounded resource descriptor with actual filtering.
	// @lore AU44 batch6: agentId filter and limit/offset paging dropped — no
	// production caller uses them. The Conversations page queries task_id+state.
	router.get("/", async (c) => {
		const taskId = c.req.query("task_id");
		const state = c.req.query("state");

		return c.json(
			await listSessions(db, {
				...(taskId ? { taskId } : {}),
				...(state ? { state } : {}),
			}),
		);
	});

	// GET /:id/activity — Session activity stream (Q1 §3.2). Session metadata +
	// recent activity entries, capped at the 50 most recent to bound the response.
	router.get("/:id/activity", async (c) => {
		const sessionId = c.req.param("id");
		const session = await findSessionById(db, sessionId);
		if (!session) {
			return c.json({ error: "Session not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}

		const activity = getRecentActivity(sessionId).slice(-50);

		return c.json({
			session: {
				id: session.id,
				agentId: session.agentId,
				taskId: session.taskId,
				state: session.state,
				startedAt: session.startedAt,
				modelTier: session.modelTier,
			},
			activity,
		});
	});

	return router;
}
