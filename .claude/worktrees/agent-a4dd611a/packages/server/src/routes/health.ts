import type { HealthResponse } from "@hyperidle/shared";
import { Hono } from "hono";

const health = new Hono();

health.get("/health", (c) => {
	const response: HealthResponse = {
		status: "ok",
		timestamp: new Date().toISOString(),
	};
	return c.json(response);
});

export { health };
