/**
 * L2 — GET /api/me. Returns the current actor's identity.
 *
 * 401 when no actor is identifiable. The 404 (header supplied but
 * unknown id) is short-circuited by `createActorContextMiddleware`.
 */
import type { Actor, ApiErrorResponse } from "@hyperidle/shared";
import { API_ERROR_CODES } from "@hyperidle/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { ActorEnv } from "../middleware/actor-context.js";

// @lore L2 review (security CRIT-3 / adversary C3): `domain_tags` is
// JSON-encoded text in the DB; the seed is the sole writer today, but
// future migrations and the planned `PATCH /api/actors/:id` (E-track)
// could write garbage. `z.array(z.string()).parse` validates the
// shape at the read boundary so a corrupt row produces a clear error
// rather than an `as string[]` lie that propagates non-array data to
// the wire.
const domainTagsSchema = z.array(z.string());

export const meRoutes = new Hono<ActorEnv>().get("/", (c) => {
	const row = c.get("actorRow");
	if (!row) {
		const response: ApiErrorResponse = {
			error: "No actor identified",
			code: API_ERROR_CODES.UNAUTHORIZED,
		};
		return c.json(response, 401);
	}

	const parsed: unknown = JSON.parse(row.domainTags);
	const domainTags = domainTagsSchema.parse(parsed);
	const body: Actor = {
		id: row.id,
		role: row.role,
		domain_tags: domainTags,
	};
	return c.json(body);
});
