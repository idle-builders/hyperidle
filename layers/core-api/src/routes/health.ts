import type { HealthResponse } from "@hyperidle/domain-model";
import { type HyperIdleEnv } from "@hyperidle/http-middleware";
import { Hono } from "hono";

const health = new Hono();

health.get("/health", (c) => {
	const response: HealthResponse = {
		status: "ok",
		timestamp: new Date().toISOString(),
	};
	return c.json(response);
});

/**
 * Authenticated health check for shared-mode connectivity validation.
 * Shared-mode clients call this to verify both connectivity AND authentication.
 *
 * @lore P3: GET /api/health/auth sits behind the auth middleware (mounted on
 * /api). It returns the same 200 + { status, timestamp } as the unauthenticated
 * probe, plus the resolved userId. Shared-mode clients use this to validate
 * their shared_backend_key credential.
 */
const authHealth = new Hono<HyperIdleEnv>();

authHealth.get("/auth", (c) => {
	const userId = c.get("userId");
	return c.json({
		status: "ok" as const,
		timestamp: new Date().toISOString(),
		userId,
	});
});

export { authHealth, health };
