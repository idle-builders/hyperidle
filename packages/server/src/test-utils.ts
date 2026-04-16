import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { createApp } from "./app.js";
import type { AppOptions } from "./app.js";

export function createTestApp(options?: AppOptions): Hono {
	return createApp(options);
}

export interface TestAppWithDeps {
	app: Hono;
	db: HyperIdleDb;
	eventBus: EventBus;
}
