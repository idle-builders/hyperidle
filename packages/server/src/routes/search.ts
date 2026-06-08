/**
 * AD7: Global search route — GET /api/search?q=<query>
 *
 * Returns grouped results across conversations (threads), work (bets), and
 * knowledge items. Three separate LIKE queries — not a UNION.
 *
 * @lore AD7: Stub placeholder — implementation added in green phase.
 */
import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import { Hono } from "hono";
import type { HyperIdleEnv } from "../middleware/auth.js";

export function createSearchRoutes(db: HyperIdleDb, _eventBus: EventBus): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	router.get("/", async (c) => {
		void db;
		return c.json({ error: "Not implemented" }, 501);
	});

	return router;
}
