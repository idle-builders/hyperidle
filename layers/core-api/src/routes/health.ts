import type { HealthResponse } from "@hyperidle/domain-model";
import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
import { Hono } from "hono";

const health = new Hono();

health.get("/health", (c) => {
	const response: HealthResponse = {
		status: "ok",
		timestamp: new Date().toISOString(),
	};
	return c.json(response);
});

/** Authenticated health check — verifies both connectivity and authentication. Returns resolved userId. */
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
