/**
 * L2 — PATCH /api/threads/:id/route — reassign a thread to a different
 * actor (or to "either" via null). Writes one `thread_routing_audit`
 * row per state-changing call. Self-reassign (when `to_actor_id`
 * already equals the current `routed_to_actor_id`) returns 200 with
 * `audit: null` — no thread update, no audit row. See `.plan-L2.md`
 * §3.5 for the contract.
 */
import { actors, type HyperIdleDb } from "@hyperidle/db";
import type { ApiErrorResponse } from "@hyperidle/shared";
import { API_ERROR_CODES } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { ActorEnv } from "../middleware/actor-context.js";
import { validateBody } from "../middleware/validate.js";
import { reassignThread } from "../services/thread-routing-service.js";

const routeBodySchema = z.object({
	to_actor_id: z.string().nullable(),
	reason: z.string().min(1).max(500),
});

export function createThreadRoutingRoutes(db: HyperIdleDb): Hono<ActorEnv> {
	const router = new Hono<ActorEnv>();

	router.patch("/:id/route", validateBody(routeBodySchema), (c) => {
		const actorId = c.get("actorId");
		if (!actorId) {
			const response: ApiErrorResponse = {
				error: "No actor identified",
				code: API_ERROR_CODES.UNAUTHORIZED,
			};
			return c.json(response, 401);
		}

		const threadId = c.req.param("id");
		const body = c.req.valid("json");

		// Validate `to_actor_id` references a real actor (when non-null).
		if (body.to_actor_id !== null) {
			const target = db.select().from(actors).where(eq(actors.id, body.to_actor_id)).get();
			if (!target) {
				const response: ApiErrorResponse = {
					error: "Unknown to_actor_id",
					code: API_ERROR_CODES.VALIDATION_ERROR,
					details: { field: "to_actor_id", value: body.to_actor_id },
				};
				return c.json(response, 400);
			}
		}

		const result = reassignThread(db, {
			threadId,
			toActorId: body.to_actor_id,
			reason: body.reason,
			changedBy: actorId,
		});

		if (!result.ok) {
			const response: ApiErrorResponse = {
				error: "Thread not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		return c.json({ ...result.thread, audit: result.audit });
	});

	return router;
}
