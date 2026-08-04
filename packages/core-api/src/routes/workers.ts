/**
 * S2: GET /api/workers — returns the list of registered adapters.
 *
 * Auth: requires X-API-Key header matching HYPERIDLE_API_KEY env var.
 * Returns AdapterInfo[] — one entry per registered adapter.
 */

import { type HarnessCapabilityReader, workerConnections } from "@hyperidle/shared";
import { constantTimeStringEqual, requireBoundary } from "@hyperidle/shared/http";
import { Hono } from "hono";

/**
 * Create a Hono router that exposes GET / → AdapterInfo[].
 *
 * The router is mounted at /api/workers by the caller (app.ts).
 * Auth is handled inside the route (X-API-Key header check) so this
 * router can be tested independently without wiring full app middleware.
 */
export function createWorkersRoutes(pool: HarnessCapabilityReader): Hono {
	const router = new Hono();

	router.get("/", requireBoundary({ kind: "public-data" }), (c) => {
		const expectedKey = process.env.HYPERIDLE_API_KEY;
		const providedKey = c.req.header("X-API-Key");

		if (!(expectedKey && providedKey && constantTimeStringEqual(providedKey, expectedKey))) {
			return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
		}

		return c.json(workerConnections(pool));
	});

	return router;
}
