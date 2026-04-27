/**
 * L2 — Actor identity resolution middleware.
 *
 * Runs after `authMiddleware` (which validates `X-API-Key`). Resolves
 * the per-request actor id from:
 *   1. The `X-Actor-Id` request header (must reference a row in `actors`).
 *   2. Fallback to the `HYPERIDLE_DEFAULT_ACTOR_ID` env var.
 *   3. Otherwise null — most routes still work; only `/api/me` and
 *      `PATCH /threads/:id/route` require an actor and reject with 401.
 *
 * Sets `c.set("actorId", id | null)` and `c.set("actorRow", row | null)`.
 * The route handlers read these via `c.get("actorId")` / `c.get("actorRow")`.
 *
 * If `X-Actor-Id` is supplied but does not resolve to an actor row,
 * the middleware short-circuits with 404 — the caller asked for a
 * specific identity that does not exist; falling back silently would
 * mask the misconfiguration.
 *
 * @lore L2 — header-based identity is the minimum viable surface (see
 * .plan-L2.md §3.4). Future E-track work replaces only the resolution
 * step here; route handlers remain unchanged because they only read
 * `c.get("actorId")`.
 */
import { type ActorRow, actors, type HyperIdleDb } from "@hyperidle/db";
import type { ApiErrorResponse } from "@hyperidle/shared";
import { API_ERROR_CODES } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";

// biome-ignore lint/style/useNamingConvention: `Variables` is Hono's required PascalCase env key.
export type ActorEnv = { Variables: { actorId: string | null; actorRow: ActorRow | null } };

export function createActorContextMiddleware(db: HyperIdleDb): MiddlewareHandler<ActorEnv> {
	return async (c, next) => {
		// @lore L10 C1: first-run routes MUST execute against a wiped DB —
		// the whole point of the flow is to seed the actor rows. Skip
		// resolution entirely so a stale/preset `HYPERIDLE_DEFAULT_ACTOR_ID`
		// pointing at a not-yet-seeded actor doesn't 404 the bootstrap.
		// Routes that need an actor downstream of first-run will set the
		// `X-Actor-Id` header explicitly.
		if (c.req.path.startsWith("/api/first-run/")) {
			c.set("actorId", null);
			c.set("actorRow", null);
			await next();
			return;
		}

		const headerActorId = c.req.header("X-Actor-Id");
		const envActorId = process.env.HYPERIDLE_DEFAULT_ACTOR_ID;
		const candidate = headerActorId ?? (envActorId && envActorId.length > 0 ? envActorId : null);

		if (candidate === null) {
			c.set("actorId", null);
			c.set("actorRow", null);
			await next();
			return;
		}

		const row = db.select().from(actors).where(eq(actors.id, candidate)).get();
		if (!row) {
			// Header was supplied but no row matches → 404. Env-fallback
			// misconfiguration also lands here, which is the right signal
			// for an operator running with a stale `HYPERIDLE_DEFAULT_ACTOR_ID`.
			const response: ApiErrorResponse = {
				error: "Actor not found",
				code: API_ERROR_CODES.NOT_FOUND,
			};
			return c.json(response, 404);
		}

		c.set("actorId", row.id);
		c.set("actorRow", row);
		await next();
	};
}
