import { factorySettings, type HyperIdleDb, sessions } from "@hyperidle/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";

/**
 * L8 — System Stability aggregate.
 *
 * Returns three counters used by the Rail's system-stability strip:
 *
 * - `crashed_sessions` — count of `sessions.state = 'crashed'`. Sessions
 *   that ended cleanly (`completed`/`failed`) do not count.
 * - `cap_reached` — number of products currently at their cost or session
 *   cap, sourced from `factory_settings['system_stability.cap_reached_products']`.
 *   The cap-reaching evaluator (out of L8 scope) writes the K/V; we just
 *   read it here.
 * - `api_degraded` — boolean (0/1) indicating the upstream model API is
 *   degraded, sourced from `factory_settings['system_stability.api_degraded']`.
 *
 * @lore L8: a dedicated aggregate endpoint instead of a fan-out from the
 * Rail page. Keeps the polling cost predictable (one request per 30s,
 * see useSystemStability) and lets the Rail render before /api/rail
 * finishes. The strip is a SEPARATE concern from active bets / blockers /
 * cost (which already share /api/rail) — different cadence, different
 * data sources, different failure modes.
 */
export interface SystemStabilityResponse {
	crashed_sessions: number;
	cap_reached: number;
	api_degraded: number;
}

const STABILITY_KEY_CAP_REACHED = "system_stability.cap_reached_products";
const STABILITY_KEY_API_DEGRADED = "system_stability.api_degraded";

function readNonNegativeInt(db: HyperIdleDb, key: string): number {
	const row = db.select().from(factorySettings).where(eq(factorySettings.key, key)).get();
	if (!row) return 0;
	const parsed = Number.parseInt(row.value, 10);
	if (!Number.isFinite(parsed) || parsed < 0) return 0;
	return parsed;
}

export function createSystemStabilityRoutes(db: HyperIdleDb): Hono {
	const router = new Hono();

	router.get("/stability", (c) => {
		// @lore L8: count crashed sessions via WHERE state='crashed' rather
		// than loading all sessions and filtering in JS (cf. /api/rail's
		// I6 fix). Sessions tables can grow unbounded over the factory's
		// lifetime — a full-table scan on every poll would be a slow leak.
		const crashedRows = db
			.select({ id: sessions.id })
			.from(sessions)
			.where(and(eq(sessions.state, "crashed")))
			.all();

		const response: SystemStabilityResponse = {
			crashed_sessions: crashedRows.length,
			cap_reached: readNonNegativeInt(db, STABILITY_KEY_CAP_REACHED),
			api_degraded: readNonNegativeInt(db, STABILITY_KEY_API_DEGRADED) > 0 ? 1 : 0,
		};

		return c.json(response);
	});

	return router;
}
