// `AgentOrchestrationPort.sessions.getById` backing route, hosted by the layer that owns the data.
// Read-only: only GET is registered; root app's notFound handles other methods.

import type { AgentOrchestrationSessionWireRow } from "@hyperidle/api-contract";
import type { HyperIdleDb } from "@hyperidle/db";
import { API_ERROR_CODES } from "@hyperidle/domain-model";
import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
import { findSessionById } from "@hyperidle/run-orchestration";
import { Hono } from "hono";

export function createAgentOrchestrationSessionsRoutes(db: HyperIdleDb): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// GET /agent-orchestration/sessions/:sessionId — backs `AgentOrchestrationPort.sessions.getById`.
	// @lore: session GET — returns full wire row; a field-narrowing would silently drop columns
	router.get("/sessions/:sessionId", async (c) => {
		const row = await findSessionById(db, c.req.param("sessionId"));
		if (!row) {
			return c.json({ error: "Session not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
		}
		return c.json({ session: row satisfies AgentOrchestrationSessionWireRow });
	});

	return router;
}
