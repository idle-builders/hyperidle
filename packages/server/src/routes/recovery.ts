/**
 * L7 — Recovery routes. Mounts:
 *   - `POST /api/factory/pause`      — kill switch (factory-wide)
 *   - `POST /api/factory/resume`     — clears the paused state
 *   - `GET  /api/factory/state`      — snapshot of the singleton row
 *   - `POST /api/sessions/:id/pause` — mid-session pause
 *   - `POST /api/sessions/:id/resume`— mid-session resume
 *
 * The thread-level rollback verb lives in `routes/threads.ts` next to
 * the L4 undo route since both reverse-side handlers share the same
 * `responses` table read pattern.
 *
 * @lore L7 SECURITY (mirrors L4 verdictUndoSchema): identity is
 * server-derived from `c.get("actorId")` — body-supplied `actorId` is
 * rejected by `.strict()`. Callers cannot spoof another founder's
 * recovery action. Required `reason` rationale on every kill / pause
 * verb (resume reason is OPTIONAL). 401 when no actor resolved. 423
 * is NEVER returned by these routes; the recovery surface intentionally
 * bypasses `factoryPausedGuard`.
 */
import type { HyperIdleDb } from "@hyperidle/db";
import type { ApiErrorResponse } from "@hyperidle/shared";
import {
	API_ERROR_CODES,
	factoryPauseRequestSchema,
	factoryResumeRequestSchema,
	sessionPauseRequestSchema,
	sessionResumeRequestSchema,
} from "@hyperidle/shared";
import { Hono } from "hono";
import type { ActorEnv } from "../middleware/actor-context.js";
import { validateBody } from "../middleware/validate.js";
import {
	pauseFactory,
	pauseSession,
	readFactoryState,
	resumeFactory,
	resumeSession,
} from "../services/recovery-service.js";

function unauthorized(): ApiErrorResponse {
	return { error: "No actor identified", code: API_ERROR_CODES.UNAUTHORIZED };
}

export function createFactoryRoutes(db: HyperIdleDb): Hono<ActorEnv> {
	const router = new Hono<ActorEnv>();

	router.get("/state", (c) => {
		const state = readFactoryState(db);
		return c.json(state);
	});

	router.post("/pause", validateBody(factoryPauseRequestSchema), (c) => {
		const actorId = c.get("actorId");
		if (!actorId) return c.json(unauthorized(), 401);
		const body = c.req.valid("json");

		const result = pauseFactory(db, { actorId, reason: body.reason });
		if (!result.ok) {
			return c.json(
				{
					error: "already_paused",
					code: API_ERROR_CODES.CONFLICT,
					pausedBy: result.pausedBy,
					pausedAt: result.pausedAt,
				},
				409,
			);
		}
		return c.json(
			{
				state: "paused" as const,
				pausedAt: result.pausedAt,
				auditId: result.auditId,
				affected: result.affected,
			},
			200,
		);
	});

	// @lore L7: this resume endpoint bypasses the factory-paused
	// guard by mount order — it is registered before the guard
	// middleware is applied (see `app.ts`). Without this, a paused
	// factory could not be resumed (423 from the guard would shadow
	// the 200).
	router.post("/resume", validateBody(factoryResumeRequestSchema), (c) => {
		const actorId = c.get("actorId");
		if (!actorId) return c.json(unauthorized(), 401);
		const body = c.req.valid("json");

		const result = resumeFactory(db, { actorId, reason: body.reason });
		if (!result.ok) {
			return c.json({ error: "not_paused", code: API_ERROR_CODES.CONFLICT }, 409);
		}
		return c.json(
			{ state: "active" as const, resumedAt: result.resumedAt, auditId: result.auditId },
			200,
		);
	});

	return router;
}

export function createSessionRecoveryRoutes(db: HyperIdleDb): Hono<ActorEnv> {
	const router = new Hono<ActorEnv>();

	router.post("/:id/pause", validateBody(sessionPauseRequestSchema), (c) => {
		const actorId = c.get("actorId");
		if (!actorId) return c.json(unauthorized(), 401);
		const sessionId = c.req.param("id");
		const body = c.req.valid("json");

		const result = pauseSession(db, { sessionId, actorId, reason: body.reason });
		if (!result.ok) {
			if (result.reason === "not_found") {
				return c.json({ error: "not_found", code: API_ERROR_CODES.NOT_FOUND }, 404);
			}
			return c.json({ error: "already_paused", code: API_ERROR_CODES.CONFLICT }, 409);
		}
		return c.json(
			{
				state: "paused" as const,
				checkpointAt: result.checkpointAt,
				auditId: result.auditId,
			},
			200,
		);
	});

	router.post("/:id/resume", validateBody(sessionResumeRequestSchema), (c) => {
		const actorId = c.get("actorId");
		if (!actorId) return c.json(unauthorized(), 401);
		const sessionId = c.req.param("id");
		const body = c.req.valid("json");

		const result = resumeSession(db, { sessionId, actorId, reason: body.reason });
		if (!result.ok) {
			if (result.reason === "not_found") {
				return c.json({ error: "not_found", code: API_ERROR_CODES.NOT_FOUND }, 404);
			}
			return c.json({ error: "not_paused", code: API_ERROR_CODES.CONFLICT }, 409);
		}
		return c.json(
			{ state: "active" as const, resumedAt: result.resumedAt, auditId: result.auditId },
			200,
		);
	});

	return router;
}
