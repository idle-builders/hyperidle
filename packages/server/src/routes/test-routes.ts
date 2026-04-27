import type { Hono } from "hono";
import { z } from "zod";
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
	api.get("/protected-test", (c) => c.json({ ok: true }));

	// Validation route. The `api` param is generic `Hono` (no env type
	// because this is a test mount-point), so `c.req.valid("json" as never)`
	// is still required here — `validateBody`'s typing fix applies only
	// when the route builder participates in chain inference.
	api.post("/test-validate", validateBody(testBodySchema), (c) => {
		const data = c.req.valid("json" as never);
		return c.json(data);
	});

	// Error route — throws an unhandled error
	api.get("/test-error", () => {
		throw new Error("Something went wrong internally");
	});
}
