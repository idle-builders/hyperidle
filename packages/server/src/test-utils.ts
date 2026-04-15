import type { Hono } from "hono";
import { app } from "./app.js";

export function createTestApp(): Hono {
	return app;
}
