/**
 * `AgentOrchestrationPort`'s real backing routes — now hosted by the Layer that
 * owns the data.
 *
 * @lore AU26 B1a: relocated from `layers/core-api/src/routes/agent-
 * orchestration-sessions-routes.ts`. That file's header recorded the reason it
 * lived in core-api: *"this codebase has exactly ONE HTTP-serving Layer today —
 * core-api's own Hono `app`… giving `agent-orchestration` one here would force
 * it to import `@hyperidle/core-api` for the auth/boundary/rate-limit stack."*
 * B1a removes that premise on both halves — this Layer has its own app, and the
 * middleware stack is applied by the **Application** to the `/api` router both
 * apps mount on, so a route here sits behind the same auth without importing
 * core-api (`HyperIdleEnv` + `requireBoundary` come from `@hyperidle/http-middleware`).
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
import type { HyperIdleDb } from "@hyperidle/db";
import {
	type AgentRunActiveCountsResponse,
	type AgentRunLatestOutcomesResponse,
	type AgentRunsResponse,
	API_ERROR_CODES,
} from "@hyperidle/domain-model";
import { type HyperIdleEnv, requireBoundary } from "@hyperidle/http-middleware";
import {
	countActiveRunsByAgent,
	findSessionById,
	listLatestOutcomeByTask,
	listRunSummaries,
} from "@hyperidle/run-orchestration";
import type { Context } from "hono";
import { Hono } from "hono";

export function createAgentOrchestrationSessionsRoutes(db: HyperIdleDb): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// GET /agent-orchestration/sessions/:sessionId — backs
	// `AgentOrchestrationPort.sessions.getById`.
	//
	// @lore AU26 B1a (AC5(d)): returns the session's FULL public wire row,
	// not the seven-field narrowing the decoration reads use. The raw row
	// has 18 columns — a narrowing would silently drop 11 fields.
	router.get("/sessions/:sessionId", requireBoundary({ kind: "public-data" }), async (c) => {
		const row = await findSessionById(db, c.req.param("sessionId"));
		if (!row) {
			return c.json({ error: "Session not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}
		return c.json({ session: row satisfies AgentOrchestrationSessionWireRow });
	});

	// ---------------------------------------------------------------------
	// AU26 J4 — the run-state reads the UI calls DIRECTLY.
	//
	// Founder ruling (verbatim): *"its all for UI? thats why orchestration now
	// has an api so that the ui can get the agent run state from the
	// orchestration directly and combine this information in the ui instead of
	// in the core api service."* Core-api no longer decorates its responses with
	// run state; the bet view, the task view, the agent profile, the team page,
	// Settings → Agents and the recipient picker each fetch what they need from
	// here and combine it client-side.
	//
	// Deliberately NOT backed by new `AgentOrchestrationPort` methods — the port
	// is core-api's door into this Layer, and these reads have no core-api
	// caller left to walk through it.
	//
	// The existing `GET /api/sessions` list is NOT a substitute: it caps at
	// `limit=50` (`routes/sessions.ts`), and the agent-profile / team-roster
	// health window needs EVERY run of an agent. These reads carry no cap.
	// ---------------------------------------------------------------------

	// GET /agent-orchestration/runs/active-counts[?agent_ids=a,b,c]
	// Registered before `/runs` — Hono matches in registration order and the two
	// paths are distinct, but keeping the more specific one first is the safer
	// habit. Agents with zero active runs are absent from the map.
	router.get("/runs/active-counts", requireBoundary({ kind: "public-data" }), async (c) => {
		const agentIds = parseIdList(c.req.query("agent_ids"));
		if (agentIds !== undefined && agentIds.length === 0) {
			return c.json({ counts: {} });
		}
		if (agentIds !== undefined && agentIds.length > MAX_ID_LIST) {
			return tooManyIds(c, "agent_ids");
		}
		const counts = await countActiveRunsByAgent(db, agentIds);
		return c.json({ counts } satisfies AgentRunActiveCountsResponse);
	});

	// GET /agent-orchestration/runs/latest-outcomes?task_ids=a,b,c
	// The outcome of the NEWEST run per task by `startedAt`. A task with no run
	// is absent from the map (the UI renders that as `null`).
	router.get("/runs/latest-outcomes", requireBoundary({ kind: "public-data" }), async (c) => {
		const taskIds = parseIdList(c.req.query("task_ids"));
		if (taskIds === undefined) {
			return missingParam(c, "task_ids");
		}
		if (taskIds.length === 0) {
			return c.json({ outcomes: {} });
		}
		if (taskIds.length > MAX_ID_LIST) {
			return tooManyIds(c, "task_ids");
		}
		const outcomes = await listLatestOutcomeByTask(db, taskIds);
		return c.json({ outcomes } satisfies AgentRunLatestOutcomesResponse);
	});

	// GET /agent-orchestration/runs?task_id=…  |  ?agent_ids=a,b,c
	// Newest first in both forms.
	router.get("/runs", requireBoundary({ kind: "public-data" }), async (c) => {
		const taskId = c.req.query("task_id");
		const agentIds = parseIdList(c.req.query("agent_ids"));
		if (taskId === undefined && agentIds === undefined) {
			return missingParam(c, "task_id or agent_ids");
		}
		if (agentIds !== undefined && agentIds.length === 0) {
			return c.json({ runs: [] });
		}
		if (agentIds !== undefined && agentIds.length > MAX_ID_LIST) {
			return tooManyIds(c, "agent_ids");
		}
		const rows = await listRunSummaries(
			db,
			taskId !== undefined ? { taskId } : { agentIds: agentIds ?? [] },
		);
		return c.json({ runs: rows } satisfies AgentRunsResponse);
	});

	return router;
}

/**
 * Guard against an unbounded URL from a large roster. A team roster or a bet's
 * task list is far below this; anything above it is a caller doing something
 * else.
 */
const MAX_ID_LIST = 500;

/** `undefined` when the param is absent; `[]` when it is present but empty. */
function parseIdList(raw: string | undefined): string[] | undefined {
	if (raw === undefined) return undefined;
	return raw
		.split(",")
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
}

function missingParam(c: Context<HyperIdleEnv>, name: string): Response {
	return c.json({ error: `${name} is required`, code: API_ERROR_CODES.VALIDATION_ERROR }, 400);
}

function tooManyIds(c: Context<HyperIdleEnv>, name: string): Response {
	return c.json(
		{ error: `${name} exceeds ${MAX_ID_LIST} ids`, code: API_ERROR_CODES.VALIDATION_ERROR },
		400,
	);
}
