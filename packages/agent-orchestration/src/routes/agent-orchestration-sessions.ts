/**
 * `AgentOrchestrationPort`'s real backing routes — now hosted by the Layer that
 * owns the data.
 *
 * @lore AU26 B1a: relocated from `packages/core-api/src/routes/agent-
 * orchestration-sessions-routes.ts`. That file's header recorded the reason it
 * lived in core-api: *"this codebase has exactly ONE HTTP-serving Layer today —
 * core-api's own Hono `app`… giving `agent-orchestration` one here would force
 * it to import `@hyperidle/core-api` for the auth/boundary/rate-limit stack."*
 * B1a removes that premise on both halves — this Layer has its own app, and the
 * middleware stack is applied by the **Application** to the `/api` router both
 * apps mount on, so a route here sits behind the same auth without importing
 * core-api (`HyperIdleEnv` + `requireBoundary` come from `@hyperidle/shared/http`).
 * The "door" is now literal: the data, the query and the HTTP host are all on
 * the owning side.
 *
 * STRICTLY READ-ONLY (§12): only GET handlers are registered. No POST/PATCH/
 * PUT/DELETE handler exists — the root app's `notFound` answers any of those
 * with the canonical JSON 404 (proven by
 * `agent-orchestration-port-readonly.integration.test.ts`), not a bespoke
 * method-not-allowed guard.
 */

import type { AgentOrchestrationSessionWireRow } from "@hyperidle/api-contract";
import { type HyperIdleDb, sessions } from "@hyperidle/db";
import { listSessionRequests } from "@hyperidle/session-requests";
import {
	type ActivityEntry,
	AGENT_SESSION_SOURCE_KINDS,
	type AgentSessionSourceKind,
	API_ERROR_CODES,
} from "@hyperidle/shared";
import { type HyperIdleEnv, requireBoundary } from "@hyperidle/shared/http";
import { eq } from "drizzle-orm";
import { Hono } from "hono";

function isAgentSessionSourceKind(value: string): value is AgentSessionSourceKind {
	return (AGENT_SESSION_SOURCE_KINDS as readonly string[]).includes(value);
}

/**
 * @param getRecentActivity - reads the `SessionActivityBuffer`
 *   (`@hyperidle/agent-execution`) this Layer's own boot owns and starts — an
 *   in-process call, the same shape as this file's direct calls into
 *   `@hyperidle/session-requests`' query functions. No DB-existence check here
 *   (mirrors the buffer's own `unknown session → []` semantics); the REST
 *   consumer (`routes/sessions.ts`'s `GET /:id/activity`) keeps its own 404.
 */
export function createAgentOrchestrationSessionsRoutes(
	db: HyperIdleDb,
	getRecentActivity: (sessionId: string) => ReadonlyArray<ActivityEntry>,
): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// GET /agent-orchestration/sessions?sourceKind=&sourceId= — backs
	// `AgentOrchestrationPort.sessions.listSessionHistoryBySource`.
	router.get("/sessions", requireBoundary({ kind: "public-data" }), async (c) => {
		const sourceKind = c.req.query("sourceKind");
		const sourceId = c.req.query("sourceId");
		if (!(sourceKind && sourceId)) {
			return c.json(
				{ error: "sourceKind and sourceId are required", code: API_ERROR_CODES.VALIDATION_ERROR },
				400,
			);
		}
		if (!isAgentSessionSourceKind(sourceKind)) {
			return c.json(
				{ error: `Unknown sourceKind: ${sourceKind}`, code: API_ERROR_CODES.VALIDATION_ERROR },
				400,
			);
		}
		const rows = await listSessionRequests(db, { source: { kind: sourceKind, id: sourceId } });
		return c.json({
			entries: rows.map((row) => ({
				id: row.id,
				sessionId: row.sessionId,
				status: row.status,
			})),
		});
	});

	// GET /agent-orchestration/sessions/:sessionId — backs
	// `AgentOrchestrationPort.sessions.getById`, the door core-hosted
	// `POST /api/sessions` reads its admitted session row through (§D-A's `sessions-routes.ts` split).
	//
	// @lore AU26 B1a (AC5(d)): this returns the session's FULL public wire row,
	// not the seven-field narrowing the decoration reads use. The 202 branch of
	// `POST /api/sessions` returns whatever this yields verbatim, and the raw row
	// has 18 columns — a narrowing here would silently drop 11 fields from a
	// shipped response with no route test catching it.
	router.get("/sessions/:sessionId", requireBoundary({ kind: "public-data" }), async (c) => {
		const [row] = await db
			.select()
			.from(sessions)
			.where(eq(sessions.id, c.req.param("sessionId")))
			.limit(1);
		if (!row) {
			return c.json({ error: "Session not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}
		return c.json({ session: row satisfies AgentOrchestrationSessionWireRow });
	});

	// GET /agent-orchestration/sessions/:sessionId/activity — backs
	// `AgentOrchestrationPort.sessions.getRecentActivity`. Unknown sessionId
	// resolves an empty array, mirroring the buffer's own semantics.
	router.get("/sessions/:sessionId/activity", requireBoundary({ kind: "public-data" }), (c) => {
		const sessionId = c.req.param("sessionId");
		return c.json({ entries: getRecentActivity(sessionId) });
	});

	return router;
}
