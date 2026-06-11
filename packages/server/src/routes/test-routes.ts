import type { Hono } from "hono";
import z from "zod";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";
import { validateBody } from "../middleware/validate.js";

const testBodySchema = z.object({
	name: z.string(),
});

/**
 * Register test-only routes for exercising middleware in tests.
 * These routes are intentionally minimal.
 */
export function registerTestRoutes(api: Hono): void {
	// Protected route — requires auth (handled by auth middleware on /api/*)
	api.get("/protected-test", requireBoundary({ kind: "public-data" }), (c) => c.json({ ok: true }));

	// Validation route
	api.post(
		"/test-validate",
		requireBoundary({ kind: "public-data" }),
		validateBody(testBodySchema),
		(c) => {
			const data = c.req.valid("json" as never);
			return c.json(data);
		},
	);

	// Error route — throws an unhandled error
	api.get("/test-error", requireBoundary({ kind: "public-data" }), () => {
		throw new Error("Something went wrong internally");
	});
}
