/**
 * AU21 §9 Increment 6 (Decision D) — the REAL backing route for
 * `AgentOrchestrationPort`'s two read methods.
 *
 * CONFUSION resolved (see `agent-orchestration-port.integration.test.ts`'s
 * header for the full reasoning): `architecture.md` names
 * `AgentOrchestrationPort` "agent-orchestration's own read door", but this
 * codebase has exactly ONE HTTP-serving Layer today — core-api's own Hono
 * `app`. No `agent-orchestration` package hosts its own listener, and giving
 * it one here would force `agent-orchestration` to import `@hyperidle/
 * core-api` for the auth/boundary/rate-limit stack, inverting the strict
 * downward-dependency rule this whole work package protects. This route
 * therefore lives in core-api and is mounted at `/api/agent-orchestration`
 * beside every other domain route, behind the SAME auth stack — but its
 * handlers call `@hyperidle/session-requests`'s own exported query functions
 * directly (`getSessionCostBySessionId`, `listSessionRequests`), the
 * sanctioned against-grain `core-api → agent-orchestration` DI read
 * (architecture.md §1's "small set of permanent DI ports"), never the
 * ungoverned opposite direction this WP exists to close. The "door" name
 * reflects who OWNS the data and resolves the query, not literal HTTP
 * hosting — `AgentOrchestrationPort` still delivers real location
 * transparency (a hand-typed contract + a swappable transport + a tested
 * fidelity obligation, same as `CoreApiPort`); only the transport's physical
 * destination would change if agent-orchestration were ever split out.
 *
 * @lore AU21 Increment 14a: this file used to also back
 * `getSessionCostBySessionId` (a per-session cost read door, Increment 6's
 * cost surface) — deleted along with the rest of the cost feature, no
 * replacement.
 *
 * STRICTLY READ-ONLY (§12): only GET handlers are registered at either path.
 * No POST/PATCH/PUT/DELETE handler exists — Hono's own `api.notFound`
 * answers any of those with 404 (proven by
 * `agent-orchestration-port-readonly.integration.test.ts`), not a bespoke
 * method-not-allowed guard.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { listSessionRequests } from "@hyperidle/session-requests";
import {
	type ActivityEntry,
	AGENT_SESSION_SOURCE_KINDS,
	type AgentSessionSourceKind,
	API_ERROR_CODES,
} from "@hyperidle/shared";
import { type HyperIdleEnv, requireBoundary } from "@hyperidle/shared/http";
import { Hono } from "hono";

function isAgentSessionSourceKind(value: string): value is AgentSessionSourceKind {
	return (AGENT_SESSION_SOURCE_KINDS as readonly string[]).includes(value);
}

/**
 * @param getRecentActivity - AU21 §9 Increment 7 (Decision E): reads the
 *   relocated `SessionActivityBuffer` (`@hyperidle/agent-execution`) the
 *   Application composition root (`app.ts`) owns and starts — an in-process
 *   call, the same shape as this file's existing direct calls into
 *   `@hyperidle/session-requests`'s query functions. No DB-existence check
 *   here (mirrors the buffer's own `unknown session → []` semantics); the
 *   REST consumer (`sessions-routes.ts`) keeps its own 404 check.
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

	// GET /agent-orchestration/sessions/:sessionId/activity — backs
	// `AgentOrchestrationPort.sessions.getRecentActivity` (§9 Increment 7,
	// Decision E). Unknown sessionId resolves an empty array, mirroring the
	// relocated buffer's own semantics — no DB lookup here.
	router.get("/sessions/:sessionId/activity", requireBoundary({ kind: "public-data" }), (c) => {
		const sessionId = c.req.param("sessionId");
		return c.json({ entries: getRecentActivity(sessionId) });
	});

	return router;
}
