/**
 * AD2: GET /api/dispatch-queue — returns the current task dispatch queue snapshot.
 *
 * Auth: protected by the standard X-API-Key auth middleware (mounted on /api/*).
 * Returns: { entries: DispatchQueueEntry[], draining: boolean }
 *
 * Use this to observe which tasks are waiting for agent capacity.
 */

import { getDispatchQueueSnapshot } from "@hyperidle/agent-layer";
import { Hono } from "hono";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";

/**
 * Create a Hono router that exposes GET / → DispatchQueueSnapshot.
 *
 * The router is mounted at /api/dispatch-queue by the caller (app.ts).
 * Auth is provided by the standard auth middleware on /api/*.
 */
export function createDispatchQueueRoutes(): Hono {
	const router = new Hono();

	router.get("/", requireBoundary({ kind: "public-data" }), (c) => {
		const snapshot = getDispatchQueueSnapshot();
		return c.json(snapshot);
	});

	return router;
}
