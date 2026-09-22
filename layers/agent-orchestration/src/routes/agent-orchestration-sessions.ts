/**
 * `AgentOrchestrationPort.sessions.getById`'s real backing route — hosted by
 * the Layer that owns the data.
 *
 * @lore AU26 B1a: relocated from `layers/core-api/src/routes/agent-
 * orchestration-sessions-routes.ts`. That file's header recorded the reason it
 * lived in core-api: *"this codebase has exactly ONE HTTP-serving Layer today —
 * core-api's own Hono `app`… giving `agent-orchestration` one here would force
 * it to import `@hyperidle/core-api` for the auth/boundary/rate-limit stack."*
 * B1a removes that premise on both halves — this Layer has its own app, and the
 * middleware stack is applied by the **Application** to the `/api` router both
 * apps mount on, so a route here sits behind the same auth without importing
 * core-api (`HyperIdleEnv` + `` come from `@hyperidle/domain-model`).
 * The "door" is now literal: the data, the query and the HTTP host are all on
 * the owning side.
 *
 * STRICTLY READ-ONLY: only a GET handler is registered. No POST/PATCH/
 * PUT/DELETE handler exists — the root app's `notFound` answers any of those
 * with the canonical JSON 404, not a bespoke method-not-allowed guard.
 *
 * @lore BC6 architecture.md §0.2/§8: the run-state reads this file used to
 * also carry (`GET /runs`, `GET /runs/active-counts`, AU26 J4's "the UI reads
 * run state directly") are DELETED — `search_sessions` is the door now,
 * `POST /api/actions/search_sessions`, same for a person and an agent. This
 * route survives ALONE because it has a live core-api caller (`port.sessions.
 * getById`, `routine-scheduler-bindings.ts`), and core may not call an
 * orchestration action.
 */

import type { AgentOrchestrationSessionWireRow } from "@hyperidle/api-contract";
import type { HyperIdleDb } from "@hyperidle/db";
import { API_ERROR_CODES } from "@hyperidle/domain-model";
import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
import { findSessionById } from "@hyperidle/run-orchestration";
import { Hono } from "hono";

export function createAgentOrchestrationSessionsRoutes(db: HyperIdleDb): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// GET /agent-orchestration/sessions/:sessionId — backs
	// `AgentOrchestrationPort.sessions.getById`.
	//
	// @lore AU26 B1a (AC5(d)): returns the session's FULL public wire row,
	// not the seven-field narrowing the decoration reads use. The raw row
	// has 18 columns — a narrowing would silently drop 11 fields.
	router.get("/sessions/:sessionId", async (c) => {
		const row = await findSessionById(db, c.req.param("sessionId"));
		if (!row) {
			return c.json({ error: "Session not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}
		return c.json({ session: row satisfies AgentOrchestrationSessionWireRow });
	});

	return router;
}
